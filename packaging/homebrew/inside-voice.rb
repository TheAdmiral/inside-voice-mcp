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
    "inside-voice-setup-models"      => "scripts/setup-models.js",
    "inside-voice-setup-diarization" => "scripts/setup-diarization.js",
    "inside-voice-setup-token"       => "scripts/setup-huggingface-auth.js",
  }.freeze

  def install
    system "npm", "ci", "--omit=dev", "--ignore-scripts"
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

  def caveats
    <<~EOS
      Download a whisper model:
        inside-voice-setup-models

      For speaker diarization, accept the licences for pyannote/speaker-diarization-3.1
      and pyannote/segmentation-3.0 on huggingface.co, then run:
        inside-voice-setup-diarization
        inside-voice-setup-token

      In your MCP client, use the command: #{opt_bin}/inside-voice-mcp
    EOS
  end

  test do
    request = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{' \
              '"protocolVersion":"2025-06-18","capabilities":{},' \
              '"clientInfo":{"name":"brew-test","version":"1"}}}'
    assert_match "serverInfo", pipe_output(bin/"inside-voice-mcp", "#{request}\n", 0)
  end
end
