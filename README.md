# Local Speech-to-Text MCP Server

> [!CAUTION]
> # ⚠️ This project is currently broken
>
> I am actively fixing it. Please do not rely on it until this warning is removed.

A high-performance Model Context Protocol (MCP) server providing local speech-to-text transcription using whisper.cpp, optimized for Apple Silicon.

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
- **For speaker diarization**: Python 3.8+ and HuggingFace token (free)

### Supported Audio Formats

- **Native whisper.cpp formats**: WAV, FLAC
- **Auto-converted formats**: MP3, M4A, AAC, OGG, WMA, and more
- **Automatic conversion**: Powered by ffmpeg with 16kHz/mono optimization for whisper.cpp
- **Format detection**: Automatic format detection and conversion when needed

### Installation

```bash
git clone https://github.com/TheAdmiral/local-stt-mcp.git
cd local-stt-mcp/mcp-server
npm install

# Download whisper models
npm run setup:models

# For speaker diarization, set HuggingFace token
export HF_TOKEN="your_token_here"  # Get free token from huggingface.co
```

**Speaker Diarization Note**: Requires HuggingFace account and accepting [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1) license.

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "whisper-mcp": {
      "command": "node",
      "args": ["path/to/local-stt-mcp/mcp-server/src/index.js"]
    }
  }
}
```

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `transcribe` | Basic audio transcription with automatic format conversion |
| `transcribe_long` | Long audio file processing with chunking and format conversion |
| `transcribe_with_speakers` | Speaker diarization and transcription with format support |
| `list_models` | Show available whisper models |
| `health_check` | System diagnostics |
| `version` | Server version information |

## 📊 Performance

**Apple Silicon Benchmarks:**
- **Processing Speed**: 15.8x real-time (vs WhisperX 5.5x)
- **Memory Usage**: <2GB (vs WhisperX ~4GB)
- **GPU Acceleration**: ✅ Apple Neural Engine
- **Setup**: Medium complexity but superior performance

See `/benchmarks/` for detailed performance comparisons.

## 🏗️ Project Structure

```
mcp-server/
├── src/                    # JavaScript source code, run directly
│   ├── index.js           # Server entry point
│   ├── schemas.js         # Zod schemas for tool options
│   ├── tools/             # MCP tool implementations
│   ├── whisper/           # whisper.cpp integration
│   └── utils/             # Speaker diarization & utilities
├── python/                # Diarization script and Python dependencies
└── test/                  # Tests (node --test)
```

## 🔧 Development

```bash
# Development mode (restarts on changes)
npm run dev

# Tests
npm test

# Linting & formatting
npm run lint
npm run format
```

## 🤝 Contributing

This project is being substantially reworked, so please [open an issue](https://github.com/TheAdmiral/local-stt-mcp/issues) to discuss a change before starting on it.

Before submitting a pull request, run these from `mcp-server/`:

```bash
npm run lint
npm test
```

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for optimized inference
- [OpenAI Whisper](https://github.com/openai/whisper) for the original models
- [Model Context Protocol](https://modelcontextprotocol.io/) for the framework
- [Pyannote.audio](https://github.com/pyannote/pyannote-audio) for speaker diarization