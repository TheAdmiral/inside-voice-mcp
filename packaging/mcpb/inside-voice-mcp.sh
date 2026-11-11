#!/bin/bash
# Claude Desktop runs this from the .mcpb bundle. It starts the server that Homebrew
# installed, so upgrading with brew also upgrades what Claude Desktop uses.

# Inside Voice only supports Apple Silicon, where Homebrew lives in /opt/homebrew.
server="/opt/homebrew/bin/inside-voice-mcp"

if [ -x "$server" ]; then
  exec "$server" "$@"
fi

echo "Inside Voice is not installed. Install it with: brew install TheAdmiral/tap/inside-voice" >&2
exit 1
