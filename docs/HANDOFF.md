# my-game-audio: what exists, and what still needs to be made

The prototype in this repo came out of a research session on how LLM agents can make music written entirely as
code. It reached a full synthesized orchestra that plays printed scores. This file is the handoff: the first half
describes what exists and what it measures; the second half is the roadmap, in order, with acceptance checks to tick
as the work lands. Keep it current.

Seeded 2026-11-15. Numbers below were measured on one core of a cloud VM (Node 22) unless a browser is named.

## Purpose

The north star: an LLM agent writes music the way people always have, as sheet music, and gets good music from it.
It writes a score (ABC, or MusicXML, Humdrum, MIDI, or the text score format), and this library plays it on a
synthesized orchestra, band, piano or chip, deterministically, with no audio files. Its tools tell the agent, without
ears, what to fix: each voice's instrument, every miscounted bar, the critic's notes, and whether the sound passes.
`docs/GOAL.md` has it in full.

The work began as audio for games written by agents, and games still play this music through the player in
`dist/`, with sound effects and voices besides (M1, M2, M6). Since 2026-11-17 the work stays in this repository: it
writes to no other repository without the owner's explicit word (`CLAUDE.md`, "Scope"). Other projects read from
it, and keep their own adapters.

## What exists

### Engine (`engine/`, 9,804 lines of JavaScript in 25 modules at 0.24.1, no dependencies; the seed's core files, at their size then:)

| File | Lines | What it does |
| --- | --- | --- |
| `score.mjs` | 527 | The text score format: tokenizer and parser, bar checks, chord symbols, generators (voice leading, arpeggios, bass lines), the arranger (sections, form, timing, dynamics curves, pedal) and the critic (ranges, chord tones, repetition) |
| `instruments.mjs` | 790 | Note-event instruments: NES 2A03 channels, virtual analog, FM, extended Karplus-Strong, bowed-string sections (detuned players, divisi), brass, choir (per-note vowels), modal percussion, drum kits, a hit library |
| `orchestra.mjs` | 219 | Woodwinds and saxophones (`wind`), organ, `ensemble` (several players of any instrument), orchestral percussion kit (`perc`); loads the presets |
| `orchestra-presets.json` | data | 64 instrument presets (53 orchestral; since 0.9.0, 11 band, synth and chip ones) and 12 unpitched percussion sounds: synthesis settings, sounding range, stereo seat, hall send, measured gain, and the names, MusicXML sound IDs and MIDI programs each answers to; the hall and master settings; tempo words |
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
  drive and cabinets, synthesized drum kits. Since 0.9.0 eleven of them are calibrated presets the importers find by
  name and program: acoustic, electric and distortion guitar, electric bass, electric piano, synth lead, pluck, pad
  and bass, chip pulse and triangle.

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
`tools/page_test.mjs` (headless browser). The listening page builds with `npm run page`. `npm run ears` (M5) is the
JavaScript ears: no Python, and it renders every cue of a song as a game hears it. Since 0.12.1 it takes a score
file too (`npm run ears -- quest.abc`, or `.krn`, `.mid`, `.mxl`): the import's warnings, the arranger's errors, the
critic's notes and every cue, in one report. Since 0.12.2 `tools/render.mjs` takes a score file too
(`node tools/render.mjs quartet.abc`): the piece once, start to end, to `out/quartet.wav`. Since 0.15.0 the ears
give each part of a piece (`P:`) its own loudness, `npm run ears -- out/stems/<name>` shows who carries which band
and each part's level by section with no Python, and `npm run take` keeps every version of a piece in `takes/`,
scored, with a limit on how many (M9).

### Songs and what they measure

| Song | What it is | Length | Render, Node | Key and tempo heard | Audiobox enjoyment / quality |
| --- | --- | --- | --- | --- | --- |
| `chiptune` | Original cue, NES 2A03 | 0:40 | 2 s | E minor, 152 | 5.7 / 8.1 |
| `electronic` | Original cue, synthwave | 0:47 | 5 s | A minor, 99 | 6.6 / 7.8 |
| `orchestral` | Original cue, small orchestra and choir | 0:59 | 20 s | D minor, 144 | 7.1 / 8.1 |
| `rock` | Original cue, metal | 0:35 | 5 s | G major, 75 | 5.5 / 7.4 |
| `beethoven5` | Symphony No. 5, I, complete with the repeat, 18 parts, imported (default mode since 0.10.0) | 6:17 | 166 s | C minor, 108 | 6.99 / 7.93 (first minute) |
| `ode` | Symphony No. 9, IV, bars 92 to 330, 36 parts with soloists and choir singing the words, imported (default mode since 0.10.0) | 6:09 | 211 s | D major, 162 | 6.63 / 7.81 (first minute) |
| `rollcall` | Every preset in turn, then all together; written as code | 2:17 | 95 s | C major, 108 | 6.1 / 7.9 (first minute) |
| `brandenburg3` | Bach, Brandenburg Concerto No. 3, I, 11 parts, imported (OpenScore, CC0) | 4:52 | 228 s | D major (G written), 112 | 6.9 / 7.6 (first minute) |
| `schubert5` | Schubert, Symphony No. 5, I, imported (OpenScore, CC0) | 7:31 | 229 s | F major (B-flat written), 129 | 6.9 / 7.9 (first minute) |
| `brahms3` | Brahms, Symphony No. 3, III, imported (OpenScore, CC0) | 4:33 | 149 s | C minor, 108 | 7.0 / 7.8 (first minute) |
| `beethoven_moonlight` | Moonlight Sonata, I, piano, from MIDI with the pedal following the bass (PDMX, CC0) | 6:08 | 29 s | C# minor, 45 | 7.1 / 7.8 (first minute) |
| `joplin_entertainer` | The Entertainer, piano, from MIDI (Mutopia, public domain) | 4:13 | 15 s | C major, 144 | 7.7 / 8.2 (first minute) |
| `mozart_alla_turca` | Rondo alla Turca, piano, from MIDI (Mutopia, public domain) | 2:02 | 8 s | A major, 126 | 7.6 / 8.2 (first minute) |
| `set_chiptune` | Ten original cues (title to ambience) for the NES 2A03 | 10 cues, 23-67 s each | 0.7-1.7 s a cue (four workers) | 9 of 9 tonal cues in their keys | not measured |
| `set_synthwave` | The same ten themes as synthwave | 10 cues, 21-68 s | 1.3-3.0 s a cue (four workers) | 9 of 9 (7 of 9 before 0.10.0) | not measured |
| `set_orchestral` | The same ten themes for orchestra, on a stage, with string techniques and a Latin choir | 10 cues, 23-76 s | 2.8-7.4 s a cue (four workers) | 9 of 9 (7 of 9 before 0.10.0) | 7.22 / 7.96 (title) |
| `lantern_road` | Five original cues for chamber orchestra, written as sheet music (ABC) | 4 cues of 37-70 s, a stinger | 5.5-11.7 s a cue (one thread) | 4 of 4 | 5.79-7.31 / 7.46-8.25 (M7) |
| `moonlight`* | Beethoven, Moonlight Sonata, I | 5:25 | 29 s | C# minor | 7.4 / 7.6 (first minute) |
| `entertainer`* | Joplin, The Entertainer | 3:53 | 19 s | C major | 7.6 / 8.3 (first minute) |
| `alla_turca`* | Mozart, Rondo alla Turca | 3:56 | 16 s | A major | 7.4 / 8.2 (first minute) |

\* Not committed. Their source encodings (Craig Stuart Sapp's Humdrum editions) are CC BY-NC-SA 4.0 (Joplin,
Mozart) or carry no licence (Beethoven sonatas). `imports/*.json` regenerates them locally; see the README. The
committed piano versions above come from CC0 and public-domain editions instead; they are plainer (one dynamic
level from MIDI, no Humdrum part splits), which is most of the difference in their scores.

Render times are for one thread in Node on this machine (four cores); the ears estimate the key and tempo heard
(the estimator takes the dominant for the tonic in two Allegros), and Audiobox Aesthetics scores enjoyment and
production quality on the first minute. No render has clicks; every one sits at -16 LUFS, peaks under -1.9 dBTP.

Imported song files are large because they spell every bar out: `beethoven5.mjs` is 181 KB of text, 21 KB gzipped.

### Known gaps and weaknesses

- **Game runtime.** Done in M1 (0.2.0): seamless cues, the player, `dist/`. What remains: the first play of a heavy
  cue renders slowly (in Node, 6 s for the chiptune cue, 12 s electronic, 21 s rock, 35 s orchestral), so it
  streams at an estimated loudness (off by 0.2 to 2.6 dB, corrected by a glide) until the exact loop arrives; call
  `prepare()` while a level loads. Since M4 a cue's parts render in parallel workers (`parallel`); since 0.10.0 its
  reverbs and delays do too, so the page's own thread is busy for at most about 0.18 s at a time while a cue renders
  on three workers (it was 1.5 to 2.3 s): the master (EQ, compressor, limiter) and the sums of the parts still run
  there. Contexts not at 44.1 kHz resample every buffer.
- **Sound effects and voices.** Done in M2 (0.3.0); since 0.17.0 (M11) a library checked by a listening model
  against each sound's description, 232 sounds since 0.19.0. Since 0.20.0 a sound's first take renders in a worker,
  so its first play holds the page's thread for 2 to 9 ms (16 to 344 ms before, in Chromium); it starts 20 to 460 ms
  after the call instead, so `preload()` the sounds a level uses. What remains: no person has listened to the new
  sounds; the voices sing vowels with simple consonants, so they read as gibberish by design.
- **Importers.** The MusicXML importer runs in JavaScript since M3 (0.4.0), in browsers and Node, in seconds. Since
  0.11.0 Humdrum **kern does too (`engine/kern.mjs`), and since 0.11.1 the config-driven piano importer
  (`tools/import_score.mjs`); the Python tools remain, and tests hold the two to the same output.
- **Sheet music written by agents (ABC).** Since 0.9.0 (M7): several voices, instruments by name, parts, drums,
  songbooks of cues, lenient bars; since 0.10.0 the score format repairs miscounted bars too (`arr.repairs`); since
  0.12.2 the piano's pedal marks, and choirs, solo players and a bare "Bass" read from the voices' names; since
  0.15.0 (M9) dynamics and hairpins within a bar, slurs over every note, glissandi, harmonics, drum ghost notes,
  flams and drags, words under their own line with melismas, chord symbols in place, and `%%double`, `%%duty`,
  `%%duck` and `%%delay`. What remains (deferred until a game needs it, M9): tempo changes within a bar; guitar
  bends, slides, hammer-ons and pull-offs; half-open hi-hats; a second verse of words; chord symbols add an accompaniment unless `%%accompany off` (right for
  a lead sheet, not for a full score); a songbook of orchestral and band tunes plays all of them in the concert hall
  (one room per song).
- **Notation.** Handled since M3 (0.6.0): shared percussion staves, harmonics, glissandi, ornaments and arpeggio
  marks, shared wind and brass staves, breath marks and caesuras, cue notes, fermatas on their own note, pedal marks,
  optional rubato; since 0.7.0 harmonics (`*`) sound nearly pure; since 0.10.0 a MIDI import takes the level its
  dynamics should sit at (`dynamic`), and fermatas survive a MIDI file both ways. What remains: tempo words come
  from a fixed table; and
  `beethoven_moonlight` plays at mf, where the score asks for pp: on its first minute Audiobox gives 7.06 / 7.81 at
  mf, 7.06 / 7.50 at p and 7.02 / 7.32 at pp (enjoyment / quality), though the piano's pp matches recorded notes
  (see "After the review" below).
