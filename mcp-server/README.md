# whisper.cpp MCP Server

A Model Context Protocol server that provides local speech-to-text transcription using whisper.cpp, optimized for Apple Silicon performance.

## 🎯 Features

- **Local Processing**: 100% local transcription, no API calls or internet required
- **Apple Silicon Optimized**: Takes advantage of Apple Silicon performance optimizations  
- **Multiple Models**: Support for tiny, base, small, medium, and large whisper models
- **Multiple Formats**: Output in txt, vtt, srt, json, or csv formats
- **No Build Step**: Plain JavaScript that runs directly on Node.js
- **Zero Cost**: No subscription fees or API usage costs

## 🚀 Quick Start

### Prerequisites

- Node.js 24.2+
- whisper.cpp installed via Homebrew
- At least one whisper model downloaded
- **For speaker diarization**: Python 3.8+ with pyannote.audio
- **For speaker diarization**: HuggingFace account and token (free)

### Installation

```bash
# Install whisper.cpp
brew install whisper-cpp

# Clone and setup
git clone https://github.com/TheAdmiral/local-stt-mcp.git
cd local-stt-mcp/mcp-server
npm install

# Download base model (recommended starting point)
mkdir -p ../models
cd ../models
curl -L -O https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

### Speaker Diarization Setup (Optional)

For speaker diarization functionality, you'll need:

1. **Python environment with pyannote.audio**:
   ```bash
   pip install pyannote.audio
   ```

2. **HuggingFace token** (free account required):
   - Create account at [huggingface.co](https://huggingface.co)
   - Generate token at [Settings > Access Tokens](https://huggingface.co/settings/tokens)
   - Accept the license for [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - Set environment variable:
     ```bash
     export HF_TOKEN="your_token_here"
     ```

**Note**: Basic transcription works without HuggingFace token. Only speaker diarization requires it.

### Testing

```bash
# Test server functionality
node test-server.js

# Test with MCP Inspector
npx @modelcontextprotocol/inspector@latest src/index.js
```

## 🛠️ MCP Tools

### `version`
Get server version information to verify you're running the latest code.

**Example Response:**
```json
{
  "name": "whisper-mcp-server",
  "version": "1.0.1",
  "capabilities": ["audio transcription", "Apple Silicon optimization"],
  "supported_formats": ["wav", "mp3", "m4a", "flac", "ogg"],
  "output_formats": ["txt", "vtt", "srt", "json", "csv"]
}
```

### `transcribe`
Convert audio files to text using whisper.cpp.

**Parameters:**
- `audio_path` (string): Path to audio file
- `options` (object, optional):
  - `model` (string): Model to use (default: 'base.en')
  - `language` (string): Language code (default: 'auto')
  - `output_format` (string): Output format - txt, vtt, srt, json, csv (default: 'txt')
  - `temperature` (number): Sampling temperature 0-1 (default: 0)
  - `threads` (number): CPU threads to use (default: 4)
  - `translate` (boolean): Translate to English (default: false)
  - `word_timestamps` (boolean): Include word-level timestamps (default: false)

**Example:**
```json
{
  "audio_path": "/path/to/audio.mp3",
  "options": {
    "model": "base.en",
    "output_format": "json",
    "word_timestamps": true
  }
}
```

### `list-models`
List available whisper models with performance recommendations.

**Example Response:**
```json
{
  "available_models": [
    {
      "model": "base.en",
      "available": true,
      "size": "142 MB",
      "speed_rating": 4,
      "accuracy_rating": 3,
      "recommended_for": ["general transcription", "Apple Silicon"]
    }
  ],
  "recommended_for_apple_silicon": "base.en"
}
```

### `health-check`
Verify whisper.cpp installation and system configuration.

**Example Response:**
```json
{
  "status": "healthy",
  "whisper_installed": true,
  "models_available": ["base.en"],
  "system_info": {
    "platform": "darwin",
    "arch": "arm64",
    "threads_available": 8
  },
  "diagnostics": {
    "overall_status": "healthy",
    "apple_silicon_optimization": "available",
    "recommended_threads": 4
  }
}
```

## 📊 Performance

### Apple Silicon Benchmarks
- **base.en model**: ~15x real-time transcription speed
- **Memory usage**: <2GB typical
- **Startup time**: <5 seconds
- **Optimal threads**: 4 for Apple Silicon

### Model Comparison
| Model | Size | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| tiny.en | 39MB | ⭐⭐⭐⭐⭐ | ⭐⭐ | Quick transcription |
| base.en | 142MB | ⭐⭐⭐⭐ | ⭐⭐⭐ | Balanced performance |
| small.en | 488MB | ⭐⭐⭐ | ⭐⭐⭐⭐ | High accuracy |

### 🚀 vs WhisperX Performance Comparison

**Real-world benchmark (June 2025)** using 10-minute meeting audio on Apple Silicon:

| Metric | Our whisper.cpp + Pyannote | WhisperX | Winner |
|--------|----------------------------|----------|---------|
| **Processing Speed** | 15.8x real-time | 5.5x real-time | ✅ **3x faster** |
| **Memory Usage** | <2GB | ~3-4GB | ✅ **2x more efficient** |
| **GPU Acceleration** | ✅ Apple Neural Engine | ❌ CPU only | ✅ **Hardware optimized** |
| **Setup Complexity** | Medium (2 tools) | Simple (1 package) | ⚠️ WhisperX simpler |
| **Speaker Diarization** | ✅ Production tested | ✅ Built-in | 🤝 Both supported |

**Key Takeaway**: Our implementation is **3x faster** and **2x more memory efficient** than WhisperX on Apple Silicon, while maintaining the same transcription quality.

> **Disclaimer**: Benchmarks conducted with our specific configuration on Apple Silicon (M1). Your mileage may vary depending on hardware, audio characteristics, and parameter tuning. See `/benchmarks/` for detailed test methodology and results.

## 🔧 Configuration

### MCP Client Integration

Use the included `.mcp.json` file in the project root:

```json
{
  "mcpServers": {
    "whisper-mcp": {
      "command": "node", 
      "args": ["mcp-server/src/index.js"],
      "cwd": "/path/to/your/local-stt-mcp",
      "env": {},
      "description": "whisper.cpp MCP server for local speech-to-text transcription"
    }
  }
}
```

### MCP Desktop Client Integration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "whisper-mcp": {
      "command": "node",
      "args": ["/path/to/whisper-mcp-server/src/index.js"],
      "env": {}
    }
  }
}
```

### Version Management

To check which version your client is running:

```bash
# Check current version (via MCP)
# Use the 'version' tool in your MCP client

# Update the version, then restart your MCP client
npm version patch
```

### Environment Variables
- `WHISPER_MODELS_PATH`: Custom path to whisper models (default: ../models)
- `WHISPER_BINARY`: Custom whisper binary path (default: whisper-cli)

## 🎵 Supported Audio Formats

- WAV (recommended for best quality)
- MP3
- M4A 
- FLAC
- OGG

## 🔍 Troubleshooting

### Common Issues

**whisper.cpp not found:**
```bash
# Install via Homebrew
brew install whisper-cpp

# Verify installation
which whisper-cli
```

**No models found:**
```bash
# Download base.en model
mkdir -p models
cd models
curl -L -O https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

**Performance issues:**
- Use 4 threads on Apple Silicon for optimal performance
- Ensure adequate memory (2GB+ free)
- Try smaller models for faster processing

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

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for the optimized inference
- [OpenAI Whisper](https://github.com/openai/whisper) for the original models
- [Model Context Protocol](https://modelcontextprotocol.io/) for the framework