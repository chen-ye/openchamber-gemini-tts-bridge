import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ALL_VOICES, type VoiceItem } from '../shared/voices';

// Path to external config file
const CONFIG_FILE = process.env.BRIDGE_CONFIG_PATH
  || path.join(os.homedir(), '.config', 'openchamber', 'gemini-tts-bridge.json');

// Path to OpenChamber's existing voice keys store
const VOICE_KEYS_FILE = path.join(os.homedir(), '.config', 'openchamber', 'voice-keys.json');

export interface BridgeConfig {
  targetUrl?: string;
  apiKey?: string;
  proxyPort?: number;
  defaultModel?: string;
  defaultVoice?: string;
}

/**
 * Resolves configuration from external files and environment variables.
 * Contains no hardcoded targets, endpoints, models, or credentials.
 */
export function getBridgeConfig(): BridgeConfig {
  let fileConfig: Partial<BridgeConfig> = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      fileConfig = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[gemini-tts-bridge] Failed to read config file:', err);
  }

  // Fallback: check OpenChamber's voice-keys.json for an openaiCompatible API key
  let fallbackApiKey: string | undefined = undefined;
  try {
    if (fs.existsSync(VOICE_KEYS_FILE)) {
      const raw = fs.readFileSync(VOICE_KEYS_FILE, 'utf-8');
      const keys = JSON.parse(raw);
      fallbackApiKey = keys.openaiCompatible || keys.openai;
    }
  } catch {
    // Ignore voice-keys read failure
  }

  const targetUrl = fileConfig.targetUrl
    || process.env.BRIDGE_TARGET_URL
    || process.env.LITELLM_BASE_URL;

  const apiKey = fileConfig.apiKey
    || process.env.BRIDGE_API_KEY
    || process.env.LITELLM_API_KEY
    || fallbackApiKey;

  const proxyPort = fileConfig.proxyPort
    || (process.env.BRIDGE_PORT ? parseInt(process.env.BRIDGE_PORT, 10) : undefined)
    || (process.env.GEMINI_TTS_PROXY_PORT ? parseInt(process.env.GEMINI_TTS_PROXY_PORT, 10) : undefined)
    || 4005;

  return {
    targetUrl: targetUrl ? targetUrl.replace(/\/+$/, '') : undefined,
    apiKey,
    proxyPort,
    defaultModel: fileConfig.defaultModel,
    defaultVoice: fileConfig.defaultVoice,
  };
}

const initialConfig = getBridgeConfig();
const TTS_PROXY_PORT = initialConfig.proxyPort || 4005;

// Metrics tracker for status section
const stats = {
  requests: 0,
  successful: 0,
  failed: 0,
  lastDurationMs: 0,
  lastSpokenText: '',
  healthy: true,
  lastError: '',
};

// -----------------------------------------------------------------------------
// 1. OpenChamber Guest Service Host
// Listens on process.env.OPENCHAMBER_SERVICE_PORT for host RPCs (/health, /status)
// -----------------------------------------------------------------------------
const serviceToken = process.env.OPENCHAMBER_SERVICE_TOKEN;
const servicePort = process.env.OPENCHAMBER_SERVICE_PORT ? parseInt(process.env.OPENCHAMBER_SERVICE_PORT, 10) : null;

