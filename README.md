# Gemini TTS Bridge

OpenAI-compatible speech proxy and voice audition extension for [OpenChamber](https://github.com/btriapitsyn/openchamber) (`@openchamber/sdk`, `apiVersion: 1`, requires OpenChamber `>=2.7.0`).

It pairs an OpenAI-compatible `/v1/audio/speech` proxy for Gemini TTS upstreams (such as LiteLLM) with a **Gemini Voices** panel for browsing, filtering, and auditioning voices.

## Features & Surfaces

- **Panel (`panel/index.html` → `panel/main.js`, ID `gemini-voices`, title `Gemini Voices`)**:
  - **Featured Studio Voices**: 30 studio voices with gender filter tabs (`All`, `Female`, `Male`).
  - **Extended Voice Library**: 2,084 voices (`panel/extended-voices.json`) across 39 locales, paginated 60 per page, with filters for locale, context, voice ID role, gender, and pitch, plus one-click `Copy ID`.
  - Live search across voice ID, name, style, language, accent, persona, context, pitch, and description (including comma-separated ID queries).
  - Preview phrase editor with 4 sample presets, playback speed selector (`0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`), single-voice Play/Stop, and sequential **Play All** auditioning with an optional `Announce voice name` toggle.
- **Work Status (`statusSection`, title `Gemini TTS`)**:
  - Polls `GET /status` on the host service every 5,000 ms to display configured proxy port and `targetUrl`, request/success/failure counts, config file path, last spoken text/duration, and last error.
- **Host Service & Speech Proxy (`service/main.js`, `runtime: "host"`, `keepRunning: true`)**:
  - **OpenChamber Guest Service** (binds to `127.0.0.1:$OPENCHAMBER_SERVICE_PORT` when `OPENCHAMBER_SERVICE_PORT` is set; enforces `Authorization: Bearer $OPENCHAMBER_SERVICE_TOKEN` when `OPENCHAMBER_SERVICE_TOKEN` is set):
    - `GET /health` — Returns `{ status: "ok", healthy }`.
    - `GET /status` — Returns Work Status rows.
    - `GET /v1/audio/voices` and `GET /audio/voices` — Returns the voice catalog (supports `category`, `language` / `language_code`, `gender`, `pitch`, and `search` query params).
    - `POST /preview` — Synthesizes audio via `${targetUrl}/v1/audio/speech` (default model `google/gemini-3.8-flash-lite-tts`, default voice `Kore`, `response_format: "pcm"`) and returns `{ ok, voice, durationMs, audioBase64, contentType: "audio/wav" }`.
  - **OpenAI-Compatible Speech Proxy** (binds to `127.0.0.1:<proxyPort>`, default `4005`):
    - `GET /health` — Returns `{ status, service, proxyPort, targetUrl, configured, configFile }`.
    - `GET /config` / `POST /config` — Reads or merges updates into the JSON config file.
    - `GET /v1/audio/voices` and `GET /audio/voices` — Filtered voice listing.
    - `GET /v1/models` and `GET /models` — Proxies to `${targetUrl}/v1/models` (requires `targetUrl`).
    - `POST /preview` — Synthesizes a processed WAV preview (requires `targetUrl`).
    - `POST /v1/audio/speech` and `POST /audio/speech` — Rewrites omitted/`mp3`/`wav` `response_format` to `"pcm"` (preventing LiteLLM from prepending a redundant second WAV header over Google's WAV stream), applies `defaultModel`/`defaultVoice` from config if omitted, and forwards to `${targetUrl}/v1/audio/speech`.
  - **Audio Post-Processing (`processWavAudio`)**:
    - Unwraps redundant nested 44-byte `RIFF`/`WAVE` headers and wraps raw PCM in a 24 kHz 16-bit mono WAV header when needed.
    - Strips appended `C2PA` provenance manifest bytes and updates `RIFF`/`data` chunk sizes.
    - Applies pure-TypeScript WSOLA (Waveform Similarity Overlap-Add) pitch-preserving time-stretching on 16-bit mono PCM when `0.25 < speed <= 4.0` and `|speed - 1.0| >= 0.02`.

## Configuration & Environment Variables

Configuration is resolved from `$BRIDGE_CONFIG_PATH` (default: `~/.config/openchamber/gemini-tts-bridge.json`) and environment variables. `apiKey` also falls back to `~/.config/openchamber/voice-keys.json` (`openaiCompatible` or `openai`).

Example `gemini-tts-bridge.json`:

```json
{
  "targetUrl": "http://127.0.0.1:4000",
  "apiKey": "your-upstream-api-key",
  "proxyPort": 4005,
  "defaultModel": "google/gemini-3.8-flash-lite-tts",
  "defaultVoice": "Kore"
}
```

Precedence:

| Setting | Resolution Order | Default |
| --- | --- | --- |
| Config file path | `BRIDGE_CONFIG_PATH` | `~/.config/openchamber/gemini-tts-bridge.json` |
| `targetUrl` | `config.targetUrl` → `BRIDGE_TARGET_URL` → `LITELLM_BASE_URL` | — |
| `apiKey` | `config.apiKey` → `BRIDGE_API_KEY` → `LITELLM_API_KEY` → `~/.config/openchamber/voice-keys.json` (`openaiCompatible` / `openai`) | — (incoming `Authorization` header takes precedence on proxy `/v1/audio/speech` & `/v1/models` unless it includes `not-required`) |
| `proxyPort` | `config.proxyPort` → `BRIDGE_PORT` → `GEMINI_TTS_PROXY_PORT` | `4005` |
| `defaultModel` | `config.defaultModel` | `google/gemini-3.8-flash-lite-tts` (on `/preview`) |
| `defaultVoice` | `config.defaultVoice` | `Kore` (on `/preview` and `/v1/audio/voices` `default_voice`) |

When launched by OpenChamber, the host injects `OPENCHAMBER_SERVICE_PORT` and `OPENCHAMBER_SERVICE_TOKEN`.

## Development

```bash
bun install
bun run build   # Bundle panel/main.js and service/main.js
bun run check   # Run openchamber-guest-check
```

## License

MIT — see [LICENSE](./LICENSE).