- **Sound.** Since M4 (0.7.0) the strings, winds, brass and choir have their techniques. Choirs sing words. A stage
  places the orchestra, the master EQ thins the low mids, and parts render in parallel. What remains: the orchestra
  scores 6.6 to 7.1 for enjoyment on Audiobox (M4's first box met its lowered target of 6.0). Since 0.11.0 it is
  compared with two recordings of the Fifth and plays their range of dynamics; a family-by-family comparison, and
  the work on the string and brass sources it would guide, are not done; the voices' consonants come from a spelling
  table, not a pronunciation dictionary. Since 0.10.0 `ode` and `beethoven5` are default-mode imports: the choir
  sings Schiller's words. Since 0.22.0 the choirs and soloists are clearer (M14); the sung voices and the solo
  strings remain the weakest sounds.
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

- [x] Sound effects: a parametric generator in the spirit of sfxr (waveform, envelope, pitch sweep, vibrato,
      arpeggio, filters, noise) plus modal and noise models for impacts, footsteps by surface, whooshes and
      explosions; seeded variation on every play; a text or JSON format for layered effects; a library of at least
      40 named game sounds (interface, movement, combat, magic, pickups, doors, ambient loops), each checked for
      clipping, length and loudness.
      *`engine/sfx.mjs`: nine layer models (`tone` is the sfxr-style one; `modal` six materials, `step` eight
      surfaces, `whoosh`, `boom`, plus `noise`, `crackle`, `drip`, `creak`) in a JSON layer format. `engine/sounds.mjs`:
      58 sounds in seven categories, 10 to 180 ms each to render in Node. `test/sfx.test.mjs` checks every sound on two
      seeds: finite, peak at or under -1 dBFS, a length for its category, the first sound within 30 ms, loudness
      within 1 dB of its target (punch and block, sharp transients held by the ceiling, have lower targets); seeds
      repeat exactly and six seeds give six takes; ambient loops have no click at the seam and no level dip.*
- [x] Voices: Animalese/Simlish-style gibberish from dialogue text: syllables to short formant-voiced blips, a pitch
      contour from punctuation and emotion, character profiles (pitch, speed, timbre, age and size through formant
      shift); built on the formant code in `fx.mjs`.
      *`engine/voice.mjs`: the `FORMANTS` table of `fx.mjs` scaled by each character's size, a buzzy source with
      breath, plosive bursts and fricative hisses; 12 profiles (two Animalese: a blip per letter), 6 emotions.
      `test/voice.test.mjs`: syllables map back to their letters; pitch measured from the audio rises at the end of a
      question and falls through a statement; giant < hero < child in pitch, the hero within half an octave of its
      140 Hz; sad is lower and slower, scared faster. A 4 s line renders in 40 to 160 ms in Node.*
- [x] Both play through the player's sfx and voice buses; the demo page has a sound board and a talking dialog box.
      *`player.sfx()` and `player.say()`; the page test renders both offline and finds them sample-exact at the bus
      volume (difference 0), silent when the bus is muted; in the live page the music ducks to 0.60 while a character
      talks and returns to 1.00, and the dialog box reveals the line syllable by syllable.*

### M3. Sheet music in the browser

- [x] A JavaScript MusicXML importer with everything `import_orchestra.py` does: reads `.mxl` (DecompressionStream
      in browsers, node:zlib in Node) and `.musicxml`; its output matches the Python importer's for the Fifth's first
      movement and the Ninth's finale, with any intended differences listed in the test.
      *`engine/musicxml.mjs` (`importMusicXML`; `node tools/import.mjs` from a shell): its own XML parser and zip
      reader (DecompressionStream, which Node 22 also has), and the parts of music21's model the Python importer
      relies on, reproduced: measure layout including overfull bars, flattened order (grace notes first, then voice
      by voice), chords that merge their notes' marks, slurs and hairpins in one bundle for the whole score (a stop
      closes the earliest open one with its number, from any part; a hairpin takes the next note, chord or rest read),
      sounding pitch, repeats and endings. `test/musicxml.test.mjs`: the Fifth (626 bars played, 18 parts) and the
      Ninth's bars 93 to 331 (36 parts) give the same songs as `songs/beethoven5.mjs` and `songs/ode.mjs`, made by
      the Python importer, and a feature score (`test/scores/features.musicxml`: endings, voices, grace notes,
      triplets, ties, slurs, trills, tremolos, pizz., lyrics, an overfull bar) gives its Python output. The listed
      differences: note names are compared by pitch (music21 spells some transposed notes differently between its
      versions, G#1 or Ab1), the `source` field and the header comments. `test/musicxml-python.test.mjs` runs the
      Python importer itself where music21 is installed; CI's `importers` job does. Reading time: 0.6 s for the
      Fifth and 2 s for the Ninth's finale in Node, against 31 s and 137 s for the Python importer.*
- [x] Dropping a MusicXML file on the demo page plays it, streamed, within seconds; no Python involved.
      *The demo page imports a dropped or chosen `.mxl` or `.musicxml` in a worker (`player.importScore`) and streams
      it once (`music(song, { loop: false })`), with a link to save the song file. `npm run page:test` drops the
      Fifth's `.mxl`: read in 0.40 s in headless Chromium, sounding 4.4 s after the drop, still playing 3 s later.*
- [x] MIDI import, song-to-MIDI export for people who want the notes in a DAW, and ABC import.
      *`engine/midi.mjs` (`importMidi`, `exportMidi`, `parseMidi`) and `engine/abc.mjs` (`importABC`) build the
      MusicXML importer's score model and share its layout (`buildSong`); `importScore` tells the three formats
      apart; `node tools/convert.mjs` converts from a shell; the demo page plays dropped `.mid` and `.abc` files and
      saves any song as MIDI. `test/midi-abc.test.mjs`: Beethoven's Fifth (11,591 notes) and the chiptune (679, with
      drums) go out to MIDI and back note for note; played MIDI (onsets up to 16 ticks off) snaps to quarter notes,
      drums to the General MIDI kit, velocities 110 and 40 to f and pp; an ABC reel keeps its key, triplet, broken
      rhythm, repeat with first and second endings, a trill on the key's upper note and a fermata, and its 13 chord
      symbols become chords lines and a harp and bass the critic finds no fault with.*
- [x] The notation gaps listed above, each with a test score: shared percussion staves, harmonics, glissandi,
      ornaments and arpeggio marks, "a2" and "1." in shared staves, breath marks, cue notes against small print,
      fermatas that lengthen only their note, and an optional expression model (phrase-level rubato, agogic accents).
      *0.6.0. `test/notation.test.mjs` reads one small score per item from `test/scores/notation/` (written by
      `tools/make_notation_scores.mjs`, CC0): a percussion staff plays bass drum, snare, cymbal and triangle by each
      note's instrument; a natural harmonic sounds as written and an artificial one two octaves over its stopped note
      (both `*`); a harp glissando runs the white keys and a violin slide goes chromatically; a mordent, inverted
      mordent and turn use the key's neighbours (F sharp in G major); an arpeggio mark rolls its chord (`&`, notes
      0, 35, 70 and 105 ms apart, ending together); "Flutes 1.2" splits a chord into two players, doubles "a 2" and
      gives "1." and "2." to one each; a breath mark takes the end of its note and a caesura adds a hold; cue notes
      rest while small print plays; a fermata on beat 4 holds that beat (`hold: '| 3:1*2 | - |'`) and the cello's
      whole note lasts through it; sustain pedal marks become a `pedal` line. The new `hold` line stretches steps of
      a bar, and `expression: true` adds four-bar phrase rubato (+2% in the second bar, -5% in the fourth) and holds
      each phrase's highest melody note 12% longer. `compat: true` leaves all of it out and matches the Python
      importer; on the Fifth the default differs from compat only in the tempo and holds of its fermata bars (the
      test checks all 626 bars): the oboe's Adagio cadenza (bar 268 as written, 392 as played) lasts 11.8 s with its
      two fermatas held, against 18.2 s at half tempo.*
- [x] A repertoire of CC0 or public-domain pieces with source, licence and commit recorded in each song; piano
      versions of the three uncommitted pieces from CC0 editions (OpenScore, PDMX).
      *0.6.0. Three OpenScore Orchestra movements (CC0, Hauptstimme @8f677853, imported from MusicXML):
      `brandenburg3`, `schubert5`, `brahms3`. Piano versions of the three Humdrum pieces: `beethoven_moonlight` from
      PDMX (CC0 1.0, no licence conflict, record and file path in the song), and `joplin_entertainer` and
      `mozart_alla_turca` from the Mutopia Project (public domain; piece number and version in the song), all three
      imported from MIDI by `tools/convert.mjs` (Moonlight with `--pedal bass`). Measurements are in the song table
      above.*

### M4. Sound quality