if (servicePort) {
  const serviceServer = http.createServer((req, res) => {
    if (serviceToken && req.headers.authorization !== `Bearer ${serviceToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (reqUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        status: 'ok',
        healthy: stats.healthy,
      }));
      return;
    }

    if (reqUrl.pathname === '/status') {
      const currentConfig = getBridgeConfig();
      const statusValue = currentConfig.targetUrl
        ? `Port ${TTS_PROXY_PORT} -> ${currentConfig.targetUrl}`
        : `Port ${TTS_PROXY_PORT} (unconfigured)`;

      const rows: any[] = [
        {
          kind: 'line',
          id: 'tts-bridge',
          label: 'Gemini TTS Bridge',
          dot: currentConfig.targetUrl && stats.healthy ? 'success' : 'warning',
          value: statusValue.slice(0, 80),
        },
        {
          kind: 'line',
          id: 'tts-requests',
          label: 'Requests processed',
          dot: stats.failed > 0 ? 'warning' : 'default',
          value: `${stats.requests} (${stats.successful} ok${stats.failed > 0 ? `, ${stats.failed} failed` : ''})`.slice(0, 80),
        },
        {
          kind: 'note',
          id: 'config-path',
          text: `Config: ${CONFIG_FILE}`.slice(0, 200),
          tone: 'muted',
        },
      ];

      if (stats.lastSpokenText) {
        rows.push({
          kind: 'note',
          id: 'last-spoken',
          text: `Last spoken: "${stats.lastSpokenText.slice(0, 70)}${stats.lastSpokenText.length > 70 ? '...' : ''}" (${stats.lastDurationMs}ms)`.slice(0, 200),
          tone: stats.healthy ? 'info' : 'warning',
        });
      }

      if (stats.lastError) {
        rows.push({
          kind: 'note',
          id: 'last-error',
          text: `Last error: ${stats.lastError.slice(0, 100)}`.slice(0, 200),
          tone: 'error',
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ rows }));
      return;
    }

    if (req.method === 'GET' && (reqUrl.pathname === '/v1/audio/voices' || reqUrl.pathname === '/audio/voices')) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(buildVoicesPayload(reqUrl, getBridgeConfig())));
      return;
    }

    if (reqUrl.pathname === '/preview' && req.method === 'POST') {
      let bodyRaw = '';
      req.on('data', (c) => { bodyRaw += c; });
      req.on('end', async () => {
        try {
          const { voice, input, speed } = JSON.parse(bodyRaw || '{}');
          const currentConfig = getBridgeConfig();
          if (!currentConfig.targetUrl) {
            res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Bridge targetUrl is not configured' }));
            return;
          }

          const payload = {
            model: currentConfig.defaultModel || 'google/gemini-3.8-flash-lite-tts',
            voice: voice || currentConfig.defaultVoice || 'Kore',
            input: input || 'Hello from Gemini.',
            speed: typeof speed === 'number' ? speed : 1.0,
            response_format: 'pcm',
          };

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (currentConfig.apiKey) headers['Authorization'] = `Bearer ${currentConfig.apiKey}`;

          const t0 = Date.now();
          const upstreamRes = await fetch(`${currentConfig.targetUrl}/v1/audio/speech`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });

          if (!upstreamRes.ok) {
            const errText = await upstreamRes.text();
            res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: errText }));
            return;
          }

          const rawArrayBuffer = await upstreamRes.arrayBuffer();
          const cleanBuffer = processWavAudio(Buffer.from(rawArrayBuffer), payload.speed);
          const durationMs = Date.now() - t0;

          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
            ok: true,
            voice: payload.voice,
            durationMs,
            audioBase64: cleanBuffer.toString('base64'),
            contentType: 'audio/wav',
          }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err?.message || 'Preview generation failed' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not Found' }));
  });

  serviceServer.listen(servicePort, '127.0.0.1', () => {
    console.log(`[gemini-tts-bridge] OpenChamber host service listening on 127.0.0.1:${servicePort}`);
  });
}

/**
 * Pure TypeScript WSOLA (Waveform Similarity Overlap-Add) algorithm.
 * Time-stretches 16-bit mono PCM audio while preserving pitch and formants.
 * Zero external dependencies; runs directly on TypedArrays in Bun.
 */
function wsola(samples: Int16Array, speed: number, sampleRate = 24000): Int16Array {
  if (Math.abs(speed - 1.0) < 0.02) return samples;

  const winSize = Math.round(sampleRate * 0.025); // 25ms window (600 samples at 24kHz)
  const hopOut = Math.round(winSize / 2);         // 12.5ms output hop (300 samples)
  const hopIn = Math.round(hopOut * speed);       // Scaled input hop
  const maxSearch = Math.round(sampleRate * 0.012); // ~12ms search window (288 samples)

  const outLen = Math.round(samples.length / speed);
  const output = new Float32Array(outLen + winSize);
  const weights = new Float32Array(outLen + winSize);

  // Precompute Hann analysis window
  const window = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  let inPos = 0;
  let outPos = 0;

  while (outPos < outLen && inPos + winSize + maxSearch < samples.length) {
    let bestOffset = 0;
    if (outPos > 0) {
      // Find offset that maximizes waveform similarity with previous output
      let minDiff = Infinity;
      const refIdx = outPos;

      for (let offset = -maxSearch; offset <= maxSearch; offset++) {
        const candIdx = inPos + offset;
        if (candIdx < 0 || candIdx + hopOut >= samples.length) continue;

        let diff = 0;
        for (let i = 0; i < hopOut; i += 4) {
          const d = samples[candIdx + i] - output[refIdx + i];
          diff += Math.abs(d);
          if (diff >= minDiff) break;
        }
        if (diff < minDiff) {
          minDiff = diff;
          bestOffset = offset;
        }
      }
    }

    const startIdx = inPos + bestOffset;
    for (let i = 0; i < winSize; i++) {
      if (startIdx + i < samples.length && outPos + i < output.length) {
        output[outPos + i] += samples[startIdx + i] * window[i];
        weights[outPos + i] += window[i];
      }
    }

    inPos += hopIn;
    outPos += hopOut;
  }

  const result = new Int16Array(outPos);
  for (let i = 0; i < outPos; i++) {
    const w = weights[i];
    const val = w > 0.0001 ? output[i] / w : output[i];
    result[i] = Math.max(-32768, Math.min(32767, Math.round(val)));
  }
  return result;
}

/**
 * 1. Strips appended non-audio metadata (Google C2PA / SynthID manifest) from the WAV data chunk.
 * 2. Applies pitch-preserving tempo adjustment (WSOLA) if speed != 1.0.
 * 3. Reconstructs exact RIFF and data chunk length headers.
 */
function processWavAudio(buffer: Buffer, speed?: number): Buffer {
  // Detect and unwrap redundant nested WAV header (when LiteLLM prepends a 44-byte WAV header onto Google's native WAV stream)
  if (
    buffer.length >= 88 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE' &&
    buffer.subarray(44, 48).toString('ascii') === 'RIFF' &&
    buffer.subarray(52, 56).toString('ascii') === 'WAVE'
  ) {
    buffer = Buffer.from(buffer.subarray(44));
  }

  // If buffer is raw PCM (doesn't start with RIFF), wrap in a WAV header
  if (buffer.length < 44 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    const sampleRate = 24000;
    const channels = 1;
    const pcmData = buffer;
    const dataSize = pcmData.length;
    const riffSize = 36 + dataSize;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(riffSize, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * 2, 28);
    header.writeUInt16LE(channels * 2, 32);
    header.writeUInt16LE(16, 34); // 16-bit
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(dataSize, 40);
    buffer = Buffer.concat([header, pcmData]);
  }

  // Look for C2PA provenance metadata marker
  const c2paMarker = Buffer.from('C2PA');
  const c2paIdx = buffer.indexOf(c2paMarker);
  let cleanPcmEnd = c2paIdx > 44 ? c2paIdx : buffer.length;
  // Ensure 16-bit alignment
  if ((cleanPcmEnd - 44) % 2 !== 0) {
    cleanPcmEnd -= 1;
  }

  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  // If 16-bit mono and speed scaling requested, apply WSOLA time-stretch
  if (
    channels === 1 &&
    bitsPerSample === 16 &&
    typeof speed === 'number' &&
    Number.isFinite(speed) &&
    speed > 0.25 &&
    speed <= 4.0 &&
    Math.abs(speed - 1.0) >= 0.02
  ) {
    const pcmBuffer = buffer.subarray(44, cleanPcmEnd);
    const inSamples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
    const stretchedSamples = wsola(inSamples, speed, sampleRate);

    const newPcmByteLength = stretchedSamples.length * 2;
    const newRiffSize = 36 + newPcmByteLength;

    const outBuffer = Buffer.alloc(44 + newPcmByteLength);
    buffer.copy(outBuffer, 0, 0, 44);
    outBuffer.writeUInt32LE(newRiffSize, 4);
    outBuffer.writeUInt32LE(newPcmByteLength, 40);

    const outView = new Int16Array(outBuffer.buffer, outBuffer.byteOffset + 44, stretchedSamples.length);
    outView.set(stretchedSamples);
    return outBuffer;
  }

  // Clean WAV without speed change
  const cleanDataSize = cleanPcmEnd - 44;
  const cleanRiffSize = 36 + cleanDataSize;
  const cleanBuffer = Buffer.from(buffer.subarray(0, cleanPcmEnd));
  cleanBuffer.writeUInt32LE(cleanRiffSize, 4);
  cleanBuffer.writeUInt32LE(cleanDataSize, 40);
  return cleanBuffer;
}

function buildVoicesPayload(reqUrl: URL, currentConfig: ReturnType<typeof getBridgeConfig>) {
  const category = reqUrl.searchParams.get('category')?.toLowerCase() || '';
  const language = (reqUrl.searchParams.get('language') || reqUrl.searchParams.get('language_code') || '').toLowerCase();
  const gender = reqUrl.searchParams.get('gender')?.toLowerCase() || '';
  const pitch = reqUrl.searchParams.get('pitch')?.toLowerCase() || '';
  const search = reqUrl.searchParams.get('search')?.trim().toLowerCase() || '';

  const filtered = ALL_VOICES.filter((v: VoiceItem) => {
    if (category && v.category !== category) return false;
    if (language && !v.languageCode.toLowerCase().startsWith(language)) return false;
    if (gender && v.gender !== gender) return false;
    if (pitch && v.pitch !== pitch) return false;
    if (search) {
      const hay = `${v.id} ${v.name} ${v.accent} ${v.persona} ${v.description}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  return {
    object: 'list',
    default_voice: currentConfig.defaultVoice || 'Kore',
    voices: filtered.map((v) => ({
      id: v.id,
      name: v.category === 'featured' ? v.name : `${v.name} — ${v.accent} (${v.id})`,
      display_name: v.name,
      category: v.category,
      language: v.languageCode,
      language_label: v.language,
      gender: v.gender,
      accent: v.accent,
      style: v.style,
      persona: v.persona,
      context: v.context ?? null,
      pitch: v.pitch,
      description: v.description,
    })),
  };
}

// -----------------------------------------------------------------------------
// 2. OpenAI-Compatible Speech Proxy Server
// Listens on 127.0.0.1:<TTS_PROXY_PORT>, rewrites response_format: 'mp3' -> 'wav',
// and forwards to the configured targetUrl
// -----------------------------------------------------------------------------
const proxyServer = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${TTS_PROXY_PORT}`);
  const currentConfig = getBridgeConfig();

  // Health check for proxy
  if (req.method === 'GET' && reqUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      status: 'ok',
      service: 'gemini-tts-bridge',
      proxyPort: TTS_PROXY_PORT,
      targetUrl: currentConfig.targetUrl || null,
      configured: Boolean(currentConfig.targetUrl),
      configFile: CONFIG_FILE,
    }));
    return;
  }

  // Get or update configuration via HTTP
  if (reqUrl.pathname === '/config') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(currentConfig, null, 2));
      return;
    }
    if (req.method === 'POST') {
      let bodyRaw = '';
      req.on('data', (c) => { bodyRaw += c; });
      req.on('end', () => {
        try {
          const updates = JSON.parse(bodyRaw);
          const newConfig = { ...currentConfig, ...updates };
          fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, config: newConfig }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err?.message || 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  // OpenAI-compatible voices listing (Open WebUI / Kokoro-FastAPI / Speaches convention)
  if (req.method === 'GET' && (reqUrl.pathname === '/v1/audio/voices' || reqUrl.pathname === '/audio/voices')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(buildVoicesPayload(reqUrl, currentConfig)));
    return;
  }

  // Target URL must be configured for forwarding
  if (!currentConfig.targetUrl) {
    res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      error: 'Bridge targetUrl is not configured. Set "targetUrl" in ' + CONFIG_FILE + ' or via BRIDGE_TARGET_URL / LITELLM_BASE_URL.',
    }));
    return;
  }

  // Models listing fallback
  if (req.method === 'GET' && (reqUrl.pathname === '/v1/models' || reqUrl.pathname === '/models')) {
    try {
      const headers: Record<string, string> = {};
      if (req.headers.authorization && !req.headers.authorization.includes('not-required')) {
        headers['Authorization'] = req.headers.authorization;
      } else if (currentConfig.apiKey) {
        headers['Authorization'] = `Bearer ${currentConfig.apiKey}`;
      }

      const response = await fetch(`${currentConfig.targetUrl}/v1/models`, { headers });
      const data = await response.json();
      res.writeHead(response.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    } catch (err: any) {
      res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: `Upstream unreachable: ${err?.message}` }));
    }
    return;
  }

  // Audio preview endpoint for demoing voices
  if (req.method === 'POST' && reqUrl.pathname === '/preview') {
    let bodyRaw = '';
    req.on('data', (c) => { bodyRaw += c; });
    req.on('end', async () => {
      try {
        const { voice, input, speed } = JSON.parse(bodyRaw || '{}');
        const payload = {
          model: currentConfig.defaultModel || 'google/gemini-3.8-flash-lite-tts',
          voice: voice || currentConfig.defaultVoice || 'Kore',
          input: input || 'Hello from Gemini.',
          speed: typeof speed === 'number' ? speed : 1.0,
          response_format: 'pcm',
        };

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (currentConfig.apiKey) headers['Authorization'] = `Bearer ${currentConfig.apiKey}`;

        const t0 = Date.now();
        const upstreamRes = await fetch(`${currentConfig.targetUrl}/v1/audio/speech`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text();
          res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: errText }));
          return;
        }

        const rawArrayBuffer = await upstreamRes.arrayBuffer();
        const cleanBuffer = processWavAudio(Buffer.from(rawArrayBuffer), payload.speed);
        const durationMs = Date.now() - t0;

        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
          ok: true,
          voice: payload.voice,
          durationMs,
          audioBase64: cleanBuffer.toString('base64'),
          contentType: 'audio/wav',
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err?.message || 'Preview generation failed' }));
      }
    });
    return;
  }

  // Audio speech endpoint
  if (req.method === 'POST' && (reqUrl.pathname === '/v1/audio/speech' || reqUrl.pathname === '/audio/speech')) {
    const startTime = Date.now();
    stats.requests += 1;

    let bodyRaw = '';
    req.on('data', (chunk) => {
      bodyRaw += chunk;
    });

    req.on('end', async () => {
      try {
        let payload: Record<string, any> = {};
        if (bodyRaw) {
          try {
            payload = JSON.parse(bodyRaw);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
          }
        }

        // PRIMARY TRANSFORMATION:
        // OpenAI clients request response_format='mp3', but Gemini TTS upstream produces a complete WAV stream.
        // Requesting 'pcm' prevents LiteLLM from prepending a redundant second WAV header over Google's WAV stream.
        if (!payload.response_format || payload.response_format === 'mp3' || payload.response_format === 'wav') {
          payload.response_format = 'pcm';
        }

        // Apply defaults only if explicitly defined in external config
        if (!payload.model && currentConfig.defaultModel) {
          payload.model = currentConfig.defaultModel;
        }
        if (!payload.voice && currentConfig.defaultVoice) {
          payload.voice = currentConfig.defaultVoice;
        }

        stats.lastSpokenText = typeof payload.input === 'string' ? payload.input : '';

        // Resolve authorization header: prefer incoming header, then configured key
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (req.headers.authorization && !req.headers.authorization.includes('not-required')) {
          headers['Authorization'] = req.headers.authorization;
        } else if (currentConfig.apiKey) {
          headers['Authorization'] = `Bearer ${currentConfig.apiKey}`;
        }

        const targetEndpoint = `${currentConfig.targetUrl}/v1/audio/speech`;
        const upstreamRes = await fetch(targetEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        const duration = Date.now() - startTime;
        stats.lastDurationMs = duration;

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text();
          stats.failed += 1;
          stats.healthy = false;
          stats.lastError = errText;
          res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' }).end(errText);
          return;
        }

        stats.successful += 1;
        stats.healthy = true;
        stats.lastError = '';

        const rawArrayBuffer = await upstreamRes.arrayBuffer();
        const rawBuffer = Buffer.from(rawArrayBuffer);
        const cleanBuffer = processWavAudio(rawBuffer, payload.speed);

        const contentType = upstreamRes.headers.get('content-type') || 'audio/wav';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': cleanBuffer.length,
          'Cache-Control': 'no-cache',
        });
        res.end(cleanBuffer);
      } catch (err: any) {
        stats.failed += 1;
        stats.healthy = false;
        stats.lastError = err?.message || 'Internal proxy error';
        console.error('[gemini-tts-bridge] Proxy error:', err);
        res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err?.message || 'Proxy error' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Endpoint not found' }));
});

proxyServer.listen(TTS_PROXY_PORT, '127.0.0.1', () => {
  console.log(`[gemini-tts-bridge] Speech Proxy listening on http://127.0.0.1:${TTS_PROXY_PORT}`);
});
