# Takes: every version of a piece, kept

Each folder here is one piece an agent composed. Each numbered file in it is one take: the score as it stood when the
agent ran `npm run take`. Nothing is thrown away, so the weak takes are here with the good ones. A folder's
`takes.json` holds each take's numbers:

- what the checks found: import warnings, critic notes, and the ears' PASS or FAIL, loudness, key and tempo;
- the Audiobox Aesthetics scores of its first minute: enjoyment (CE), usefulness (CU), complexity (PC) and quality
  (PQ), from 1 to 10;
- the engine version they were measured on, and what the agent changed.

The scores stand in for ears. Listening tells whether they track what people hear. Compare a piece's first take with
its best, and listen to pieces across the range in the table below:

```sh
npm run takes -- listen lullaby --blind     # out/takes/lullaby/listen/A.once.wav, B..., in a random order
npm run takes -- heard lullaby B A          # B sounded better than A (the key turns letters into take numbers)
npm run takes -- heard lullaby 4 1          # or by take number, when not listening blind
npm run takes                               # every piece and its verdict; rewrites the table below
```

`npm run take` rewrites the table too, after each take it keeps.

"Heard" in the table counts those verdicts, and how many of them the scores agree with. A blind set's key is also
kept in `takes/<piece>/blind-key.txt`, in base64 so a glance does not unblind you, so a verdict given days later
still finds its takes; decode it only after listening.

## The limit

- **Five takes a piece at most:** a first draft and four revisions.
- **A revision counts as a gain** when it is clean (no import warnings, no critic notes, every cue PASS) and either
  it is the first clean take, or it adds 0.1 or more to the best enjoyment so far.
- **Two revisions in a row without a gain, and the piece stops.** `npm run take` refuses a take after a stop, as it
  does after the fifth.
- **The answer is the best take, not the last:** the first take, replaced by each later one that gains on it. A
  take that is not a gain is not the new best either, however close: 0.05 more enjoyment leaves the earlier take
  standing.
- **Check as often as you need while you fix mistakes** (`npm run ears -- piece.abc`). Save a take when you have
  changed the music and want to know whether it got better.
- **Audiobox scores the first minute of each cue,** as the repository's numbers do. A longer piece's ending is not in
  its score.

The scores are a learned model's guess at what listeners enjoy. A few revisions find what it hears; past that, an
agent chasing them is fitting the scorer, not writing better music.

## What is kept

- **Scores, never audio** (`CLAUDE.md`, rule 1). `npm run take` writes the audio it measured to `out/takes/`, which
  git ignores. `listen` renders it again on the current engine, so a take sounds as it did when the engine is the
  same version.
- **A take is kept as written,** warnings and all.
- **Measurements on an older engine stay.** `npm run takes -- rescore NAME` (or `--all`) adds one on the current
  engine.
- **Every take is an original score,** written for this repository by an agent and dedicated to the public domain
  (CC0 1.0).
- **`test/takes.test.mjs` checks** that every take still imports and arranges, that each `takes.json` matches its
  files and the limit, and that the table below is current.

Audiobox needs Python with torch, scipy and `audiobox_aesthetics`. `MGA_AUDIOBOX_PYTHON` names that Python (default
`python3`). `MGA_AUDIOBOX_CKPT` points at a local copy of the model's checkpoint, where Hugging Face is not reachable
(see `tools/aesthetics.py`). Without Audiobox, a take is kept with the checks' numbers only, and the limit of five
still holds.

## The pieces

The lowest first takes come first. "First take" and "Best take" give the take's number, then enjoyment / quality,
and the best take's gain over the first.

<!-- takes:index -->
| Piece | Instruments | Takes | First take: enjoyment / quality | Best take | Heard |
| --- | --- | --- | --- | --- | --- |
| [quartet](quartet/takes.json) | violin_solo, viola_solo, cello_solo | 4 | 1: 5.74 / 7.55 | 2: 6.11 / 7.70 (+0.37) | not yet |
| [chip-overworld](chip-overworld/takes.json) | chip_pulse, chip_triangle, chip noise channel | 3 | 1: 5.96 / 7.99 | 1: 5.96 / 7.99 | not yet |
| [synth-chase](synth-chase/takes.json) | synth_lead, synth_pluck, synth_pad, synth_bass, band kit | 3 | 1: 6.45 / 8.09 | 3: 6.51 / 7.98 (+0.06) | not yet |
| [hymn](hymn/takes.json) | soprano_choir, alto_choir, tenor_choir, bass_choir | 3 | 1: 6.61 / 6.88 | 3: 6.72 / 6.78 (+0.11) | not yet |
<!-- /takes:index -->