- [x] Mix: compare each orchestral family's spectrum and dynamics with analysis-only reference recordings (kept
      outside the repo, as with the piano) and fix the low-mid build-up and the dark top. Targets: Audiobox
      enjoyment at least 6.0 on the first minute of `beethoven5` and `ode`, quality kept at 7.5 or above.
      *Ticked in 0.9.0 on the owner's word, which lowered the targets from 7.0 and 7.8 (2026-11-16). Both songs meet
      the new ones: at 0.7.0 `beethoven5` 6.84 / 7.84 and `ode` 6.24 / 7.59; re-imported in default mode at 0.10.0,
      6.85 / 7.86 and 6.35 / 7.82; with `dynamics: 1.2` at 0.11.0, 6.82 / 7.91 and 6.40 / 7.88; with the presets
      corrected against recorded instruments at 0.12.0, 6.99 / 7.93 and 6.63 / 7.81.
      The family-by-family comparison with reference recordings is still not done; it is listed under Known gaps.

      Done in 0.7.0: the orchestral master EQ (-2.5 dB at 320 Hz, +3.5 dB above 6 kHz), the stage's per-part early
      reflections, and the new string, wind, brass and choir techniques. With them, on the first minute:

      | Song | Audiobox enjoyment / quality | Low mids | Above 6 kHz | Ears flags |
      | --- | --- | --- | --- | --- |
      | `beethoven5`, 0.6.0 | 6.82 / 7.81 | 36% | 0.3% | muddy, dull |
      | `beethoven5`, 0.7.0 | 6.84 / 7.84 | 29% | 0.6% | none |
      | `ode`, 0.6.0 | 6.05 / 7.59 | 34% | 0.0% | muddy, dull |
      | `ode`, 0.7.0 | 6.24 / 7.59 | 28% | 0.0% | dull |

      The spectral fix worked by the ears, but Audiobox enjoyment barely moved: an EQ-only variant scored 6.73. So
      the gap is not the balance; it is more likely the synthesized timbres themselves.

      The family-by-family comparison with reference recordings was not done. It needs analysis-only orchestral
      recordings in the ignored `ref/` (none are there yet; Musopen's public-domain Beethoven recordings would do).

      Next: measure each family against references, then work on the string and brass sources (bow noise spectra,
      body resonances); the master EQ cannot fix those.*
- [x] Strings: legato transitions, portamento, bow changes, spiccato, col legno, sul ponticello, harmonics,
      measured and unmeasured tremolo. Winds and brass: tonguing, flutter, brassy fortissimo, rips. Choir: consonants
      from the lyrics, so the words can be followed.
      *0.7.0. Techniques follow a note's suffixes (`%pont %tasto %spicc %legno %port %trem8/16/32 %flz %rip
      %brassy`; README). `test/techniques.test.mjs` renders single notes and measures each one:
      - Strings, timbre: sul ponticello raises the spectral centroid by more than 1.4 times and halves the
        fundamental's share; sul tasto lowers the centroid by a fifth; a harmonic puts nine tenths of its energy at its
        fundamental.
      - Strings, envelope: spiccato and col legno fall below a twentieth of their level within 0.3 s.
      - Strings, pitch: portamento starts more than a semitone and a half below its note; a slur arrives within 60 ms.
      - Repeats: measured tremolo strokes and tongued repeats repeat at their note value; flutter-tongue chops the tone
        at 18 Hz (flute) and 24 Hz (trumpet).
      - Brass: a rip starts four semitones or more below its note; ff has more than 1.5 times mf's share of energy at
        2 to 8 kHz.
      - Choir consonants: an s hisses (centroid over 4 kHz) in the 90 ms before its note, a t bursts, a final s closes
        the vowel, an m hums into it.

      The importer reads technique words and spiccato marks, and writes lyrics as syllables (`@freun`, `@de`); the
      rollcall's voices sing a line of words.*
- [x] Hall: early reflections by seat and stage depth.
      *0.7.0. `song.stage` (`engine/stage.mjs`): image sources in a 26 x 46 x 17 m hall give each stereo part its own
      direct level and early reflections, from its pan, its section's depth (strings 3 m into the stage, woodwinds
      6.5, brass 8.5, percussion 10, choir 11) and the seat. The first reflection after the violins' direct sound
      comes at 38 ms in the front row, 27 ms in the stalls and 18 ms in the balcony. Trombones are 2 dB quieter
      directly than violins and have 4 dB more early sound for their direct sound. A staged song streams to within
      -40 dB of its whole render (tested). Imported orchestral songs sit in the stalls.*
- [x] Speed: render parts in parallel Workers; record render speed on a phone-class device.
      *0.7.0. `renderSongParallel` and `renderCueParallel` send parts to workers (`partJob`) and mix them in order: the
      samples are identical to a one-thread render (tested in Node, and in the page test through the player).
      - The orchestral cue renders in 35 s on one worker and 15 to 16 s on four, in Node and in Chromium (2.2 to
        2.3 times).
      - `node tools/render.mjs rollcall` takes 38 s on four worker threads, against 95 s on one.
      - The player's `parallel` option is on with 3 or more workers.

      Phone-class: no phone is attached to this environment, so `npm run page:test` emulates one with Chromium's 4x
      CPU slowdown (Lighthouse's mid-range phone). The 35.2 s chiptune cue renders on the page's own thread in 26.4
      s there, against 6.4 s unthrottled: 1.3 times real time on one thread. Music still starts at once, because it
      streams while the cue renders.*

### M5. The agent workflow

- [x] Ears in JavaScript (`npm run ears`): loudness, true peak, band balance, clicks, key and tempo estimates, so an
      agent can check a render without Python. The Python tools stay optional.
      *0.8.0. `engine/ears.mjs` (`ears`, `checkAudio`) measures what `tools/ears.py` does, with the same bands,
      thresholds and key profiles.
      - On the rollcall, Moonlight and the Fifth's first minute it agrees with Python to 0.1 LU, the same balance to
        the decimal, and the same key, tempo, onsets and clicks. Its true peak reads up to 0.3 dB higher, on the safe
        side.
      - `test/ears.test.mjs` checks known signals: a -20 dBFS tone reads -20 LUFS; a tone at a quarter of the sample
        rate reads its true peak 3 dB above its sample peak; chords in C major and A minor read as those keys; a pulse
        reads 120 BPM; a lone spike reads as a click. In CI (`MGA_PYTHON=1`) it also checks agreement with
        `ears.py` on a render.
      - `npm run ears -- songs/<name>.mjs` renders every cue as a game hears it (the head, then the loop twice) and
        prints PASS or FAIL.*
- [x] `docs/AI_GUIDE.md`: how an agent writes game audio with the library: the score format, an instrument catalogue
      (range, character, uses), recipes by mood and genre, loops, layers and stingers, sound effects and voices, and a
      checklist (critic, check, ears).
      *0.8.0. It covers the write, check, render, judge loop with real commands; a complete example song; the score
      format with every suffix and technique; the synth types and every orchestral preset with its range; recipes for
      the ten cues and for four genres; the player's cues, layers, stingers and callbacks; the 58 sounds (221 since
      0.17.0) and how to make new ones; the voices; public-domain imports; a checklist; and render speeds. `test/guide.test.mjs` checks
      that its example song arranges with no errors and no critic notes and that its cue passes the ears, and that
      every sound, voice, emotion, technique and preset it names exists.*
- [x] Original loopable cue sets for title, menu, exploration, town, dungeon, battle, boss, victory, defeat and
      ambience, in at least three styles (for example chiptune, orchestral, synthwave), each passing the checks.
      *0.8.0. `songs/themes/cues.mjs` holds ten original themes (key, tempo, meter, chords, melody), written for
      this library.
      - `set_chiptune` (NES 2A03), `set_synthwave` and `set_orchestral` each arrange all ten, with an accompaniment,
        groove and techniques chosen by each cue's mood.
      - The orchestral set uses measured tremolo for battle and boss, sul ponticello in the dungeon, harmonics in
        the ambience, and a choir singing "di-es i-rae" over the boss.
      - All 30 cues arrange with no critic notes (`test/cue-sets.test.mjs`) and pass `npm run check`.
      - All 30 pass the ears through both seams (CI's `cues` job): no clicks, true peaks -1.7 to -8.7 dBTP, loudness
        -15.94 to -16.11 LUFS. The ears hear 23 of the 27 tonal cues in the key they were written in (the modal
        ambience is left out). The four misses are a relative minor or the dominant: synthwave exploration (B minor
        for D major), the synthwave and orchestral victories (G for C) and the orchestral menu (D minor for F).
        Since 0.10.0 the ears use Bellman-Budge key profiles and hear all 27, and the 4 of `lantern_road`.
      - Warnings remain for balance only: the orchestral title, dungeon, victory and defeat are dark or heavy in the
        low mids, the same timbre gap as M4's first box.*

### M6. Integration

Done on 2026-11-16, in the other repositories, on the owner's word. Since 2026-11-17 this repository writes to no
other (`CLAUDE.md`, "Scope"): the adapter and the audio rule below belong to their repositories, and their sessions
keep them.

- [x] my-3d2dge: an adapter so `game.audio.music()` can play a my-game-audio song through `game.audio.bus('music')`,
      the player's volume settings, ducking and `at(step)`; following that repo's CLAUDE.md, changelog and tests.
      A draft pull request, left for the owner to merge.
      *[michaelcrosato/my-3d2dge#232](https://github.com/michaelcrosato/my-3d2dge/pull/232), merged on the owner's word as
      `a750594` (v0.106.0, squashed, per that repository's rules).
      - The module `engine/modules/mga.js`: `E.MGA.attach(game, MyGameAudio)`. Songs play through
        `game.audio.bus('music')`, so its Volume, Music, mute and pause ducking apply. The clock stays game.audio's
        own (a silent chip song with the cue's tempo and length), so `pos`, `at(step)`, `onBeat` and `stopMusic` work,
        headless too. Layers, stingers and cue changes go through.
      - The library is the game's to load; the module bundles nothing (their decision D99).
      - Its `tools/mga-test.mjs` checks it in Chromium with this repository's `dist/my-game-audio.js`. The song starts
        0.41 s after `music()`; an analyser on the music bus hears it, hears silence at Music 0 and a lower level under
        `duck()`; `at(16)` fires on its step.*
- [x] my-game-matrix: an `aud-code-v4` audio variant in place of `aud-code-v3`, for example: "All music, sound
      effects and voices are written in code, with no audio files, using my-game-audio: write music as text scores,
      or import public-domain sheet music. Voices are Animalese/Simlish-style gibberish. Music is to be set to 10%
      volume by default." A draft pull request, left for the owner to merge.
      *[michaelcrosato/my-game-matrix#58](https://github.com/michaelcrosato/my-game-matrix/pull/58), merged on the owner's word as
      `9024736`.
      `aud-code-v4` has that text, plus a pointer to `docs/AI_GUIDE.md` and the one-file dist. It keeps `olderRuns`,
      as that config's replacements do.*

### M7. Sheet music written by agents

The owner's word (2026-11-16): what matters most is that an agent can write music as people always have, as sheet
music, and get good results.

- [x] ABC scores as a composer writes them: several voices written line by line (`[V:2]`), each voice's instrument
      from its name or General MIDI program, drums, parts (`P:`) played in the header's order, the playing
      techniques a string or wind player reads as words over the staff.
      *0.9.0. `test/abc-book.test.mjs`: a four-voice band tune (lead guitar, strings, bass on program 33, drums by
      name) imports with every voice on its preset, the drums on the band kit, `P:A2B` as A A B, and no critic notes.*
- [x] Lenient bars: a miscounted bar costs a beat, not the score. It is padded or cut with a warning that names the
      voice, part and bar, so the agent can fix it.
      *0.9.0. "Lead Guitar, part B, bar 3: 5 beats in a 4/4 bar; cut at the bar line"; the bars after it stay in time
      and arrange with no errors.*
- [x] Songbooks: one ABC file, one song, a cue per tune, with intros, layers and stingers named in the file.
      *0.9.0. `importABCBook`; `songs/lantern_road.mjs` is an original five-cue score (title with an intro, a town
      waltz, a dungeon with sul ponticello tremolo, a battle, a victory stinger) for 11 instruments: no warnings, no
      critic notes. Its cues as a game hears them (head, then the loop twice):

      | Cue | Length | LUFS | True peak | Key and tempo heard | Ears flags | Audiobox enjoyment / quality |
      | --- | --- | --- | --- | --- | --- | --- |
      | `title` | 61 s (intro, then A twice) | -16.2 | -4.4 dBTP | D major, 89 | none | 7.10 / 7.96 |
      | `town` | 54 s | -16.2 | -2.0 dBTP | G major, 140 | none | 6.85 / 8.13 |
      | `dungeon` | 70 s | -16.0 | -4.0 dBTP | D minor, 123 (66 written) | muddy (31.5% low mids, the cellos' melody), dull (0.1% above 6 kHz): a dark cue | 5.79 / 7.46 |
      | `battle` | 37 s | -16.0 | -2.3 dBTP | A minor, 152 | none | 7.31 / 8.25 |

      The battle and the dungeon were rebalanced by ear numbers: the low strings and timpani down a dynamic, the
      violins' ostinato and tremolo up an octave, no harp under the dungeon (`%%accompany off`). Audiobox scores
      the first minute of each cue as a game hears it; the code-written `set_orchestral` title scores 7.22 / 7.96 the
      same way, so a score written as sheet music does as well as one written as code. The slow, sparse dungeon is
      the weakest.*
- [x] Instruments for more than the orchestra, so a band, synth or chip score sounds like one: calibrated presets,
      a room and master to suit, the drums on a kit (or the chip's noise channel), an accompaniment in the style.
      *0.9.0. Eleven presets, each calibrated to its target within 0.1 LU and played in the roll call. The guide's
      band template (electric piano, electric bass, drums) passes the ears: -16.3 LUFS, -1.6 dBTP, G major at 112, no clicks; Audiobox 6.28 / 7.92.*
- [x] The guide teaches it first: `docs/AI_GUIDE.md` "Write it as sheet music (ABC)", with a template songbook that
      `test/guide.test.mjs` imports, arranges, criticizes and renders through the ears.

### After M7: fixes from the review of the build (0.10.0)

- [x] A score with mistakes still plays: `arrange` repairs what it can (a bar padded or cut, an unreadable note as a
      rest, an unknown technique or dynamic left out, a short part repeated to fill its section) and lists each
      repair with its section, part and bar; the critic shows them first; `{ strict: true }` keeps the old errors.
      *`test/score.test.mjs` arranges a song with nine kinds of mistake: no errors, nine repairs, the bars after
      each mistake in time.*
- [x] The reverbs and delays of a cue rendered in parallel run in the worker pool, not on the page's thread.
      *Rendering a cue on three Node workers, the longest stretch the calling thread was busy: 2.3 s to 0.18 s
      (`lantern_road` battle), 1.5 s to 0.18 s (`set_orchestral` title).*
- [x] The ears hear keys better: Bellman-Budge profiles, in `engine/ears.mjs` and `tools/ears.py` alike.
      *All 31 tonal cues of the cue sets and the songbook, against 27 with Krumhansl-Kessler's.*
- [x] A MIDI export keeps the notes after a fermata on their beat (the held steps get a slower tempo), and a MIDI
      import reads them back as holds (a bar plays at its fastest tempo, a slower run inside it is held exactly as
      long); a MIDI import takes `dynamic`, the level the file's commonest dynamic should be.
      *`beethoven5`, with its fermatas, comes back from a MIDI file note for note.*
- [x] `ode` and `beethoven5` are default-mode imports: the choir sings the words, the fermatas hold their notes.
      *Audiobox, first minute: 6.85 / 7.86 and 6.35 / 7.82.*
- [x] The cue sets and the songbook are on the demo page (0.9.0).
- [x] my-3d2dge's `E.MGA` clock follows a cue whose tempo changes.
      *[michaelcrosato/my-3d2dge#234](https://github.com/michaelcrosato/my-3d2dge/pull/234), merged as `9a2bb91`
      (v0.106.2): on each beat the clock is set to reach where the music is by the next beat. Over ten minutes of a
      cue at 120, 77 and a rit. from 140 to 90 (headless) it was never more than 3 ms from the music.*

### After the review: the rest of its list (0.11.0)

- [x] Compare the orchestra with recordings. Two public-domain recordings of the Fifth's first movement, kept in the
      ignored `ref/` and used for analysis only: George Szell and the Cleveland Orchestra, 1967 (an FM broadcast on
      archive.org, CC0) and an unnamed one marked public domain (archive.org, mono).
      *The spectrum: the broadcast is too dark to judge by (centroid 288 Hz); against the other our render is close
      (centroid 784 Hz against 864, a little more bass and fewer low mids). The dynamics were the gap: loudness range
      16.8 and 16.9 LU in the recordings, 12.9 in the render. `song.dynamics` stretches the range between the marks,
      and imported concert scores now take 1.2: 15.8 LU. Audiobox, first minute: `beethoven5` 6.82 / 7.91,
      `ode` 6.40 / 7.88. A comparison family by family needs recordings of each family alone, which these are not.*
- [x] The cue's master in the pool, and the mix summed in slices: the calling thread is busy for at most 0.12 s at a
      time while a cue renders on three workers (`lantern_road` battle; 0.07 s for `set_orchestral` title).
- [x] Humdrum **kern in JavaScript (`importKern`), reading as `tools/kern.py` does, note for note; and since 0.11.1
      the config-driven piano splits (`tools/import_score.mjs imports/moonlight.json`), writing the file
      `tools/import_score.py` writes, byte for byte. No import needs Python any more.
- [x] The piano at soft dynamics, compared with recorded notes.
      *`beethoven_moonlight` scores lower on Audiobox the softer it plays (quality 7.79 at mf, 7.38 at pp, first
      minute), so the piano's soft end was measured against recorded piano notes: the University of Iowa's C2 to C5
      at pp, mf and ff (free to use; in the ignored `ref/`, analysis only). It is not a defect. Over the first second
      the recorded pp notes are darker than ours (C4 centroid 257 Hz against our 404, C5 449 against 593), and pp
      sits as far below ff (24 to 26 dB recorded, 23 to 25 ours). A brighter felt (`felt: [1200, 3800, 1.2]`) lifts
      Moonlight at pp to 7.62 but moves the piano away from the recordings and costs every piano piece 0.03 to 0.08
      of enjoyment, so the default stays. Audiobox prefers a brighter piano than a real one at pp; the committed
      Moonlight stays at mf, the louder reading, by that preference. The one gap the notes showed was at the bottom:
      our C2 at ff was darker than the recording (centroid 302 Hz against 530). The `bassBright` option eases a
      bass note's partial fall-off as it is struck harder: at 0.5 our C3 at ff matches the recording (458 Hz) and
      C2 comes to 466 Hz, with pp unchanged. On Audiobox it costs Moonlight 0.09 of quality and Joplin 0.03 (Mozart
      unchanged), so it is an option, calibrated, and the default stays at 0.*

- [x] The orchestra family by family, against recorded instruments.
      *Each preset played the notes of a recorded chromatic run at mf (the University of Iowa's anechoic recordings,
      in the ignored `ref/`, analysis only), and their third-octave long-term spectra were compared. Ten presets got
      a correction EQ fitted to the recordings, with their gains recalibrated: violin and the violin section (10 to
      12 dB too bright above 6 kHz), cello and the cello section (too boomy, too little at 0.8 to 2.5 kHz), horn (too
      bright above 1.2 kHz), trumpet (too bright above 4 kHz, too thick at 200 to 600 Hz), viola and the viola section,
      flute, bassoon and trombone (RMS difference 9.2, 5.0, 8.6, 5.6 dB before, 3.5, 3.0, 5.1, 2.6 after). Audiobox,
      first minute rendered alone: `beethoven5` 6.79 / 7.89 before, 6.97 / 7.93 after; `ode` 6.32 / 7.59, 6.50 / 7.51;
      the `set_orchestral` title cue 7.22 / 7.96, 7.27 / 8.00. Then the clarinet, fitted at written pitch (its
      recording's labels are a B-flat clarinet's written notes: 9.0 dB to 6.9), and the tuba, whose source was 10 to
      54 dB too dark above 500 Hz (the brass filter's cutoff is a multiple of the fundamental, and a tuba's is low):
      its brightness range is now [3, 30] times the fundamental, with an EQ after it (25.3 dB to 5.0); the oboe, up to
      25 dB too bright above 2 kHz (13.8 dB to 6.5); and the double bass and its section, kept far too dark by a
      level-following low-pass (12.8 dB to 3.3). With all fifteen: `beethoven5` 6.97 / 7.91, `ode` 6.69 / 7.57, the
      `set_orchestral` title 7.28 / 8.00 (first minute rendered alone).*

- [x] The sections against a recorded section.
      *Bach's Brandenburg Concerto No. 3, I (strings and harpsichord continuo; a public-domain recording on
      archive.org, in the ignored `ref/`, analysis only) against `brandenburg3` at 0.12.0, by third-octave
      long-term spectrum over the whole movement. Without the harpsichord, our string sections match the recorded
      section within 4 dB from 80 Hz to 8 kHz (centroid 724 Hz against 639), so the solo corrections hold for the
      sections. With it, the render is 8 to 17 dB too bright above 5 kHz: the harpsichord continuo, which sits far
      under the strings in the recording, plays at its full calibrated level and is too bright. At 4 dB quieter with
      a high shelf of -12 dB at 4.5 kHz it came within 4 dB, but the owner asked to stop changing the sound for now
      (2026-11-16), so the harpsichord was left as it was; it got that change in 0.14.0 (M8). The recording's loudness
      range (9.3 LU against our 4.4) is the
      players' terraced dynamics, which the score does not mark.*

### M8. The north star, kept in this repository (0.12.2 to 0.14.0)

The owner's word (2026-11-17): the work stays in this repository, and everything the north star needs is here.

- [x] The scope, written where every agent reads it: `CLAUDE.md` ("Scope: this repository only"), `docs/GOAL.md`
      (the north star and the scope; the first `/goal` is in git history), the README and this file's Purpose.
      *Searched: no code, test, tool or workflow here reads or writes another repository. The other repositories
      appear only as links in the docs and in M6's record.*
- [x] A piece, not only a game's cues: `node tools/render.mjs quartet.abc` renders a score file once, start to end,
      to `out/quartet.wav`, after the same report of voices and import warnings that `npm run ears` prints; a song
      module's path works too. *`test/ears-cli.test.mjs`.*
- [x] The piano pedals where the score marks it: `!ped!` presses (again, a change), `!ped-up!` lifts.
      *`test/abc-book.test.mjs`. A pedal that follows the bass (`pedal: 'bass'`, as the kern and MIDI imports
      have it) changes at every note of an arpeggiated left hand, so ABC has no shortcut for it: the score marks it.*
- [x] Voice names an agent writes: two or more of Soprano, Alto, Tenor, Bass are a choir, with words or without
      (alone, "Alto" was a viola and "Bass" a piano); "Solo Soprano" one singer; "Choir" the part its register is;
      a bare "Bass" the bass of the music around it (bass guitar, synth bass, triangle, or the string basses).
      *`test/abc-book.test.mjs`. No committed song changes: `npm run golden` reports every song the same.*
- [x] The guide starts from composing: `docs/AI_GUIDE.md` opens with a piece for strings in ABC, which
      `test/guide.test.mjs` imports, checks and renders, then the songbook of cues for a game, then "Make it sound
      good": mark the dynamics, the instruments that sound best, ranges, voicing, melody, phrasing.
      *The same eight bars on ten ensembles, Audiobox enjoyment / quality (rendered once, start to end, 21.7 to 23.7 s;
      measured again at 0.13.0): brass 6.62 / 7.93, piano 6.52 / 7.85, band 6.32 / 8.23, string sections 6.28 / 7.90,
      choir 6.28 / 6.97 (some notes above its range), woodwinds 6.20 / 7.63, flute, clarinet, violas and cellos
      6.17 / 7.78, synths 6.09 / 7.94, solo strings 4.96 / 7.55, chip 3.94 / 6.96. A small piano nocturne with pedal
      marks: 6.26 / 7.89 (0.12.2).*
- [x] A trial, which the owner counted as the trial of the north star (2026-11-17): three fresh agents composed
      from `docs/AI_GUIDE.md` alone (no engine or song sources), a piano waltz (32 bars), a heroic orchestral theme
      (20 bars, 16 voices) and a pop-rock band tune (24 bars), and reported what got in their way. Everything they found that changes no sound is fixed (0.13.0, CHANGELOG):
      - dynamics now reach the band, synth and chip presets;
      - the critic checks an ABC melody against its chords;
      - hairpins end where ABC puts them;
      - drum chords, orchestral percussion, per-voice gain and pan, single-tune intros and `--once`;
      - warnings for every silent drop, and the guide's gaps.
      *Their final scores pass the ears with no import warnings and no critic notes. Audiobox, rendered once at 0.13.0:
      the waltz 7.50 / 8.16, the orchestral theme 7.11 / 8.04, the band tune 6.89 / 7.79 (6.71 / 7.71 before its
      dynamics applied). The repository's own `lantern_road` title is 7.17 / 7.92 and `set_orchestral` title
      7.28 / 8.00, first minute. The scores are in the session's scratchpad, not the repository.*
- [x] The sound changes the trial found, on the owner's word (2026-11-17): each measured before and after, and kept
      only where no committed song got worse (0.14.0).
      - **Kept: the solo strings' vibrato** at 60% of its depth (violin 0.144 semitones). The solo quartet went from
        4.96 / 7.55 to 5.64 / 7.67.
      - **Kept: the band kit's quiet pieces raised**, four quarter hits at mf in LUFS: closed hi-hat -38 to -30, open
        hi-hat -33 to -28, cross-stick -33 to -27, ride -28 to -25, tambourine -35 to -29. Kick and snare stay at -20.
      - **Kept: the electric guitars keep their level up the neck** (`keyTrack`, dB per octave above middle C:
        distortion 4, electric 3, acoustic 2). The distortion guitar from C3 to C5 now holds within 0.4 dB: -21.6,
        -21.5, -21.2 LUFS, where it fell from -20.2 to -25.6.
        *The band trial tune, with the kit's change, went from 6.89 / 7.79 to 6.99 / 7.86, and the band ensemble from
        6.32 / 8.23 to 6.34 / 8.24.*
      - **Kept: the glockenspiel 4 dB louder** (calibration target -25 to -21 LUFS; 2.3 dB under the violins' phrase,
        not 6.3). *The orchestral trial theme scores the same, 7.11 / 8.04.*
      - **Kept: the harpsichord as continuo**, quieter (target -24 to -28 LUFS) and darker (a high shelf of -8 dB at
        5.5 kHz), in the preset and in `brandenburg3`.
        *Against the recorded performance, first minute: above 5 kHz the render was 14.3 dB too bright and is now
        6.6; the spectrum's RMS difference from 80 Hz to 8 kHz went from 4.8 to 3.7 dB. Audiobox: enjoyment 7.31 to
        7.40, quality 7.85 to 7.85. Of four settings tried this one is better on every measure. A shelf of -12 dB at
        4.5 kHz came closer to the recording (4.4 dB) but scored quality 7.80.*
      - **Not kept: dynamics for the harp.** Tried three ways; each lowered `lantern_road`, whose harp is marked soft:
        - full range, recalibrated: town cue 6.61 / 8.01 to 6.52 / 7.92;
        - full range at the old gain: 6.44;
        - half the range: 6.54 to 6.57.

        Its title fell from 7.20 to 7.17 or 7.18 in every case. So the harp plays every note alike, which is settled,
        not pending. Every committed song but `brandenburg3` renders as before.

### M9. Takes, a limit, and a trial in four styles (0.15.0)

The owner's word (2026-11-17): score the music with what generally works, but limit how many times an agent loops
to improve the score, and keep the songs that score low and improve with iterations, so that over time the owner
can listen across the range and learn whether the same songs improve as the scores say. Then work on what was
started but not finished, or planned but not started.

- [x] Takes, with a limit. `npm run take -- piece.abc` keeps each version of a piece in `takes/<piece>/`: the score,
      what the checks found, the Audiobox scores of each cue's first minute and the engine version.
      - Five takes at most.
      - A revision is a gain when it is clean (no import warnings, no critic notes, PASS) and either it is the first
        clean take or it adds 0.1 enjoyment to the best take; two revisions without a gain stop the piece, and the
        tool refuses a take after a stop.
      - The best take is the first, replaced by each later gain.
      - `npm run takes -- listen NAME --blind` renders the takes in a random order to listen to; `heard` records
        which sounded better and whether the scores agree; `rescore` measures them on a new engine.

      *`test/takes.test.mjs`: the limit, the stop and the best take; every kept take still imports and arranges;
      `takes/README.md`'s table is current.*
- [x] Audiobox runs in the cloud container: torch (CPU) and `audiobox_aesthetics` in a scratch Python, the model's
      checkpoint from dl.fbaipublicfiles.com (`MGA_AUDIOBOX_CKPT`), as Hugging Face refused the download (429).
      *It reproduced the guide's ensemble table at 0.14.0 exactly, ten of ten.*
- [x] A trial in the styles that score lowest. Four fresh agents composed from `docs/AI_GUIDE.md` alone, within
      the limit, and every take is kept in `takes/`. Enjoyment / quality as each take was made (0.14.0):

      | Piece | Takes | Scores | Stopped |
      | --- | --- | --- | --- |
      | `hymn`: SATB with original words, 81 s | 3 | 6.62 / 7.05, 6.70 / 6.82, 6.72 / 6.78 | +0.08 and +0.02 |
      | `quartet`: four solo strings, 67 s | 4 | 5.69 / 7.50, 6.08 / 7.65, 5.98 / 7.64, 5.86 / 7.59 | take 2 best |
      | `chip-overworld`: a chip cue | 3 | 5.96 / 7.99, 5.95 / 7.96, 6.01 / 7.98 | +0.05 at most |
      | `synth-chase`: a synthwave cue | 3 | 6.45 / 8.09, 6.31 / 8.05, 6.51 / 7.98 | -0.14, +0.06 |

      *Of nine revisions, one gained 0.1 or more as the tool then ruled: the quartet's balance fix (+0.39). New
      sections, new themes, ornamented reprises and fuller voicings moved enjoyment by -0.22 to +0.08. On 0.15.0
      (`rescore`) the chip and synth takes score as before; the quartet's 5.74, 6.11, 6.00, 5.92 (the drift, slurs
      and tremolo below); the hymn's first take 6.61 / 6.88, its words now sung under their notes. Under 0.15.0's
      rule the hymn and the synth cue have two takes left: the hymn's take 3 gains 0.11 on its first; the synth
      cue's first take now carries two import warnings (the toms the new drum warning catches), so its take 2 is the
      first clean one, and take 3 gains 0.20 on it.*
- [x] What the trial found, fixed (CHANGELOG 0.15.0):
      - ABC words were sung a line late: `w:` lines now belong to the music above them, with ABC's alignment marks.
      - A sharp carried to the bar line on a drum staff turned toms into hi-hats in silence: now a warning.
      - Chord symbols within a bar were spread evenly, so the critic misread a melody's chord tones.
      - Slurs joined only their last note; measured tremolo was struck note by note on solo strings.
      - The stems table needed Python; the report called every drum voice "percussion".
      - ABC had no duty cycle for a chip pulse, and no ducking or delay for synthwave.
      - The best take could win by less than the gain the limit counts.
      - The guide: words and how they are sung, drum chords, tempo heard at two thirds, an accompaniment two
        dynamics under the melody, the dull and muddy warnings on solo strings and choirs.
- [x] The planned items below, from the list this milestone started with:
      - per-part loudness in the ears (`sections:` under PASS or FAIL, and the stems table by section);
      - ABC: dynamics and hairpins within a bar, glissandi, harmonics, drum ghost notes, flams and drags,
        double-tracking (`%%double`);
      - the solo strings: three changes tried, one kept, a pitch drift of +/-4 cents. *The guide's piece for four
        solo strings went from 5.64 / 7.67 (0.14.0) to 5.73 / 7.71; a quicker bow start and a wider drift were
        measured and not kept (CHANGELOG).*
- [x] Found on the way: only the piano played grace notes, though every importer kept them (now every instrument;
      `ode` and `schubert5` render differently from 185 s and 61 s, and `schubert5`'s second minute scores 6.98 / 7.85
      either way); `{gag}` lost its second g; the critic checked preset ranges only when the presets had been loaded
      first.
- [ ] Listening to the takes, by anyone who wants to check the scores by ear: `npm run takes -- listen <piece>
      --blind`, then `npm run takes -- heard <piece> B A`. The "Heard" column of `takes/README.md` counts the verdicts
      and how many the scores agree with. *Not ticked, and not required: the takes and their limit work on the scores
      alone. Ranking several takes that score within a few hundredths of each other is hard by ear; one pair far
      apart (the quartet's takes 1 and 2, 0.37 apart) is the easier place to start, and "they sound the same" is a
      useful verdict too.*

What is left, in the order it would help the north star most:

1. **Listening to the takes**, optional: whether the scores track what is heard, and so whether a gain of 0.1 and
   a limit of five takes are right. In this trial the scorer moved little for changes of melody, harmony and form,
   and most for a change of balance. *Deferred (M14): it needs a person's ears, and nothing waits on it; the takes
   and their limit work on the scores alone.*
2. More trials when the owner wants them: a band, an orchestral game cue, a piano piece, or other agents. Each
   starts the same way (fresh agents, `docs/AI_GUIDE.md` alone) and keeps its takes in `takes/`. *Deferred (M14):
   the owner's call. The games themselves were the next trial (M13).*
3. **The sound.**
   - The solo strings are still the weakest: 5.73 against the sections' 6.32 on the guide's piece (0.15.0). *Deferred
     (M14): six changes tried across 0.14.0 to 0.22.0, two kept (the vibrato, a pitch drift); more bow noise
     (+0.01) and more of the room (+0.06) gained less than the 0.1 a change must. What is left is the model of one
     bowed string, not a setting.*
   - **Done in 0.22.0 (M14): the choir is less muddy** (the hymn's low mids from 35% to 27% of its energy).
4. **What ABC cannot express yet:** tempo changes within a bar; guitar bends, slides, hammer-ons and pull-offs;
   half-open hi-hats; a second verse of words. *Deferred (M14): no game has needed them. None of the 32 newest games
   builds its music from ABC (M13: the 15 that gave up their songs write the score format). Meanwhile a tempo
   changes on a bar line (`[Q:1/4=92]`), a glissando stands in for a slide, a verse sung twice is written out twice,
   and a mark the importer does not know is left out with a warning that says how to write it.*
5. **Done in 0.22.0 (M14): a piece played once is scored on its last minute too** (the hymn: 6.75 on its first
   minute, 5.97 on the last, which holds its Amen). A game cue is scored on its first minute, which is the whole of
   most: of 99 game cues measured (M13), the median is 27 s and 86 last a minute or less.
6. The loudness range of scores with few dynamic marks (Baroque terraced dynamics): the import plays what is
   marked, and the guide tells agents to mark everything. *Settled (M14): guessing dynamics would change the score;
   an agent marks them, and an import keeps what its source marks.*

### M10. A library of public-domain music (0.16.0)

The owner's word (2026-11-23): compose the top 100 public-domain scores and make an interface to listen to them, so
the work is done ahead of time: nothing original, just feeding the machine sheet music.

- [x] **The library** (`library/`, `npm run library`): famous public-domain works as the sheet music they were
      written in, each score unchanged from its source, with its source and licence in `library/library.json`.
      - **Sources:** OpenScore Orchestra full scores (CC0, Hauptstimme @8f677853); PDMX scores under CC0 with no
        licence conflict, of works checked to be public domain by composer and date; Mutopia's public-domain
        engravings (MIDI). Rule 4 holds for every file: `test/library.test.mjs` checks each record and file hash.
      - **Chosen** from 127 candidates found in the three sources: by fame, by an encoding close to the original
        scoring where one exists, and by the checks. The 27 left out were duplicates, less famous pieces, a Holst
        Mars reduction whose staves were in Korean with combined parts (a "vuvuzela" staff), and a Clementi sonatina
        whose MIDI lacks its repeats.
      - **Measured** (0.16.0, the whole of each piece; Audiobox on its first minute): 494 minutes of music; 99 PASS
        and 1 FAIL (below; all 100 pass since 0.21.0, M14); enjoyment median 7.08, from 4.53 (Bach's first cello suite, solo cello) to 7.79
        (Schubert's Ständchen in Liszt's arrangement); quality median 7.85. By group, enjoyment: piano and organ
        7.25 (43 pieces), voices 7.07 (8), orchestra 7.00 (24), folk and carols 6.99 (17), chamber 6.63 (8).
      - **Rendering** took about two and a half hours on four cores, in two or three jobs side by side (render jobs
        share `library.json` under a lock file); Audiobox scores six at a time (all at once asked for 30 GB).
- [x] **The importer, fixed where the library found it wrong:**
      - D.C., D.S., To Coda and Fine are taken (they were ignored: Beethoven's Ninth, II, lost its da capo and coda,
        9:22 against 12:40 now; a minuet did not return after its trio).
      - `soundTempo`: a transcription plays at its own playback tempo. PDMX's scores played at the wrong speed in
        a third of the candidates: their words disagreed with their meter ("Adagio" over alla breve), or the word
        table did not know them and fell back to 120 (Clair de lune at 2:39 against its 4:03).
      - A Mutopia MIDI file plays its repeats once (LilyPond writes them out only when asked), so Für Elise and the
        first Gymnopédie come from complete PDMX scores instead.
      - Choir staves in transcriptions without voice sound IDs: "Alto" played on violas, "Bass" on the soprano
        choir. A staff that maps to a choir or has words of its own now sings the voice it is named for.
      - `instruments`, a part's preset chosen by name: Aida's high priest Ramfis (a tuba before), Lakmé and
        Mallika (English horns), the Spanish names in the Sorcerer's Apprentice (cellos and basses on violins), and
        the renamed staves of a band arrangement (its tubas played by violins).
- [x] **A page to listen to them** (`npm run library -- page`; `--audio m4a` for small files): every piece, its
      composer, year, length and Audiobox score, searchable and sortable, with a player. The audio stays out of the
      repository (rule 1); the owner's copy is a private page with the renders.

What is left:

1. **The sung voices** are the weakest sound after the solo strings. Correcting the shanty's bass line from a
   piano to a bass voice took its enjoyment from 7.27 to 5.75; the solo tenor of "La donna è mobile" scores 5.39.
   *Better in 0.22.0 (M14): 6.27 and 5.64. Still the weakest after the solo strings: a better sung voice needs a
   better model of one (a glottal source, breath and vowel transitions), not another setting.*
2. **Done in 0.21.0 (M14): the click detector hears an entry swelling in** after a strike (Aida's Triumphal March
   at 7:46, the library's one FAIL).
3. **Done in 0.21.0 (M14): a piece for one instrument is not stretched** (`CONCERT_DYNAMICS` is for ensembles), so
   Clair de lune needs no `adjust`.
4. Many PDMX pieces are piano arrangements of orchestral works (the Blue Danube, the Ride of the Valkyries, the
   Nutcracker): CC0 full scores of them would sound closer to the originals. Träumerei plays its repeats once.
   *Deferred (M14): it needs scores the library's three sources did not offer (CC0 full scores of these works, a
   complete Träumerei); a piece is swapped when one is found, through `npm run library -- check`.*

### M11. A library of common sound effects (0.17.0)

The owner's word (2026-11-24): build out an array of standard sound effects that would be common.

- [x] **The library** (`engine/sounds.mjs`) grew from 58 sounds in seven categories to 221 in eleven:
      interface 26, movement 28, combat 36, magic 20, pickups 16, doors and mechanisms 17, and four new categories:
      the world (breakables, physics, weather) 21, creatures 14, machines and vehicles 17, jingles 9; ambient loops
      17. Every sound has a `desc`, what it is in a few words (`glass shattering`), for people, captions and the check
      below. `SOUND_CATEGORIES` lists the categories. The 58 earlier sounds render exactly as before (their golden
      hashes did not change), and so do the songs.
- [x] **The models** (`engine/sfx.mjs`), every new setting off unless a spec asks for it:
      - `scatter`, a tenth layer type: many small strikes of one material, spread over a span (glass shards, debris,
        coins, a chain) or bouncing, each gap and strike smaller than the last (a shell casing, a ball, a pipe);
      - for any layer: `trem` (a wobble, or a gate with a duty: alarms, wings, crickets), `vowel` (a formant filter
        that keeps the layer's level: growls, moans, a howl, a choir), `rep` (played again: knocks, a burst of fire)
        and `seq` (played as notes: jingles, a keypad, a computer's beeps);
      - `room`: a reverb tail for a one-shot, from the FDN reverb in `fx.mjs` (shots, thunder, bells, roars);
      - five footstep surfaces: sand, mud, leaves, tile, carpet;
      - in a loop, a layer with an `at` is an event (a bird's call, a far rumble); the others run the whole loop.
- [x] **A check that a sound sounds like its name** (`npm run sfx -- match`, `tools/sfx_match.py`): a CLAP model
      (`laion/larger_clap_general` at `ada0c23a`) embeds each sound and each description; each description's scores
      are standardized over the library (some match everything a little: without that, "a health pickup chime" was
      the best match for 18 of the first 58 sounds), and each sound's own description is ranked among all 221.
      - **Measured** (0.17.0, seed 1): 43 of the 221 rank their own description first, 113 in the top five; median
        rank 5 (chance: 111). Median rank by category: ambient 2; combat, world, machines 4; movement, creatures 5;
        magic 7; jingles 8; pickups 9; doors 10; interface 13. The 163 new sounds: 33 first, 88 in the top five,
        median 5; the 58 earlier ones, among the same 221: 10, 25, median 7.
      - **It shaped the work:** 18 new sounds were redesigned after the model heard them as something else. The
        reload rang like interface blips (rank 171) until it was dry clicks in a small room (4); a kick with a
        whoosh before it was heard as a slash (78), without the whoosh as a kick (3); the bell was heard as a gun's
        click (52) until its partials became sine tones (1, and three times faster to render); a gulp was heard as
        knocking (107), a lower, wetter one as water (17); the zombie's groan went from 134 to 16, the sword pickup
        from 72 to 1.
      - **Its limits:** it knows little about menus (interface median 13: `ui_popup` is heard as bubbles,
        `ui_close` as a sword swing, both close to their own words), and some foley stays hard for it (`page_turn`
        51, heard as footsteps in snow; `bite` 64; `dry_fire` 71). A learned listener: it finds sounds that miss, it
        is not a gate.
- [x] `npm run sfx` (`tools/sfx.mjs`): every sound's category, length, loudness and description; `render` writes
      `out/sfx/NAME.wav`; `match` runs the check above; `match --try FILE` ranks new specs against the library before
      they join it.
- [x] Tests (`test/sfx.test.mjs`): every sound on two seeds is finite, under the ceiling (its true peak too, since
      0.20.0), a length for its
      category and within 1 dB of its loudness; each has its own description; the new settings do what the docs say
      (`rep`, `seq`, `trem`, `vowel`, `scatter`, `room`, events in loops, the surfaces). `test/guide.test.mjs`: the
      guide lists every sound once.
- [x] Render times (Node, warm, seed 2): one-shots median 16 ms, at most 182 ms (`ghost`); loops up to 268 ms
      (`amb_space`). The bundle: 104.2 KB gzipped, from 93.7 (7.7 KB the sounds and models, 2.8 KB their
      descriptions); its budget is now 110 KB.

What is left:

1. **No person has listened** to the new sounds. The checks say each is clean, at its level, and mostly heard as
   what it is named; ears would say which are good, and which only pass. *Deferred (M14): it needs a person; the
   demo page's sound board (`npm run page`) plays all 232.*
2. **Interface sounds and some foley** are where the model is least sure (above). A listening pass, or a second
   model, would say whether they need work. *Deferred (M14): CLAP is the one listening model here, and it is a
   finder, not a gate; a person or a second model would decide.*
3. **Done in 0.20.0 (M14): the first play renders in the worker,** not on the page's own thread (it held it for up
   to 0.34 s); preloading makes a first play immediate.
4. **Jingles are short synthesized tunes.** Longer ones belong in the music, written as sheet music: a cue's
   stingers (`%%stinger`), which play on the beat with the music around them. *Settled: by design.*
5. **Done in 0.20.0 (M14): the ceiling holds the true peak** (-1 dBTP; sharp transients read up to -0.33 dBTP
   under the sample-peak ceiling).

### M12. The path for game agents

The owner's word (2026-11-24): agents should find it easy to use the repository (its API, and an MCP server or a
connector if those were needed). The evidence came from the games already using it.

- [x] **How games use it today** (52in1 at `98a3b92`, read 2026-11-24): 248 of the 3,217 files in its `games/` use
      my-game-audio, written by GPT-6.x agents from briefs that pin a commit of this repository and paste
      `dist/my-game-audio.js` into the page (229 at 0.14.0, 15 at 0.16.0). Their own code, with the pasted engine
      taken out: `createPlayer` in 238, `unlock` 243, `music` 242, cues 221, stingers 224, layers 199, voices
      (`say`) 223, `prepare` 119; music at 10% as briefed. What they missed:
      - **No game checked its music.** No game or brief mentions `npm run ears` or `tools/ears.mjs`.
      - **They make their own sound effects.** Their most used names (`select`, `confirm`, `cancel`, `jump`,
        `bump`, `pause`, `boom`, `powerup`, `coin`) are their own specs; a library name (`ui_confirm`) appears in
        7 of the 248.
- [x] **`docs/GAMES.md`**: one page for a game's agent and for whoever writes its brief:
      - the file to include and how to pin it;
      - the player code;
      - a songbook template;
      - the check, which needs no install (`node my-game-audio/tools/ears.mjs music.abc` from a clone; the
        template passes in about 4 s);
      - a table from the names games use to the library's sounds;
      - voices, including a cast of one's own;
      - a brief to paste.

      `test/games.test.mjs` keeps it true: its songbook passes the ears, and every sound, voice, emotion and player
      method it names exists.
- [x] **`AGENTS.md`** (the file most coding agents read first) says which document to read for which job.
      **`llms.txt`** is the index for agents that look for one. The README, CLAUDE.md and the AI guide point to
      GAMES.md, and CLAUDE.md now says its rules are for work on this repository, not for a game that clones it to
      run the checks.
- [x] **No MCP server or connector.** The games' agents fetch files and run commands already; what they lacked was a
      short path and the check step. A hosted check would matter only for agents that cannot run Node.

What is left:

1. **See whether the next games** run the check and use the library's sounds. Their briefs come from the owner's
   prompt; GAMES.md ends with a brief to paste. *Deferred (M14): it needs the next games; measure them as M13 did.*
2. **Done (M14): version tags.** `.github/workflows/tag.yml` tags each version on `main` (`v0.17.0` on), and GAMES.md
   pins a tag.

### M13. What the games' music showed, and better defaults for it (0.18.0)

The owner's goal (2026-11-24): make this the standard way game-building agents get consistent, good music, voices
and sound effects. It began with the games themselves.

- [x] **Measured** (52in1 at `98a3b92`): the 32 newest games that embed my-game-audio, loaded headless from scratch
      copies that hand back their music, sound and voice tables (52in1 itself is only read).
      - 30 of the 32 handed over their songs: 25 write them in the score format, and 5 write ABC songbooks they
        import as they load. (The first capture read the pages' top-level tables and found 15, none of them ABC;
        hooking the engine's own `music()` and its ABC import found the other 15. Two, Devil's Bell III and cellar
        of evil, wire the engine in a way neither hook reaches.) The numbers below, before this table, are for the
        first 15.
      - **The checks:** with the 0.17.0 engine, 55 of their 57 cues pass the ears (96%), and 14 of the 15 games pass
        every cue. The two FAILs (clicks) came from notes the parser could not read: marks written before the
        length (`D4!:3`, `A2^:2`), so the notes were left out and the bars padded with rest.
      - **Warnings on most:** little energy above 6 kHz (27 cues), muddy low mids (23), bass-heavy (16).
      - **Audiobox enjoyment** of each game's first cue: median 5.35, against the classics library's 7.08. The
        cause: raw synth specs (`{ type: 'brass' }`, `{ type: 'pluck' }`, `va` basses cut at 437 to 1,650 Hz), 13 of
        15 songs with no reverb, and their own master levels (-17 to -21 LUFS in 9).
      - **The same notes, other instruments:** on the nearest presets the median was 6.01; on presets in the room
        an ABC import would give them, 6.13. That was better in 10 of 15, and the lowest went from 2.56 to 6.09.
        A room alone gave 5.63.
      - **Sounds:** 210 home-made sound effects in 14 games, all rendering cleanly, at levels the games chose
        (-18 to -30 LUFS). 21 share a library name. The most common are sports sounds the library lacks: crowd in
        7 games, whistle in 6, net and post in 4.
      - **Voices:** 27 hand-made voice profiles. Games cast their own characters.
      - **Each game, through `tools/ears.mjs`** (every cue each song defines, 135 in all, on the 0.17.0 engine from
        its tag and on 0.23.0; an ABC songbook is checked as the ABC it is):

      | Game (build) | Music | Cues | PASS, 0.17.0 | PASS, 0.23.0 | Critic notes, 0.17.0 | Critic notes, 0.23.0 | Warnings, 0.23.0 |
      | --- | --- | ---: | ---: | ---: | --- | --- | --- |
      | Baseboost Baseball (astra) | score | 3 | 3 | 3 | 0 | 0 | muddy 3 |
      | Baseboost Baseball (sol) | score | 3 | 1 | 3 | 10: unreadable notes 6, padded bars 4 | 0 | muddy 3 |
      | BasketFlux Basketball (astra) | score | 3 | 3 | 3 | 1: repeated bars 1 | 1: repeated bars 1 | dull 2, muddy 1, bass-heavy 1 |
      | BasketFlux Basketball (sol) | score | 3 | 3 | 3 | 1: repeated bars 1 | 1: repeated bars 1 | dull 2, bass-heavy 1 |
      | Crisis by Six Incredible Crisis (astra) | score | 16 | 16 | 16 | 0 | 0 | dull 2, muddy 16 |
      | Cryflux Crysis (sol) | score | 2 | 2 | 2 | 2: repeated bars 2 | 2: repeated bars 2 | none |
      | Crysquall Crysis (sol) | score | 2 | 2 | 2 | 0 | 0 | dull 2 |
      | Deskfeld Seinfeld (sol) | score | 5 | 5 | 5 | 0 | 0 | dull 5, muddy 5 |
      | deuce coupe tennis (astra) | score | 4 | 4 | 4 | 2: repeated bars 2 | 2: repeated bars 2 | none |
      | deuce coupe tennis (sol) | score | 6 | 6 | 6 | 2: a hold with nothing held 1, out of range 1 | 2: a hold with nothing held 1, out of range 1 | dull 1 |
      | evotidemark evoland 2 (astra) | score | 8 | 8 | 8 | 0 | 0 | dull 1, bass-heavy 2 |
      | Family Fix Matters Family Matters TV Show (sol) | score | 3 | 3 | 3 | 0 | 0 | dull 3, muddy 3 |
      | Left 4 Low Tide Left 4 Dead 2 (sol) | score | 6 | 6 | 6 | 1: off its chords 1 | 1: off its chords 1 | dull 6, bass-heavy 6 |
      | Left 4 the Current Left 4 Dead 2 (sol) | score | 4 | 4 | 4 | 0 | 0 | dull 4, bass-heavy 4 |
      | Medal of Dock Duty Medal of Honor (sol) | score | 5 | 5 | 5 | 0 | 0 | dull 5, bass-heavy 5 |
      | Medal of the Watch Medal of Honor (sol) | score | 4 | 4 | 4 | 1: out of range 1 | 1: out of range 1 | dull 4, muddy 4 |
      | Mob Due Mafia II (sol) | ABC | 6 | 6 | 6 | 0 | 0 | dull 1, muddy 4 |
      | Mob on the Docks II Mafia II (sol) | score | 4 | 4 | 4 | 0 | 0 | none |
      | Scrum Dash Rugby (sol) | score | 3 | 3 | 3 | 0 | 0 | bass-heavy 1 |
      | SockItSoccer SoccerAssociationFootball (astra) | ABC | 4 | 4 | 4 | 0 | 0 | dull 3, muddy 3 |
      | SockItSoccer SoccerAssociationFootball (sol) | ABC | 4 | 4 | 4 | 0 | 0 | dull 2, muddy 2 |
      | StickShiftHockey FieldHockey (astra) | ABC | 7 | 7 | 7 | 0 | 0 | muddy 1 |
      | StickShiftHockey FieldHockey (sol) | ABC | 4 | 4 | 4 | 0 | 0 | dull 1, muddy 1 |
      | Team Four Trusses Team Fortress 2 (sol) | score | 3 | 3 | 3 | 1: off its chords 1 | 1: off its chords 1 | none |
      | The Fresh Prince of the Foldout Fresh Prince of Bel Air TV Show (sol) | score | 4 | 4 | 4 | 1: repeated bars 1 | 1: repeated bars 1 | muddy 4 |
      | the incredibly late show incredible crisis (astra) | score | 6 | 6 | 6 | 0 | 0 | dull 2, muddy 4 |
      | Volleyflashpoint Volleyball (astra) | score | 3 | 3 | 3 | 0 | 0 | muddy 2 |
      | Volleyflashpoint Volleyball (sol) | score | 3 | 3 | 3 | 5: a hold with nothing held 2, off its chords 1, repeated bars 2 | 5: a hold with nothing held 2, off its chords 1, repeated bars 2 | dull 1, bass-heavy 3 |
      | wicket voltage cricket (212435) | score | 4 | 4 | 4 | 0 | 0 | dull 4, bass-heavy 4 |
      | wicket voltage cricket (212459) | score | 3 | 3 | 3 | 1: off its chords 1 | 1: off its chords 1 | muddy 3 |

        On 0.17.0, 133 of 135 cues pass and 29 of 30 games pass every cue; on 0.23.0, all 135 and all 30. The
        critic's notes went from 28 to 18: the 10 that went were one game's unreadable notes and the bars padded
        after them (marks written before the length, read since 0.18.0). The 18 left are the agents' own writing: 9
        sections whose four bars are the same, 4 melodies off their chords, 3 holds with nothing held, 2 notes out of
        range.
      - **The balance warnings** (muddy, dull, bass-heavy) are advice, not failures, and they follow each
        arrangement, not its instruments. The 26 score-format songs (25 games, 111 cues) written the way the guide
        asks, with named presets and a room, keep about as many: muddy 49 to 49, dull 44 to 38, bass-heavy 27 to 29
        (their enjoyment is what presets and a room raise: the median 5.35 to 6.13 above). Good music draws them
        too: the showcase cue sets 17 in 34 cues (dull 14, muddy 2, bass-heavy 1), and the library marks 80 of its
        100 pieces dull (all 43 for piano) and 42 muddy. Muddy (44% of the games' cues, 6% of the showcase's) and
        bass-heavy (24%, 3%) are the games' own: low voicings and low bass lines. On the 9 songs with bass-heavy cues
        (39 cues), a quieter bass and kick did little (27 to 25 at -3 dB, 23 at -6 dB); the bass line an octave up
        cleared most (27 to 11, while muddy rose 1 to 7). So each warning, as each critic note, now says what to do
        (0.24.1), the bass-heavy one leading with the octave.
      - **The ABC songbooks' voices** (0.24.0): their instruments come from the voices' names, and some names matched
        none, so they played the piano without a word. "Acoustic Bass", General MIDI's own name, played the bass
        line on the piano in all six of Mob Due's cues; "Brass" did in StickShiftHockey (astra). Now General MIDI's
        names, "Strings" and "Brass" find their instruments, and a named voice that still matches none plays the
        piano with a warning that says how to name it. Audiobox on every cue, against the piano: Mob Due's bass on
        the double basses pizzicato -0.09 on average (kept; 6 cues, from -0.46 to +0.65), on the electric bass
        General MIDI's program plays -0.61 (not kept); the hockey cues on the trumpet +0.01 (7 cues). Stingers with
        no named voice ("Net", "Gloves": the tune's title) still play the piano, as a title is not an instrument.
      - **The games' top problems, and where each stands:**

        | Problem | Seen in | Status |
        | --- | --- | --- |
        | Notes the parser could not read: 2 cues FAIL with clicks, 10 critic notes | 1 game | Fixed (0.18.0): 135 of 135 cues pass |
        | Raw synth specs, no room, their own master levels: enjoyment median 5.35 (the library's 7.08) | 13 of 15 songs with no reverb | Fixed at the cause (0.18.0): presets and a room in one word each, and the guide asks for them; the same notes so written, median 6.13 |
        | ABC voices playing the piano unseen ("Acoustic Bass", "Brass") | 2 of 5 songbooks | Fixed (0.24.0) |
        | The render cache turned off (shared site, pruned by other versions) | 28 of 31 games | Fixed (0.23.0): 1.9 to 4.8 s to music on every visit, 0.07 to 0.29 s once cached |
        | Home-made sports sounds; a voice for each named character | 7 games a crowd, 6 a whistle; 27 profiles | Fixed (0.19.0): 11 sports sounds, `voiceFor(name)` |
        | Critic notes: repeated bars 9, off the chords 4, holds with nothing held 3, out of range 2 | 11 games | The agents' own writing; each note says what to do (0.24.1) |
        | Balance warnings: muddy 49, dull 44, bass-heavy 27 of 111 cues | most games | The agents' own arrangements (above); each warning says what to do (0.24.1) |

        The games themselves are pinned to the engines they were built with and live in 52in1, which this repository
        only reads; what changes is what the next games get.
- [x] **Better defaults** for songs written as data:
      - instruments named by preset (`horn: 'trumpet'`, `{ preset, ...settings }`), with the kits `'drum_kit'` and
        `'chip_noise'`;
      - `room` in one word;
      - a `drums` spec with no kit plays the band kit (it stopped the render);
      - marks before the length read as after it.

      `songOf` fills them in at every render entry point; `test/song-defaults.test.mjs` covers them. With them, all
      57 cues pass. GAMES.md and the AI guide now say to name presets, give a room, and leave the master at -16.
- [x] **The easy path for sounds and voices** (0.19.0):
      - **Sports sounds**, the ones the newest games made most, now in the library, each through the CLAP check
        (rank among 232 descriptions): `buzzer` 6, `applause` 8, `glove_catch` 10, `goal_horn` 14, `post_hit` 14,
        `whistle` 15, `bat_hit` 15, `racket_hit` 20, `amb_crowd` 20, `crowd_cheer` 46, `ball_kick` 49.
        - The cheer and the kick used the five tries: a crowd from shaped noise was heard as a creak (60), and with
          whistles and calls in it worse (67, 77). A chorus of buzzy voices on vowels did best (46).
        - A net swish never sounded like its name (176, 159, 171, 140), so it is not in the library.
      - **A misspelt sound name** says what the library has (`no sound "confirm": did you mean ui_confirm?`): the
        names games gave their own sounds lead to the library's.
      - **`voiceFor(name, base)`** gives a named character a voice of their own, the same every time (games made
        27 profiles by hand). An unknown voice name says so and points to it.
      - **Music at 10% by default:** considered and not done. Every game sets it already (108 calls in the 248
        games, as their brief says), and the demo page and my-3d2dge's adapter set their own levels; a default
        would only hide the setting. GAMES.md shows the call.

### M14. The open work, finished (0.20.0 on)

The owner's goal (2026-11-24), its third step: finish the open work in this file, highest value first. Every item
in the lists of what is left (M9 to M12) is now done, settled, or deferred with its reason beside it.

- [x] **Sound effects off the page's thread, under a true-peak ceiling** (0.20.0):
      - **The first take renders in the quick worker.** It rendered on the page's own thread, once per sound, which
        a game drawing with WebGPU feels as dropped frames. Measured in headless Chromium (a fresh player for each
        sound), the longest the page's thread was busy on a first play:

        | Sound | Before (0.19.0) | After | Starts after the call |
        | --- | ---: | ---: | ---: |
        | `jump` | 16 ms | 2 ms | 20 to 50 ms |
        | `coin` | 35 ms | 3 ms | 59 ms |
        | `explosion` | 35 ms | 2 ms | 41 to 73 ms |
        | `machine_gun` | 60 ms | 9 ms | 150 to 193 ms |
        | `amb_rain` | 134 ms | 8 ms | 222 to 314 ms |
        | `ghost` | 211 ms | 4 ms | 235 to 241 ms |
        | `thunder` | 256 ms | 7 ms | 307 to 354 ms |
        | `amb_space` | 344 ms | 2 ms | 325 to 457 ms |

        A sound played before it is ready starts when its first take arrives, and its handle works meanwhile
        (`stop`, `set`, `playing`). `preload(names)` resolves when the sounds are ready. First takes and speech go
        ahead of other sounds' later takes in the worker's queue: on one warm player, `thunder`'s first play waited
        704 ms behind them, 307 ms after. `npm run page:test` checks that a first play leaves the thread free.
      - **The ceiling holds the true peak** (-1 dBTP, between the samples too, as `ears` measures it). Under the
        sample-peak ceiling, sharp transients read up to -0.33 dBTP (`bat_hit`; `sword_hit` -0.52, `machine_gun`
        -0.65). On seeds 1 and 2, 16 sounds render 0.03 to 0.53 dB quieter and every sound's true peak is at most
        -1.00 dBTP; `bullet_impact` and `bat_hit` have targets 1 dB lower (-23, -24 LUFS), so they stay within 1 dB of
        them. The test checks every sound's true peak on both seeds.

- [x] **Two fixes the library found** (0.21.0):
      - **The click detector hears an entry swelling in.** Aida's one click (7:46) was a triangle struck on the same
        sample as a tutti, piccolo to double basses, whose sound swells in over 10 to 20 ms: a one-sample spike of
        -0.048 out of near silence (0.0037 RMS), then 0.0130 RMS in the next 10 ms against a limit of 0.0131. A lone
        spike now needs little sound for the 50 ms after it, not only the first 10 (0.0182 here). Across 373 local
        renders (the library, the takes, songs and stems) only that count changed: 48 clicks before, 47 after. Both
        ears agree (`engine/ears.mjs`, `tools/ears.py`), and a test builds the case.
      - **A piece for one instrument keeps its marks' own range of dynamics.** The concert stretch (1.2) came from
        recorded orchestras; a MusicXML import whose parts all play one instrument (a piano, an organ, a cello; a
        duet at one piano) is no longer stretched. ABC, MIDI and Humdrum imports never were. Eight solo pieces, the
        same notes with and without it:

        | Piece | Loudness range, stretched | Now | Enjoyment, stretched | Now |
        | --- | ---: | ---: | ---: | ---: |
        | Chopin, Prelude in E minor | 23.4 LU | 13.2 | 7.03 | 6.68 |
        | Liszt, Liebestraum 3 | 20.3 | 13.3 | 7.58 | 7.55 |
        | Debussy, The Girl with the Flaxen Hair | 19.3 | 12.2 | 7.25 | 7.19 |
        | Satie, Gymnopédie 1 | 18.3 | 9.6 | 7.30 | 7.20 |
        | Debussy, Clair de lune | 15.6, FAIL (-20.2 LUFS) | 12.3, PASS | 7.70 | 7.42 |
        | Rachmaninoff, Prelude in C-sharp minor | 13.6 | 12.5 | 7.07 | 7.36 |
        | Beethoven, Für Elise | 5.4 | 5.8 | 7.08 | 7.18 |
        | Bach, Cello Suite 1, Prelude | 2.4 | 2.4 | 4.53 | 4.49 |

        Stretched, the solo pieces spanned more than the orchestral recordings the stretch was made from (16.8 and
        16.9 LU), and Clair de lune failed the loudness check; Audiobox moved by -0.06 on average (first minute,
        -0.35 to +0.29), under the 0.1 the takes count as a gain.
      - **The library measured again** (0.21.0): the 47 MusicXML pieces for one instrument and Aida, rendered whole.
        All 100 pieces pass. The 47 moved by -0.01 on average in enjoyment (0.16.0 against 0.21.0); 10 moved by 0.1
        or more, 3 up and 7 down: the Hall of the Mountain King +0.92 (its pp opening no longer sinks), Rachmaninoff's
        prelude +0.29, Chopin's E minor prelude -0.35, Schubert's Ständchen -0.22. The library's median is 7.06.

- [x] **Clearer choirs and voices** (0.22.0): the eight voice presets get a brighter source (the saw's lowpass at 8
      times the pitch, not 5), a dip of 3 dB at 350 Hz where close harmony piles up, and a lift at 3 kHz (+3 dB for a
      choir, +5 for a soloist: a singer's formant), their gains calibrated again (within 0.4 dB). Six pieces with
      choirs or soloists, Audiobox enjoyment / quality of the first minute, four tries:

      | Piece | Before | Dip and lift | Brighter | Both (kept) | Both, gentler soloist |
      | --- | ---: | ---: | ---: | ---: | ---: |
      | The Drunken Sailor (tenor and bass choirs) | 5.75 / 6.61 | 5.94 / 6.67 | 6.22 / 6.71 | 6.27 / 6.74 | 6.27 / 6.74 |
      | La donna è mobile (solo tenor) | 5.39 / 6.78 | 5.64 / 6.59 | 5.29 / 6.68 | 5.64 / 6.61 | 5.52 / 6.60 |
      | Ombra mai fu (solo soprano) | 6.58 / 7.61 | 6.60 / 7.62 | 6.59 / 7.62 | 6.60 / 7.62 | 6.60 / 7.62 |
      | The evening hymn (SATB, ABC) | 6.72 / 6.78 | 6.73 / 6.83 | 6.78 / 6.71 | 6.75 / 6.74 | 6.75 / 6.74 |
      | Mozart, Dies irae | 7.24 / 7.69 | 7.26 / 7.70 | 7.23 / 7.68 | 7.25 / 7.69 | 7.25 / 7.69 |
      | O Come, All Ye Faithful | 7.11 / 7.79 | 7.10 / 7.79 | 7.10 / 7.79 | 7.09 / 7.79 | 7.09 / 7.79 |
      | Mean | 6.47 / 7.54 | 6.55 / 7.53 | 6.54 / 7.53 | 6.60 / 7.53 | 6.58 / 7.53 |

      The hymn's low mids went from 34.6% to 26.9% of its energy and its muddiness warning went; the shanty's from
      55.8% to 45.3%. The committed cue that sings, `set_orchestral`'s boss, went from 6.76 / 7.51 to 6.80 / 7.53.
      The one loss: the solo tenor's quality, 6.78 to 6.61, with its enjoyment up 0.25. No golden hash changed (the
      golden excerpts end before any choir sings). The library's 15 pieces with choirs or soloists, rendered whole
      on 0.22.0: all pass; enjoyment +0.06 on average, none lower by more than 0.02 (most open without voices, so
      their first minute is unchanged).
- [ ] **Solo strings**, two more tries, neither kept: more bow noise (0.05 to 0.1) moved the three solo pieces by
      +0.01 on average, more of the room (send -14 to -10 dB) by +0.06 (Bach's cello suite 4.49 to 4.54, the quartet
      6.11 to 6.17, the guide's piece on solo strings 5.73 to 5.79). *Deferred: under the 0.1 a change must gain.*

- [x] **A piece's ending scored** (0.22.0): `tools/aesthetics.py --ending` also scores each file's last minute
      (`PATH#end`), and `npm run take` uses it for a piece played once that is longer than a minute: the take keeps
      it as `ending`, and the tool prints it beside the first minute and the best take. It is not counted in the
      gain, so takes scored before compare as they did. The evening hymn: first minute 6.75 / 6.74, last minute
      5.97 / 6.98 (its Amen). The library's table stays on first minutes.

- [x] **The render cache is the page's own** (0.23.0). The newest games' players (52in1 at `98a3b92`, the 32 of
      M13, 31 with options): 28 turned the cache off, 23 ran one render worker, 10 turned streaming off, 28 brought
      their own `AudioContext`. The cause was here: every page shared one IndexedDB database, `my-game-audio`, and
      pruned the renders of every engine version but its own, while 52in1 serves all its games from one site and asks
      each to keep to its own keys; games pinned to different versions deleted each other's music on every visit.
      Now each page has its own database (`my-game-audio:` and its path; `cache: 'name'` names it). Three of the
      games' first cues in headless Chromium, from `music()` to sound:

      | Game | Their options (every visit) | Defaults, first visit | Defaults, next visit |
      | --- | ---: | ---: | ---: |
      | Medal of the Watch (wind, brass, drums) | 2.5 to 2.6 s | 1.4 to 1.5 s | 0.07 to 0.08 s |
      | Scrum Dash (brass, pluck, drums, strings) | 1.9 to 2.0 s | 0.8 s | 0.12 s |
      | Mob on the Docks II (drums, pluck, brass, piano) | 4.4 to 4.8 s | 0.9 to 1.1 s | 0.28 to 0.29 s |

      GAMES.md and its brief say to keep the defaults, with these numbers.

- [x] **The tries each sound change used** (the limit is five, as for takes): the songs' instruments and room
      (0.18.0) 3, the second kept (nearest presets; presets in a room; a room alone); each sports sound (0.19.0) up to
      5 (the cheer and the kick used all 5, the net swish 4 and was dropped); the solo pieces' dynamics (0.21.0) 1;
      the voices (0.22.0) 4, the third kept; the solo strings 6 across 0.14.0 to 0.22.0, 2 kept; the acoustic bass
      (0.24.0) 2, the second kept. The true-peak ceiling (0.20.0), the click rule (0.21.0) and the per-page cache
      (0.23.0) are fixes, each measured before and after once.

- [x] **Version tags**: `.github/workflows/tag.yml` runs on every push to `main` and tags the first commit of each
      version in `package.json` (`v0.17.0` on, annotated, made by GitHub Actions: this session's proxy refuses a tag
      push). GAMES.md and llms.txt pin a tag (`v0.21.0`), with a commit for anything newer.

## Commands that work today

```sh
npm run ears -- quest.abc [--once]              # sheet music: the import, the score and the sound, PASS or FAIL
npm run take -- quest.abc [--once]              # keep this version in takes/: checked, scored; five takes at most
npm run takes                                   # every piece's takes, its best; listen --blind, heard, rescore
npm run library -- check|render|score|page      # the public-domain library: import, render and check, Audiobox, a page
npm run sfx -- list|render|match [--try F.mjs]  # the 232 sound effects; does each sound like its description (CLAP)
node my-game-audio/tools/ears.mjs music.abc     # from a game's folder: check its songbook, no install (docs/GAMES.md)
node tools/render.mjs quest.abc [--stems]       # sheet music to out/quest.wav, start to end
npm run ears -- out/stems/quest                 # who carries which band, each part's level by section
node tools/import.mjs SCORE.mxl songs/name.mjs [--bars 1-40]   # MusicXML to a song, no Python
npm test                                        # 546 tests, about 4.6 minutes on four cores
npm run golden                                  # which songs render differently from test/golden.json
npm run check                                   # about 2 minutes
node tools/render.mjs rollcall                  # every instrument: 38 s on four worker threads (--workers 1: 95 s)
pip install music21
python3 -I tools/mxl_parts.py SCORE.mxl ...     # which preset each part gets
python3 -I tools/import_orchestra.py SCORE.mxl songs/name.mjs [--bars 1-40] && node tools/render.mjs name
node tools/stream_test.mjs orchestral           # streamed against whole render
python3 tools/ears.py out/name.wav              # needs numpy scipy matplotlib pyloudnorm
```
