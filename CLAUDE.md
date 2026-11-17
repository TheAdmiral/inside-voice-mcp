# Inside Voice

## Code style

- Keep the code highly readable. Prioritise clarity over fewer lines of code or neat one-liners.
- Use as few dependencies as is reasonable.
- Write JavaScript compatible with Node 24 wherever possible.
- Do not use TypeScript.
- Put all the text people see in `src/strings.js`: tool and option descriptions, tool output, error and log messages, and command output. `test/strings.test.js` fails when text is written anywhere else in `src/` or `scripts/`.

## Documentation

- Write READMEs in British English, for example "optimise", "licence" (the noun) and "diarisation". Keep code, commands and names such as the MIT License as they are.
- Use en-dashes (–), not em-dashes (—).
