# TODO

## 2.0.0

- [ ] Homebrew setup
	- Finish the draft Homebrew formula in `packaging/homebrew` with the release URL and checksum
	- Create the `TheAdmiral/homebrew-tap` repository for the formula
	- Tag a release for the formula to download
- [ ] Friendly setup wizard
- [ ] I want to review and edit all the user-facing copy. Create a strings file that will be used as the source of truth for all the copy in the app.
  - Add `src/strings.js`, grouped by area: tool and option descriptions, `list_models` and `health_check` text, model descriptions, error messages, and the model manager and setup script output.
  - Use a JS module rather than JSON, so that text with values in it, such as a model name, can be a small function.
  - Move every string out of `src/` and `scripts/` into it, and add a test that catches new strings written outside it. READMEs stay as they are.
- [ ] I want to be able to supply special terms and their spellings to the server in order to hint the transcription. For example, I work for the company ‘Tellet’, which is often transcribed as ‘tell it’.
  - whisper-cli takes an initial prompt (`--prompt`, with `--carry-initial-prompt` to keep it for every window), which steers spellings without changing anything else.
  - Add a `vocabulary` option to `transcribe` (a list of terms).
  - The prompt is limited to about 224 tokens, so warn when the list is too long.

## Future

- [ ] Transcription web UI
- [ ] Rewrite everything apart from the Python in Rust, on a new branch
  - Main gain: a single binary with no Node, which avoids Claude Desktop's PATH problems and lets the `.mcpb` extension contain the server itself. Transcription is no faster, because the time is spent in whisper-cli and pyannote.
  - About 2,500 lines of JS and 1,700 of tests to port. Likely crates: `rmcp` (official MCP SDK, stdio and HTTP), `serde` and `schemars` in place of zod, `reqwest` and `tokio`, `clap`, `rpassword`.
  - Embed `diarize.py` and its lock file in the binary and write them to `~/.inside-voice-mcp` when needed. Rewrite `CLAUDE.md` for Rust.
  - Work in stages, checking each against the JS version: CLI and model manager, then the stdio server with `transcribe`, then HTTP, diarisation and packaging.
