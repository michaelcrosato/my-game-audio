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

### Engine (`engine/`, 8,255 lines of JavaScript in 24 modules since 0.9.0, no dependencies; the seed's core files:)

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
(`node tools/render.mjs quartet.abc`): the piece once, start to end, to `out/quartet.wav`.

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
- **Sound effects and voices.** Done in M2 (0.3.0). What remains: the voices sing vowels with simple consonants, so
  they read as gibberish by design; sound effects render on the main thread on their first play (10 to 180 ms),
  so `preload()` them while a level loads.
- **Importers.** The MusicXML importer runs in JavaScript since M3 (0.4.0), in browsers and Node, in seconds. Since
  0.11.0 Humdrum **kern does too (`engine/kern.mjs`), and since 0.11.1 the config-driven piano importer
  (`tools/import_score.mjs`); the Python tools remain, and tests hold the two to the same output.
- **Sheet music written by agents (ABC).** Since 0.9.0 (M7): several voices, instruments by name, parts, drums,
  songbooks of cues, lenient bars; since 0.10.0 the score format repairs miscounted bars too (`arr.repairs`); since
  0.12.2 the piano's pedal marks, and choirs, solo players and a bare "Bass" read from the voices' names. What
  remains: the ABC reader has no glissandi or harmonics; a hairpin ramps from bar to bar, to the next dynamic, as in
  every imported score; chord symbols add an accompaniment unless `%%accompany off` (right for a lead sheet, not for
  a full score); a songbook of orchestral and band tunes plays all of them in the concert hall (one room per song).
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
  sings Schiller's words.
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
      the ten cues and for four genres; the player's cues, layers, stingers and callbacks; the 58 sounds and how to
      make new ones; the voices; public-domain imports; a checklist; and render speeds. `test/guide.test.mjs` checks
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
      (2026-11-16), so the harpsichord is unchanged. The recording's loudness range (9.3 LU against our 4.4) is the
      players' terraced dynamics, which the score does not mark.*

### M8. The north star, kept in this repository (0.12.2)

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
      *The same eight bars on ten ensembles, Audiobox enjoyment / quality (rendered once, start to end, 21.7 to 23.7 s):
      brass 6.63 / 7.90, piano 6.51 / 7.86, string sections 6.30 / 7.85, band 6.30 / 8.22, flute, clarinet, violas
      and cellos 6.27 / 7.77, choir 6.26 / 6.91 (some notes above its range), woodwinds 6.22 / 7.60, synths
      5.94 / 7.78, solo strings 4.77 / 7.50, chip 3.86 / 6.92. A small piano nocturne with pedal marks: 6.26 / 7.89.*

What is left, in the order it would help the north star most:

1. The owner's trial: other agents compose from `docs/AI_GUIDE.md` alone. Start the next session from what it finds.
2. The solo strings: the weakest sound in the library (4.77 against the sections' 6.30 on the same music). A change
   to the sound, so it waits for the owner's word.
3. The harpsichord as continuo: quieter and darker under strings (above). A change to the sound.
4. The loudness range of scores with few dynamic marks (Baroque terraced dynamics): the import plays what is
   marked, and the guide now tells agents to mark everything.
5. In ABC: glissandi and harmonics, and a hairpin that ramps within its bar (that last one changes the sound of
   imported scores).

## Commands that work today

```sh
npm run ears -- quest.abc                       # sheet music: the import, the score and the sound, PASS or FAIL
node tools/render.mjs quest.abc                 # sheet music to out/quest.wav, start to end
node tools/import.mjs SCORE.mxl songs/name.mjs [--bars 1-40]   # MusicXML to a song, no Python
npm test                                        # about 2 minutes on four cores
npm run golden                                  # which songs render differently from test/golden.json
npm run check                                   # about 40 s
node tools/render.mjs rollcall                  # every instrument: 38 s on four worker threads (--workers 1: 95 s)
pip install music21
python3 -I tools/mxl_parts.py SCORE.mxl ...     # which preset each part gets
python3 -I tools/import_orchestra.py SCORE.mxl songs/name.mjs [--bars 1-40] && node tools/render.mjs name
node tools/stream_test.mjs orchestral           # streamed against whole render
python3 tools/ears.py out/name.wav              # needs numpy scipy matplotlib pyloudnorm
```
