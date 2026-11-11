#!/bin/bash
# Claude Desktop runs this from the .mcpb bundle. It starts the server that Homebrew
# installed, so upgrading with brew also upgrades what Claude Desktop uses.

# Homebrew lives in /opt/homebrew on Apple Silicon and /usr/local on Intel Macs.
for prefix in /opt/homebrew /usr/local; do
  if [ -x "$prefix/bin/inside-voice-mcp" ]; then
    exec "$prefix/bin/inside-voice-mcp" "$@"
  fi
done

echo "Inside Voice is not installed. Install it with: brew install TheAdmiral/tap/inside-voice" >&2
exit 1
