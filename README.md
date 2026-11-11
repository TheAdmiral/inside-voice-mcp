# Inside Voice

> [!CAUTION]
> # ⚠️ This project is currently broken
>
> I am actively fixing it. Please do not rely on it until this warning is removed.

Inside Voice is a high-performance Model Context Protocol (MCP) server providing local speech-to-text transcription using whisper.cpp, optimised for Apple Silicon.

## 🎯 Features

- **🏠 100% Local Processing**: No cloud APIs, complete privacy
- **🚀 Apple Silicon Optimised**: 15x+ real-time transcription speed
- **🎤 Speaker Diarisation**: Identify and separate multiple speakers
- **🎵 Universal Audio Support**: Automatic conversion from MP3, M4A, FLAC, and more
- **📝 Multiple Output Formats**: txt, json, vtt, srt, csv
- **💾 Low Memory Footprint**: <2GB memory usage
- **🔧 No Build Step**: Plain JavaScript that runs directly on Node.js

## 🚀 Quick Start

### Prerequisites

- A Mac with Apple Silicon
- Node.js 24.2+
- whisper.cpp (`brew install whisper-cpp`)
- **For audio format conversion**: ffmpeg (`brew install ffmpeg`) – automatically handles MP3, M4A, FLAC, OGG, etc.
- **For speaker diarisation**: uv (`brew install uv`) and a HuggingFace token (free). uv fetches Python and the packages itself

### Supported Audio Formats

- **Native whisper.cpp formats**: WAV, FLAC
- **Auto-converted formats**: MP3, M4A, AAC, OGG, WMA, and more
- **Automatic conversion**: Powered by ffmpeg with 16kHz/mono optimisation for whisper.cpp
- **Format detection**: Automatic format detection and conversion when needed

### Installation

```bash
git clone https://github.com/TheAdmiral/inside-voice-mcp.git
cd inside-voice-mcp
npm install

# Install the base.en model to ~/.inside-voice-mcp/models
npm run models -- install base.en
```

### Managing Models

The model manager lists, installs and deletes whisper models, and shows the size of each one.

```bash
npm run models                          # Show the installed models
npm run models -- available             # Show every model you can install
npm run models -- install               # Choose models to install from a list
npm run models -- install tiny.en small # Or name them
npm run models -- delete                # Choose models to delete from a list
npm run models -- delete small          # Or name them
```

