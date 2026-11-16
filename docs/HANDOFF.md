# my-game-audio: what exists, and what still needs to be made

The prototype in this repo came out of a research session on how LLM agents can make game music written entirely as
code, the way games built on my-3d2dge already write their art and animation. It reached a full synthesized orchestra
that plays printed scores. This file is the handoff: the first half describes the seed and what it measures; the
second half is the roadmap, in order, with acceptance checks to tick as the work lands. Keep it current.

Seeded 2026-11-15. Numbers below were measured on one core of a cloud VM (Node 22) unless a browser is named.

## Purpose

Games built by agents from [my-game-matrix](https://github.com/michaelcrosato/my-game-matrix) briefs on
[my-3d2dge](https://github.com/michaelcrosato/my-3d2dge) have one audio rule today (`aud-code-v3`): all music,
sound effects and voices are written in code, with no audio files; voices are Animalese/Simlish-style gibberish;
music defaults to 10% volume. my-game-audio should become the library those agents use to meet that rule well:
music in any style, from an original text score or imported from public-domain sheet music, plus sound effects and
voices, all synthesized at run time, deterministic, and checkable by an agent without ears.

## What exists

### Engine (`engine/`, 2,751 lines of JavaScript, no dependencies)

| File | Lines | What it does |
| --- | --- | --- |
| `score.mjs` | 527 | The text score format: tokenizer and parser, bar checks, chord symbols, generators (voice leading, arpeggios, bass lines), the arranger (sections, form, timing, dynamics curves, pedal) and the critic (ranges, chord tones, repetition) |
| `instruments.mjs` | 790 | Note-event instruments: NES 2A03 channels, virtual analog, FM, extended Karplus-Strong, bowed-string sections (detuned players, divisi), brass, choir (per-note vowels), modal percussion, drum kits, a hit library |
| `orchestra.mjs` | 219 | Woodwinds and saxophones (`wind`), organ, `ensemble` (several players of any instrument), orchestral percussion kit (`perc`); loads the presets |
| `orchestra-presets.json` | data | 53 instrument presets and 12 unpitched percussion sounds: synthesis settings, sounding range, stereo seat, hall send, measured gain, and the names, MusicXML sound IDs and MIDI programs each answers to; the hall and master settings; tempo words |
| `piano.mjs` | 172 | Additive stiff-string piano: inharmonic partials, stretch tuning, felt hammer, two-stage decay, dampers following a pedal line, rolled chords, grace notes; calibrated against measurements of recorded grand-piano notes (the recordings are not in the repo) |
| `fx.mjs` | 430 | FDN reverb, ping-pong delay, chorus, compressor, ducking, true-peak limiter, oversampled drive, cabinet EQs, parametric EQ, formant filters (five vowels, four voice types, formant tuning and level matching), dynamic lowpass, BS.1770 loudness |
| `render.mjs` | 331 | `renderSong`: parts to buses to master, loudness-normalized to -16 LUFS with a true-peak limiter at -2 dBFS. `renderStream`: plays while it renders (below). WAV writer |
| `dsp.mjs` | 282 | Seeded RNG, band-limited oscillators, SVF and biquad filters, delay lines, envelopes |

The score format is in the README ("The score format in one screen"). Additions made for printed scores: grace notes
`{G#4 A4}B4:2`, sung vowels `C5:4@o`, notes held across sections (a line starting with `-`), a pedal line, a
dynamics line for all parts (`'*'`), and per-section `meter`, `grid` and `tempo` lines (one BPM per bar).

### Instruments

- Strings: violins, violas, cellos, basses as sections; violin, viola, cello and double-bass soloists; pizzicato for
  each section.
- Woodwinds: piccolo, flute, recorder, oboe, English horn, clarinet, bass clarinet, bassoon, contrabassoon; soprano,
  alto, tenor and baritone saxophones.
- Brass: horn, trumpet, cornet, muted trumpet, trombone, bass trombone, euphonium, tuba.
- Tuned percussion: timpani, glockenspiel, xylophone, marimba, vibraphone, tubular bells, celesta, crotales.
- Keyboards and harp: piano, harp, harpsichord, organ.
- Voices: soprano, alto, tenor and bass choirs and soloists, singing vowels.
- Unpitched percussion tokens: `bd sd cym scym tri tam tamb wb cast sleigh cowbell whip`.
- Outside the orchestra: NES-style chip channels, virtual-analog and FM synths, plucked strings and guitars through
  drive and cabinets, synthesized drum kits.

Balance: `tools/orchestra_calibrate.mjs` renders every preset playing the same phrase at mf, dry, measures its
loudness and writes the gain that brings it to its family's target. `songs/rollcall.mjs` plays every preset in turn,
then all of them together; the tutti comes out about 10 dB above a single section, as it should.

### Importers (`tools/`, Python 3 with music21)

- `import_orchestra.py`: MusicXML full scores (exported by MuseScore, Sibelius, Finale or Dorico) to a song file.
  It picks each part's preset from its MusicXML sound ID, its name in English, Italian, German or French, or its
  General MIDI program; writes transposing instruments at sounding pitch; writes repeats and endings out in playing
  order; turns metronome marks, tempo words, Tempo I, a tempo, rit., accel., recitativo and fermatas into a tempo
  line, and meter changes into sections of their own; keeps each part's dynamics, hairpins and sforzandi, slurs,
  staccatos, accents, ties, grace notes, trills (written out on the key's upper note), measured tremolos (written
  out) and unmeasured ones (`~`), pizzicato and arco, and mutes; turns lyrics into sung vowels; spreads doubled parts
  across the stage. Options: `--bars A-B` (counted as played), `--tempo`, `--title`, `--key`, `--source`.
- `mxl_parts.py`: shows which preset every part of a set of scores would get, reading only the part lists. Over the
  96 full scores of the OpenScore Orchestra corpus (CC0, github.com/MarkGotham/Hauptstimme), all 1,663 parts map to
  a sensible preset (35 presets used).
- `import_score.py` with `kern.py`: piano and small-ensemble scores from Humdrum kern (its own reader: repeats,
  ties, spine splits, grace notes, trills; cross-checked against music21) or MusicXML, MIDI and ABC through music21.
- Reading time is music21's: about 16 seconds for the Fifth's first movement and 80 seconds for the Ninth's finale.

### Playing while rendering

`renderStream(song, { onChunk, normDb })` renders windows of note starts (3 seconds, then 8), each with its notes'
full tails, through part effects, buses and the master EQ, and overlap-adds them; the compressor and limiter run on
finished audio in order. Results for the Fifth's first movement: first audio after 1.3 s in Node and 1.4 s in
headless Chrome, where it then rendered about three times faster than real time; the whole stream took 123 s against
166 s for the whole-piece render. Rendered dry, streamed and whole renders differ by -60 to -95 dB; with reverb, by
about -22 dB at the same loudness, because the reverb's modulation restarts with each window. The loudness gain comes
from an offline render's `stats.normDb`. Songs whose parts use compressors, ducking, drive or chorus stream only
approximately (`streamable()` says which).

### Tools for checking work

`npm test` (node:test, `test/*.test.mjs`: the parser, arrangement and critic; golden hashes in `test/golden.json`,
written by `npm run golden`; streamed against whole renders; every preset's loudness and range; the API docs),
`npm run check` (every song parses and arranges; dry excerpts render finite, below full scale, identically twice, and
stream to match), `tools/render.mjs`, `tools/ears.py` (loudness, true peak, band balance, key, tempo, clicks,
spectrogram, per-stem band report), `tools/aesthetics.py` (Meta Audiobox Aesthetics), `tools/stream_test.mjs`,
`tools/bar_loudness.py`, `tools/mxl_probe.py`, `tools/crosscheck.py`, the piano calibration tools, and
`tools/page_test.mjs` (headless browser). The listening page builds with `npm run page`.

### Songs and what they measure

| Song | What it is | Length | Render, Node | Key and tempo heard | Audiobox enjoyment / quality |
| --- | --- | --- | --- | --- | --- |
| `chiptune` | Original cue, NES 2A03 | 0:40 | 2 s | E minor, 152 | 5.7 / 8.1 |
| `electronic` | Original cue, synthwave | 0:47 | 5 s | A minor, 99 | 6.6 / 7.8 |
| `orchestral` | Original cue, small orchestra and choir | 0:59 | 20 s | D minor, 144 | 7.1 / 8.1 |
| `rock` | Original cue, metal | 0:35 | 5 s | G major, 75 | 5.5 / 7.4 |
| `beethoven5` | Symphony No. 5, I, complete with the repeat, 18 parts, imported | 6:17 | 166 s | C minor, 108 | 6.8 / 7.8 (first minute) |
| `ode` | Symphony No. 9, IV, bars 92 to 330, 36 parts with soloists and choir, imported | 6:10 | 211 s | D major, 162 | 6.3 / 7.8 (first minute) |
| `rollcall` | Every preset in turn, then all together; written as code | 2:17 | 95 s | C major, 108 | 6.1 / 7.9 (first minute) |
| `moonlight`* | Beethoven, Moonlight Sonata, I | 5:25 | 29 s | C# minor | 7.4 / 7.6 (first minute) |
| `entertainer`* | Joplin, The Entertainer | 3:53 | 19 s | C major | 7.6 / 8.3 (first minute) |
| `alla_turca`* | Mozart, Rondo alla Turca | 3:56 | 16 s | A major | 7.4 / 8.2 (first minute) |

\* Not committed. Their source encodings (Craig Stuart Sapp's Humdrum editions) are CC BY-NC-SA 4.0 (Joplin,
Mozart) or carry no licence (Beethoven sonatas). `imports/*.json` regenerates them locally; see the README.

Imported song files are large because they spell every bar out: `beethoven5.mjs` is 181 KB of text, 21 KB gzipped.

### Known gaps and weaknesses

- **Game runtime.** Done in M1 (0.2.0): seamless cues, the player, `dist/`. What remains: the first play of a heavy
  cue renders slowly (in Node, 6 s for the chiptune cue, 12 s electronic, 21 s rock, 35 s orchestral), so it
  streams at an estimated loudness (off by 0.2 to 2.6 dB, corrected by a glide) until the exact loop arrives; call
  `prepare()` while a level loads. Render speed is an M4 item (parallel workers). Contexts not at 44.1 kHz resample
  every buffer.
- **Sound effects and voices.** None in this repo yet. (my-3d2dge's `game.audio` has a chip-style synth with named
  sound effects and five chiptune loops: title, adventure, dungeon, boss, victory.)
- **Importers.** Python and music21 only, so nothing imports in a browser, and big scores take a minute to read.
  The orchestral path reads MusicXML only.
- **Notation not handled.** Several instruments on one percussion staff; harmonics; glissandi; mordents, turns and
  arpeggio marks; "a2" and "1." in shared wind staves; breath marks and caesuras; rubato beyond the marks. Fermatas
  halve the tempo of their whole bar instead of lengthening their own note: the Fifth's oboe cadenza (bar 268, a
  ten-beat bar) plays at 33 quarter notes per minute. Real cue notes (`<cue/>`, not played) must be told apart from
  small-printed notes that are played, like that cadenza; music21 marks both as cue size. Tempo words come from a
  fixed table.
- **Sound.** The orchestra scores 6.1 to 6.8 for enjoyment against 7.4 to 7.6 for the piano pieces; `ears.py`
  finds 30 to 37% of the orchestral energy in the low mids and under 0.5% above 6 kHz. The choir sings vowels, not
  words. Articulations are limited to staccato, accent, slur, tremolo, pizzicato and mutes; no portamento, spiccato,
  col legno, sul ponticello, harmonics or flutter. Rendering uses one thread.
- **Engineering.** Fixed in M0 (0.1.0): `npm test`, CI, `CHANGELOG.md`, `docs/API.md`, an MIT licence and the
  public entry point `engine/index.mjs`.

## Roadmap

Work through the milestones in order. Each lands as one or more pull requests that tick its boxes here. A box may be
left unticked only with a written reason under it.

### M0. Foundation

- [x] `LICENSE`: MIT, matching my-3d2dge.
- [x] `npm test` (node:test): parser and critic errors; arrange timing, including per-section meter, grid and tempo
      lines; determinism (golden SHA-256 of a short render of every song, changed only on purpose, with the version);
      streamed against whole renders (dry difference below -40 dB, loudness within 0.2 LU with reverb); every preset
      renders finite audio within its range at its calibrated loudness, within 2 LU.
      *92 tests in `test/`, about 50 s on four cores. Measured at 0.1.0: streamed loudness within 0.05 LU of whole
      renders; every preset within 0.01 LU of its target.*
- [x] GitHub Actions runs `npm test` and `npm run check` on every push and pull request (`.github/workflows/ci.yml`).
- [x] `CHANGELOG.md` and semantic versions from 0.1.0; `docs/API.md` for the public functions.
- [x] Rename leftovers of the prototype's name (the `MusicCode` global and comments).

### M1. Game runtime

- [x] Seamless loops: a song can mark an intro and a loop body; the rendered loop wraps its tail into its start, so
      it repeats with no gap and no click (a test measures the seam).
      *`engine/loop.mjs` (`renderCue`): songs mark `intro` and `loop`, or several cues in `loops`. The body's middle
      pass of one arrangement (so every note knows its neighbours) renders alone with a second of pre-roll and its
      whole tail, and folds onto one period. `test/loop*.test.mjs`: dry and unmastered, head and loop equal a
      continuous render of intro and three body passes below -60 dB (chiptune, orchestral climax); with every effect
      and the master, the second difference at each seam is at most 1.5 times the largest within 20 ms (all four
      style songs, and each layer alone).*
- [x] A player for browsers: play, stop and fade; crossfade to another song or change section on the next bar or
      beat; layers rendered as stems with live gains; stingers over the music; bar and beat callbacks; buses for
      music, sfx and voice with volume, mute and ducking; rendering in a Worker through `renderStream`; rendered audio
      cached in memory and in IndexedDB, keyed by a hash of the song and the engine version.
      *`engine/player.mjs` (`createPlayer`, API in `docs/API.md`). A cue not yet cached streams from one worker
      (`renderStream` of the intro and three body passes, at a loudness estimated from the body's first 3 s) while a
      second renders the exact cue; on a bar line after it arrives the loop takes over and the estimate glides to the
      exact gain. Cache key: `cueKey` (two FNV-1a hashes of the frozen song, the cue and `VERSION`); IndexedDB keeps
      16-bit stems and drops other versions' entries. The compressor and limiter curves come from the whole mix and
      apply to every layer stem, so muting a layer never changes the others.*
- [x] `dist/my-game-audio.js`: one dependency-free file (IIFE and ES module builds), with a size budget recorded.
      *`npm run build` (`tools/build.mjs`) writes `dist/my-game-audio.js` (global `MyGameAudio`) and
      `dist/my-game-audio.mjs`: 96 KB, 37 KB gzipped at 0.2.0, budget 100 KB gzipped. The bundle runs its own source
      as the worker, so a page can inline it. `test/dist.test.mjs` checks the files are current, within budget,
      export the whole API and render the golden samples.*
- [x] The demo page runs on the player and shows looping, crossfades and layers; `tools/page_test.mjs` shows music
      starting within 2 seconds, a clean loop seam and no console errors.
      *`npm run page:test` (CI runs it): in headless Chromium on a cold cache, music sounded 0.98 to 1.09 s after
      Play (streamed) and the exact loop took over after about 8.5 s; an OfflineAudioContext player, served from
      IndexedDB, rendered the head and two loop passes, equal to the stems end to end (largest difference 0) across
      all three seams; a layer fade, a crossfade landing on the old song's bar line, a cue change landing exactly on
      the next bar line, a stinger on a beat, beat callbacks every 475 to 525 ms at 120 BPM; no console errors or
      warnings.*

### M2. Sound effects and voices

- [ ] Sound effects: a parametric generator in the spirit of sfxr (waveform, envelope, pitch sweep, vibrato,
      arpeggio, filters, noise) plus modal and noise models for impacts, footsteps by surface, whooshes and
      explosions; seeded variation on every play; a text or JSON format for layered effects; a library of at least
      40 named game sounds (interface, movement, combat, magic, pickups, doors, ambient loops), each checked for
      clipping, length and loudness.
- [ ] Voices: Animalese/Simlish-style gibberish from dialogue text: syllables to short formant-voiced blips, a pitch
      contour from punctuation and emotion, character profiles (pitch, speed, timbre, age and size through formant
      shift); built on the formant code in `fx.mjs`.
- [ ] Both play through the player's sfx and voice buses; the demo page has a sound board and a talking dialog box.

### M3. Sheet music in the browser

- [ ] A JavaScript MusicXML importer with everything `import_orchestra.py` does: reads `.mxl` (DecompressionStream
      in browsers, node:zlib in Node) and `.musicxml`; its output matches the Python importer's for the Fifth's first
      movement and the Ninth's finale, with any intended differences listed in the test.
- [ ] Dropping a MusicXML file on the demo page plays it, streamed, within seconds; no Python involved.
- [ ] MIDI import, song-to-MIDI export for people who want the notes in a DAW, and ABC import.
- [ ] The notation gaps listed above, each with a test score: shared percussion staves, harmonics, glissandi,
      ornaments and arpeggio marks, "a2" and "1." in shared staves, breath marks, cue notes against small print,
      fermatas that lengthen only their note, and an optional expression model (phrase-level rubato, agogic accents).
- [ ] A repertoire of CC0 or public-domain pieces with source, licence and commit recorded in each song; piano
      versions of the three uncommitted pieces from CC0 editions (OpenScore, PDMX).

### M4. Sound quality

- [ ] Mix: compare each orchestral family's spectrum and dynamics with analysis-only reference recordings (kept
      outside the repo, as with the piano) and fix the low-mid build-up and the dark top. Targets: Audiobox
      enjoyment at least 7.0 on the first minute of `beethoven5` and `ode`, quality kept at 7.8 or above.
- [ ] Strings: legato transitions, portamento, bow changes, spiccato, col legno, sul ponticello, harmonics,
      measured and unmeasured tremolo. Winds and brass: tonguing, flutter, brassy fortissimo, rips. Choir: consonants
      from the lyrics, so the words can be followed.
- [ ] Hall: early reflections by seat and stage depth.
- [ ] Speed: render parts in parallel Workers; record render speed on a phone-class device.

### M5. The agent workflow

- [ ] Ears in JavaScript (`npm run ears`): loudness, true peak, band balance, clicks, key and tempo estimates, so an
      agent can check a render without Python. The Python tools stay optional.
- [ ] `docs/AI_GUIDE.md`: how an agent writes game audio with the library: the score format, an instrument catalogue
      (range, character, uses), recipes by mood and genre, loops, layers and stingers, sound effects and voices, and a
      checklist (critic, check, ears).
- [ ] Original loopable cue sets for title, menu, exploration, town, dungeon, battle, boss, victory, defeat and
      ambience, in at least three styles (for example chiptune, orchestral, synthwave), each passing the checks.

### M6. Integration

- [ ] my-3d2dge: an adapter so `game.audio.music()` can play a my-game-audio song through `game.audio.bus('music')`,
      the player's volume settings, ducking and `at(step)`; following that repo's CLAUDE.md, changelog and tests.
      A draft pull request, left for the owner to merge.
- [ ] my-game-matrix: an `aud-code-v4` audio variant in place of `aud-code-v3`, for example: "All music, sound
      effects and voices are written in code, with no audio files, using my-game-audio: write music as text scores,
      or import public-domain sheet music. Voices are Animalese/Simlish-style gibberish. Music is to be set to 10%
      volume by default." A draft pull request, left for the owner to merge.

## Commands that work today

```sh
npm test                                        # about 50 s on four cores
npm run golden                                  # which songs render differently from test/golden.json
npm run check                                   # about 40 s
node tools/render.mjs rollcall                  # every instrument, about 95 s
pip install music21
python3 -I tools/mxl_parts.py SCORE.mxl ...     # which preset each part gets
python3 -I tools/import_orchestra.py SCORE.mxl songs/name.mjs [--bars 1-40] && node tools/render.mjs name
node tools/stream_test.mjs orchestral           # streamed against whole render
python3 tools/ears.py out/name.wav              # needs numpy scipy matplotlib pyloudnorm
```
