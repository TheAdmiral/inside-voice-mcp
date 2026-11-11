# Copy this to Formula/inside-voice.rb in a tap repository named homebrew-tap,
# and fill in the url and sha256 of a tagged release.
class InsideVoice < Formula
  desc "Local speech-to-text MCP server using whisper.cpp"
  homepage "https://github.com/TheAdmiral/inside-voice-mcp"
  url "https://github.com/TheAdmiral/inside-voice-mcp/archive/refs/tags/v2.0.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"

  depends_on "ffmpeg"
  depends_on "node@24"
  depends_on "uv"
  depends_on "whisper.cpp"

  COMMANDS = {
    "inside-voice-mcp"               => "src/index.js",
    "inside-voice-models"            => "scripts/model-manager.js",
    "inside-voice-setup-diarization" => "scripts/setup-diarization.js",
    "inside-voice-setup-token"       => "scripts/setup-huggingface-auth.js",
  }.freeze

  def install
    system "npm", "ci", "--omit=dev", "--ignore-scripts"

    # The Claude Desktop extension starts the inside-voice-mcp command installed below.
    system Formula["node@24"].opt_bin/"node", "scripts/build-mcpb.js"
    pkgshare.install "build/inside-voice.mcpb"

    libexec.install "src", "python", "scripts", "node_modules", "package.json"

    # MCP clients started from a desktop app often have a PATH without Homebrew on it.
    COMMANDS.each do |command, script|
      (bin/command).write <<~SH
        #!/bin/bash
        export PATH="#{formula_opt_bin("node@24")}:#{HOMEBREW_PREFIX}/bin:$PATH"
        exec node "#{libexec/script}" "$@"
      SH
    end
  end

  # Serves the MCP server on http://127.0.0.1:3700/mcp for HTTP clients such as Jan.
  service do
    run [opt_bin/"inside-voice-mcp", "--http"]
    keep_alive true
    log_path var/"log/inside-voice.log"
    error_log_path var/"log/inside-voice.log"
  end

  def caveats
    <<~EOS
      Install a whisper model, or run inside-voice-models help to manage them:
        inside-voice-models install base.en

      For speaker diarization, accept the licences for pyannote/speaker-diarization-3.1
      and pyannote/segmentation-3.0 on huggingface.co, then run:
        inside-voice-setup-diarization
        inside-voice-setup-token

      To add Inside Voice to Claude Desktop, open the extension:
        open #{opt_pkgshare}/inside-voice.mcpb

      For MCP clients that start the server themselves, use the command:
        #{opt_bin}/inside-voice-mcp

      For MCP clients that connect to a URL, such as Jan, start the HTTP server with
        brew services start inside-voice
      and connect to http://127.0.0.1:3700/mcp
    EOS
  end

  test do
    request = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{' \
              '"protocolVersion":"2025-06-18","capabilities":{},' \
              '"clientInfo":{"name":"brew-test","version":"1"}}}'
    assert_match "serverInfo", pipe_output(bin/"inside-voice-mcp", "#{request}\n", 0)
    assert_path_exists pkgshare/"inside-voice.mcpb"
  end
end