**Regular models** are the standard whisper models, listed in the [model comparison](#model-comparison). **Advanced models** are quantised versions of them, such as `base.en-q5_1`. They are smaller and faster, but slightly less accurate. Both kinds come from the [whisper.cpp repository on Hugging Face](https://huggingface.co/ggerganov/whisper.cpp), and both work with the `transcribe` tool once installed.

### Speaker Diarisation Setup (Optional)

Basic transcription works without any of this. Only speaker diarisation needs it.

1. Install uv, then download Python and the packages (about 1.5 GB):
   ```bash
   brew install uv
   npm run setup:diarization
   ```

2. Get a free HuggingFace token:
   - Create an account at [huggingface.co](https://huggingface.co)
   - Generate a token at [Settings > Access Tokens](https://huggingface.co/settings/tokens)
   - Accept the licences for [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1) and [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)
   - Store the token. You only need to do this once:
     ```bash
     npm run setup:token
     ```

The token is saved in the macOS Keychain. If you would rather not use the Keychain, save it to a private file instead:

```bash
npm run setup:token -- --file
```

This saves it in `~/.inside-voice-mcp/config.json`, readable only by you. It is also used if the Keychain is unavailable. The server refuses to use that file if other users can read it.

The server looks for the token in the `HF_TOKEN` environment variable first, then the Keychain, then the file. Run the `health_check` tool to see which one it found.

To remove a stored token, run `security delete-generic-password -s inside-voice-mcp -a HF_TOKEN` or delete the file.

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "inside-voice": {
      "command": "node",
      "args": ["/path/to/inside-voice-mcp/src/index.js"]
    }
  }
}
```

#### Claude Desktop

If you installed Inside Voice with Homebrew, open the Claude Desktop extension that Homebrew installed and click **Install**:

```bash
open "$(brew --prefix)/share/inside-voice/inside-voice.mcpb"
```

The extension starts the server that Homebrew installed, so `brew upgrade` keeps it up to date. It only works with the Homebrew install. Run `npm run build:mcpb` to build it yourself into `build/inside-voice.mcpb`.

If you installed from source, open **Settings → Developer → Edit Config** and add the configuration above to `claude_desktop_config.json`, then restart the app.

Claude Desktop starts MCP servers with a minimal `PATH`, not the one from your shell. This means it may not find `node`, or may find an older version than Node 24.2. It may also not find `whisper-cli` or `uv`. To avoid this, give the full path to `node` and set `PATH` to include the folder where Homebrew installs them:

```json
{
  "mcpServers": {
    "inside-voice": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/path/to/inside-voice-mcp/src/index.js"],
      "env": {
        "PATH": "/opt/homebrew/bin:/usr/bin:/bin"
      }
    }
  }
}
```

Run `which node whisper-cli uv` in your terminal to see where they are installed on your Mac. Run the `health_check` tool from Claude Desktop to confirm the server can find everything.

#### HTTP clients, such as Jan

Some MCP clients connect to a URL instead of starting the server themselves. For these, run the server over HTTP:

```bash
npm run start:http                   # http://127.0.0.1:3700/mcp
node src/index.js --port 4000        # http://127.0.0.1:4000/mcp
```

With Homebrew, run `brew services start inside-voice` to keep it running in the background and start it when you log in.

In your client, add a Streamable HTTP server with the URL `http://127.0.0.1:3700/mcp`.

The server only accepts connections from your own computer, because its tools can read audio files and write transcripts anywhere you can. It has no password, so any program running on your computer can use it while it is running.

### Environment Variables

- `WHISPER_MODELS_PATH`: Absolute path to your whisper models (default: `~/.inside-voice-mcp/models`)
- `PYTHON_EXECUTABLE`: Your own Python with pyannote.audio, to use for speaker diarisation instead of uv (default: uv)
- `HF_TOKEN`: HuggingFace token for speaker diarisation (default: the token stored by `npm run setup:token`)

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `transcribe` | Audio transcription of any length, with automatic format conversion and optional speaker diarisation |
| `list_models` | Show installed whisper models with their sizes, and the regular models not yet installed |
| `health_check` | System diagnostics |
| `version` | Server version information |

### `transcribe` Parameters

