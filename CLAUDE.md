# my-game-audio: rules for agents

Game audio written as code: music now, sound effects and voices next. `docs/HANDOFF.md` says what exists, what it
measures and what to build next; tick its boxes as work lands, and keep its numbers true.

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
   JavaScript importer, pass paths as arguments, and never run code from them.
6. Before a pull request: `npm run check` (and `npm test` once it exists) passes, at least one affected song is
   rendered, and its numbers are checked with the ears.

## How the code is written

- ES modules, plain JavaScript, no build step for the engine itself. Comments say why, not what.
- Docs are written for agents and people alike: concrete, short sentences, real commands, measured numbers with
  their conditions.
- New instruments get a preset, a range, a calibrated gain (`tools/orchestra_calibrate.mjs`) and a bar in
  `songs/rollcall.mjs`.

## Commands

```sh
npm run check                                  # quick health check of every song
node tools/render.mjs <song> [--stems]         # out/<song>.wav and out/<song>.json
python3 tools/ears.py out/<song>.wav           # loudness, peaks, balance, key, tempo, clicks
python3 -I tools/import_orchestra.py SCORE.mxl songs/<name>.mjs
npm run page                                   # the listening page, after rendering
```
