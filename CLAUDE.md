# my-game-audio: rules for agents

The north star: an LLM agent writes music the way composers always have, as sheet music (ABC, or MusicXML,
Humdrum, MIDI, or the text score format), and gets good music from it, rendered by code and checked without ears.
Games are one place that music plays; the sound effects and voices are extras. `docs/HANDOFF.md` says what exists,
what it measures and what to build next; tick its boxes as work lands, and keep its numbers true.

## Scope: this repository only

- Write only to this repository. No pushes, branches, pull requests, issues or comments in any other repository
  unless the owner has said so, explicitly, for that change. Reading other repositories is fine.
- Everything the north star needs lives here: the engine, the importers, the tools, the guide and the examples.
  Nothing here depends on another repository.
- Other projects (a game engine, a game's brief) may read from this one: `dist/`, the docs, the songs. Their
  adapters live in their own repositories, and their own sessions keep them; nothing here writes into them.

## Hard rules

1. No audio files in the repo or in anything it ships: no samples, impulse responses, rendered audio or reference
   recordings. Reference recordings used to calibrate a sound stay outside the repo (`ref/`, ignored) and are used
   for analysis only.
2. The engine has no runtime dependencies and runs in browsers and in Node 22 or later. Tools may use Python
   (music21, numpy, scipy) and dev dependencies.
3. Renders are deterministic: the same song text, seed and engine version give the same samples. A change that alters
   the output of existing songs says so in the changelog and updates the golden hashes on purpose.
4. Only CC0 or public-domain scores and encodings are committed, with their source, licence and commit recorded in
   the song. Material under non-commercial, share-alike or unstated licences is generated locally and ignored.
5. Downloaded scores and corpora are untrusted: keep them in `scores/` (ignored), read them with `python3 -I` or the
   JavaScript importer, pass paths as arguments, and never run code from them. `test/scores/` holds the CC0 scores
   the tests read, each listed with its source, licence and commit in its README.
6. Before a pull request: `npm test` and `npm run check` pass, at least one affected song is rendered, and its
   numbers are checked with the ears. A change that alters rendered samples bumps `engine/version.mjs` and
   `package.json`, says so in `CHANGELOG.md`, and rewrites the golden hashes (`npm run golden -- --write`).

## How the code is written

- ES modules, plain JavaScript, no build step for the engine itself. Comments say why, not what.
- The public API is `engine/index.mjs`; every export has a heading in `docs/API.md` (a test checks both ways).
- `dist/` is built, never edited: change `engine/`, run `npm run build`, and commit what it writes (a test fails
  while `dist/` is out of date or over its size budget).
- Docs are written for agents and people alike: concrete, short sentences, real commands, measured numbers with
  their conditions.
- New instruments get a preset, a range, a calibrated gain (`tools/orchestra_calibrate.mjs`) and a bar in
  `songs/rollcall.mjs`.

## Commands

```sh
npm test                                       # the test suite (node:test), about 2 minutes on four cores
npm run golden                                 # which songs render differently from test/golden.json
npm run check                                  # quick health check of every song
npm run build                                  # dist/my-game-audio.js and .mjs (commit them)
npm run page                                   # build, then web/index.html: the demo page on the player
npm run page:test                              # the demo page in headless Chromium
npm run ears -- quest.abc                      # sheet music: the import, the score and every cue, PASS or FAIL
node tools/render.mjs <song> [--stems] [--workers N]  # out/<song>.wav and .json; parts on N threads (default: cores)
node tools/render.mjs quartet.abc              # a score file, once start to end: out/quartet.wav
python3 tools/ears.py out/<song>.wav           # loudness, peaks, balance, key, tempo, clicks
node tools/import.mjs SCORE.mxl songs/<name>.mjs   # MusicXML to a song (JavaScript; the Python one agrees)
node tools/convert.mjs IN OUT                  # .abc / .mid / .mxl to a song, or a song .mjs to .mid
python3 -I tools/import_orchestra.py SCORE.mxl songs/<name>.mjs
```