- `audio_path` (string): Path to audio file
- `options` (object, optional):
  - `model` (string): Model to use, regular or advanced, which must be installed (default: 'base.en')
  - `language` (string): Language code (default: 'auto')
  - `output_format` (string): Output format – txt, vtt, srt, json, csv (default: 'txt')
  - `temperature` (number): Sampling temperature 0–1 (default: 0)
  - `threads` (number): CPU threads to use (default: 4)
  - `translate` (boolean): Translate to English (default: false)
  - `word_timestamps` (boolean): Add a `words` array with each word's start and end time to every segment in `metadata.segments` (default: false). Times are approximate, and languages written without spaces get one word per segment.
  - `diarize` (boolean): Identify who is speaking in each segment, which needs the [diarisation setup](#speaker-diarisation-setup-optional) (default: false)
  - `min_speakers` (number): Fewest speakers to look for (default: 1)
  - `max_speakers` (number): Most speakers to look for (default: 10)
  - `use_mps` (boolean): Use MPS acceleration on Apple Silicon when identifying speakers (default: true)

With `diarize`, each format includes the speaker. The speakers found are listed in `metadata.speakers`, and each segment in `metadata.segments` has a `speaker`.

**Example:**
```json
{
  "audio_path": "/path/to/audio.mp3",
  "options": {
    "model": "base.en",
    "output_format": "json",
    "word_timestamps": true,
    "diarize": true,
    "max_speakers": 4
  }
}
```

### Model Comparison

The regular models. Models ending in `.en` only understand English, and the others understand 99 languages.

| Model | Size | Speed | Accuracy | Notes |
|-------|------|-------|----------|-------|
| tiny.en, tiny | 78 MB | ⭐⭐⭐⭐⭐ | ⭐⭐ | Fastest processing |
| base.en, base | 148 MB | ⭐⭐⭐⭐ | ⭐⭐⭐ | Balanced, the default |
| small.en, small | 488 MB | ⭐⭐⭐ | ⭐⭐⭐⭐ | Higher accuracy |
| medium.en, medium | 1.5 GB | ⭐⭐ | ⭐⭐⭐⭐ | High accuracy, slower and larger |
| large-v1 | 3.1 GB | ⭐ | ⭐⭐⭐⭐ | Replaced by large-v2 and large-v3 |
| large-v2 | 3.1 GB | ⭐ | ⭐⭐⭐⭐⭐ | Very accurate but slow |
| large-v3 | 3.1 GB | ⭐ | ⭐⭐⭐⭐⭐ | The most accurate and the slowest |
| large-v3-turbo | 1.6 GB | ⭐⭐ | ⭐⭐⭐⭐⭐ | Much faster than large-v3, weaker at translation |

## 🏗️ Project Structure

```
├── src/                    # JavaScript source code, run directly
│   ├── index.js           # Server entry point
│   ├── http-server.js     # Serves the server over HTTP on localhost
│   ├── models.js          # The model list, and installing and deleting models
│   ├── schemas.js         # Zod schemas for tool options
│   ├── tools/             # MCP tool implementations
│   ├── whisper.js         # whisper.cpp integration
│   └── utils/             # Speaker diarisation & utilities
├── packaging/             # Homebrew formula and the Claude Desktop extension launcher
├── python/                # Diarisation script and Python dependencies
├── scripts/               # Model manager, setup, extension build and manual smoke test
└── test/                  # Tests (node --test)
    └── fixtures/          # Sample audio
```

Whisper models are stored outside the repository, in `~/.inside-voice-mcp/models`.

## 🔧 Development

```bash
# Development mode (restarts on changes)
npm run dev

# Tests
npm test
npm run test:python    # Speaker linking, needs uv

# Linting & formatting
npm run lint
npm run format

# Try the server with MCP Inspector
npx @modelcontextprotocol/inspector@latest node src/index.js

# End-to-end diarisation check (needs the diarisation setup and the base.en model)
node scripts/smoke-diarization.js
```

## 🔍 Troubleshooting

**whisper.cpp not found:**
```bash
brew install whisper-cpp
which whisper-cli
```

**No models found:** run `npm run models -- install base.en`. The `health_check` tool shows which directory the server is looking in.

**Performance issues:**
- Use 4 threads on Apple Silicon for optimal performance
- Ensure adequate memory (2GB+ free)
- Try smaller models for faster processing

## 🤝 Contributing

This project is being substantially reworked, so please [open an issue](https://github.com/TheAdmiral/inside-voice-mcp/issues) to discuss a change before starting on it.

Before submitting a pull request, run these:

```bash
npm run lint
npm test
```

## 📄 Licence

MIT License – see the LICENSE file for details.

## 🙏 Acknowledgements

- [SmartLittleApps](https://github.com/SmartLittleApps) for [local-stt-mcp](https://github.com/SmartLittleApps/local-stt-mcp), the original project this is forked from
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for optimised inference
- [OpenAI Whisper](https://github.com/openai/whisper) for the original models
- [Model Context Protocol](https://modelcontextprotocol.io/) for the framework
- [Pyannote.audio](https://github.com/pyannote/pyannote-audio) for speaker diarisation