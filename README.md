# Inside Voice

> [!CAUTION]
> # ⚠️ This project is currently broken
>
> I am actively fixing it. Please do not rely on it until this warning is removed.

Inside Voice is a high-performance Model Context Protocol (MCP) server providing local speech-to-text transcription using whisper.cpp, optimized for Apple Silicon.

## 🎯 Features

- **🏠 100% Local Processing**: No cloud APIs, complete privacy
- **🚀 Apple Silicon Optimized**: 15x+ real-time transcription speed
- **🎤 Speaker Diarization**: Identify and separate multiple speakers
- **🎵 Universal Audio Support**: Automatic conversion from MP3, M4A, FLAC, and more
- **📝 Multiple Output Formats**: txt, json, vtt, srt, csv
- **💾 Low Memory Footprint**: <2GB memory usage
- **🔧 No Build Step**: Plain JavaScript that runs directly on Node.js

## 🚀 Quick Start

### Prerequisites

- Node.js 24.2+
- whisper.cpp (`brew install whisper-cpp`)
- **For audio format conversion**: ffmpeg (`brew install ffmpeg`) - automatically handles MP3, M4A, FLAC, OGG, etc.
- **For speaker diarization**: Python 3.13 and HuggingFace token (free)

### Supported Audio Formats

- **Native whisper.cpp formats**: WAV, FLAC
- **Auto-converted formats**: MP3, M4A, AAC, OGG, WMA, and more
- **Automatic conversion**: Powered by ffmpeg with 16kHz/mono optimization for whisper.cpp
- **Format detection**: Automatic format detection and conversion when needed

### Installation

```bash
git clone https://github.com/TheAdmiral/inside-voice-mcp.git
cd inside-voice-mcp
npm install

# Download the base.en model to ~/.inside-voice-mcp/models
npm run setup:models

# Or name the models you want
npm run setup:models -- tiny.en small.en
```

### Speaker Diarization Setup (Optional)

Basic transcription works without any of this. Only speaker diarization needs it.

1. Install the Python dependencies in a virtual environment. Use Python 3.13, because the PyTorch version that pyannote needs is not available for the newest Python releases:
   ```bash
   brew install python@3.13
   python3.13 -m venv ~/.inside-voice-mcp/venv
   ~/.inside-voice-mcp/venv/bin/pip install -r python/requirements.txt
   ```

2. Tell the server to use that Python by adding `PYTHON_EXECUTABLE` to your MCP client configuration, using the full path to your home directory:
   ```json
   "env": { "PYTHON_EXECUTABLE": "/Users/you/.inside-voice-mcp/venv/bin/python" }
   ```

3. Get a free HuggingFace token:
   - Create an account at [huggingface.co](https://huggingface.co)
   - Generate a token at [Settings > Access Tokens](https://huggingface.co/settings/tokens)
   - Accept the licenses for [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1) and [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)
   - Store the token. You only need to do this once:
     ```bash
     npm run setup:token
     ```

The token is saved in the macOS Keychain. If the Keychain is unavailable, for example on Linux, it is saved in `~/.inside-voice-mcp/config.json` instead, readable only by you. The server refuses to use that file if other users can read it.

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

### Environment Variables

- `WHISPER_MODELS_PATH`: Absolute path to your whisper models (default: `~/.inside-voice-mcp/models`)
- `PYTHON_EXECUTABLE`: Python to use for speaker diarization (default: the first one found that has pyannote.audio)
- `HF_TOKEN`: HuggingFace token for speaker diarization (default: the token stored by `npm run setup:token`)

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `transcribe` | Audio transcription of any length, with automatic format conversion and optional speaker diarization |
| `list_models` | Show available whisper models |
| `health_check` | System diagnostics |
| `version` | Server version information |

### `transcribe` Parameters

- `audio_path` (string): Path to audio file
- `options` (object, optional):
  - `model` (string): Model to use (default: 'base.en')
  - `language` (string): Language code (default: 'auto')
  - `output_format` (string): Output format - txt, vtt, srt, json, csv (default: 'txt')
  - `temperature` (number): Sampling temperature 0-1 (default: 0)
  - `threads` (number): CPU threads to use (default: 4)
  - `translate` (boolean): Translate to English (default: false)
  - `word_timestamps` (boolean): Add a `words` array with each word's start and end time to every segment in `metadata.segments` (default: false). Times are approximate, and languages written without spaces get one word per segment.
  - `diarize` (boolean): Identify who is speaking in each segment, which needs the [diarization setup](#speaker-diarization-setup-optional) (default: false)
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

| Model | Size | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| tiny.en | 39MB | ⭐⭐⭐⭐⭐ | ⭐⭐ | Quick transcription |
| base.en | 142MB | ⭐⭐⭐⭐ | ⭐⭐⭐ | Balanced performance |
| small.en | 488MB | ⭐⭐⭐ | ⭐⭐⭐⭐ | High accuracy |

## 🏗️ Project Structure

```
├── src/                    # JavaScript source code, run directly
│   ├── index.js           # Server entry point
│   ├── schemas.js         # Zod schemas for tool options
│   ├── tools/             # MCP tool implementations
│   ├── whisper.js         # whisper.cpp integration
│   └── utils/             # Speaker diarization & utilities
├── python/                # Diarization script and Python dependencies
├── scripts/               # Model download and manual smoke test
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

# Linting & formatting
npm run lint
npm run format

# Try the server with MCP Inspector
npx @modelcontextprotocol/inspector@latest node src/index.js

# End-to-end diarization check (needs the diarization setup and the base.en model)
node scripts/smoke-diarization.js
```

## 🔍 Troubleshooting

**whisper.cpp not found:**
```bash
brew install whisper-cpp
which whisper-cli
```

**No models found:** run `npm run setup:models`. The `health_check` tool shows which directory the server is looking in.

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

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- [SmartLittleApps](https://github.com/SmartLittleApps) for [local-stt-mcp](https://github.com/SmartLittleApps/local-stt-mcp), the original project this is forked from
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for optimized inference
- [OpenAI Whisper](https://github.com/openai/whisper) for the original models
- [Model Context Protocol](https://modelcontextprotocol.io/) for the framework
- [Pyannote.audio](https://github.com/pyannote/pyannote-audio) for speaker diarization