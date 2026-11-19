# Gemini TTS Bridge extension for OpenChamber

OpenAI-compatible text-to-speech proxy and voice audition extension for OpenChamber (requires OpenChamber `>=2.7.0`). Lets OpenChamber use Gemini TTS upstreams (such as LiteLLM) through a local OpenAI-compatible endpoint while providing a **Gemini Voices** panel to browse, filter, and preview voices.

## Setup

### 1. Configure your upstream TTS endpoint and API key

Create `~/.config/openchamber/gemini-tts-bridge.json` (or point `BRIDGE_CONFIG_PATH` to a custom file):

```json
{
  "targetUrl": "http://127.0.0.1:4000",
  "apiKey": "your-upstream-api-key",
  "proxyPort": 4005,
  "defaultModel": "google/gemini-3.8-flash-lite-tts",
  "defaultVoice": "Kore"
}
```

Configuration values are resolved in the following order:

| Option | Resolution order | Default |
|---|---|---|
| Config file path | `BRIDGE_CONFIG_PATH` | `~/.config/openchamber/gemini-tts-bridge.json` |
| `targetUrl` | `config.targetUrl` → `BRIDGE_TARGET_URL` → `LITELLM_BASE_URL` | — |
| `apiKey` | `config.apiKey` → `BRIDGE_API_KEY` → `LITELLM_API_KEY` → `~/.config/openchamber/voice-keys.json` (`openaiCompatible` or `openai`) | — |
| `proxyPort` | `config.proxyPort` → `BRIDGE_PORT` → `GEMINI_TTS_PROXY_PORT` | `4005` |
| `defaultModel` | `config.defaultModel` | `google/gemini-3.8-flash-lite-tts` (used by panel previews) |
| `defaultVoice` | `config.defaultVoice` | `Kore` |

On `/v1/audio/speech` and `/v1/models` requests, an incoming `Authorization` header takes precedence over the configured `apiKey` unless it contains `not-required`.

### 2. Add the extension in OpenChamber

1. Build the extension if you have not already (`bun install && bun run build`).
2. Open **Settings → Extensions** in OpenChamber and add the `gemini-tts-bridge` directory.
3. Approve and enable the extension so the local speech proxy starts.

### 3. Connect OpenChamber TTS / Voice settings

In OpenChamber's Voice / TTS settings for an OpenAI-compatible provider, point the endpoint URL to `http://127.0.0.1:4005` (or `http://127.0.0.1:<proxyPort>` if you changed `proxyPort`).

The local proxy exposes:

- `POST /v1/audio/speech` (also `POST /audio/speech`) — synthesizes speech via `targetUrl`, automatically requesting clean PCM/WAV audio and applying pitch-preserving playback speed when `speed` is set (`0.25 < speed <= 4.0`).
- `GET /v1/audio/voices` (also `GET /audio/voices`) — returns the voice list, with optional `category`, `language` / `language_code`, `gender`, `pitch`, and `search` query filters.
- `GET /v1/models` (also `GET /models`) — forwards model listing requests to `targetUrl`.
- `GET /health` and `GET /config` / `POST /config` — inspect bridge health or read/update the JSON config file.

## Using Gemini TTS Bridge in OpenChamber

### Gemini Voices panel

Open the **Gemini Voices** panel to audition voices and copy voice IDs into OpenChamber's voice settings:

- **Featured Studio Voices**: Browse the 30 named studio voices (such as `Kore`, `Puck`, `Charon`, `Fenrir`, `Aoede`, `Zephyr`) with `All`, `Female`, and `Male` tabs.
- **Extended Voice Library**: Browse 2,084 voices across 39 locales (loaded 60 at a time with **Show more**), with filters for locale, context, voice ID role, gender (`Female`, `Male`, `Neutral`), and pitch (`Low`, `Medium`, `High`), plus a **Copy ID** button on each card.
- **Search**: Filter by name, voice ID, style, language, accent, persona, context, pitch, or description. You can also enter comma-separated voice IDs.
- **Preview Phrase & Playback Controls**: Edit custom preview text or pick one of the 4 sample presets (`Sample 1`–`Sample 4`), set playback **Speed** (`0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`), play individual voices, or run **Play All** to audition every matching voice in sequence (with an **Announce voice name** toggle).

### Gemini TTS Work Status section

The **Gemini TTS** section in Work Status shows live proxy diagnostics:

- Active proxy port and configured `targetUrl` (or `unconfigured` if `targetUrl` is not set).
- Request counters (`total`, `ok`, and `failed`).
- Path to the active config file.
- Most recently spoken text snippet and synthesis duration (when available), plus the last error message if a request failed.

## Development

```bash
bun install
bun run build
bun run check
```

## License

MIT — see [LICENSE](./LICENSE).
