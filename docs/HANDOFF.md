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
`tools/page_test.mjs` (headless browser). The listening page builds with `npm run page`. `npm run ears` (M5) is the
JavaScript ears: no Python, and it renders every cue of a song as a game hears it.

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
| `brandenburg3` | Bach, Brandenburg Concerto No. 3, I, 11 parts, imported (OpenScore, CC0) | 4:52 | 228 s | D major (G written), 112 | 6.9 / 7.6 (first minute) |
| `schubert5` | Schubert, Symphony No. 5, I, imported (OpenScore, CC0) | 7:31 | 229 s | F major (B-flat written), 129 | 6.9 / 7.9 (first minute) |
| `brahms3` | Brahms, Symphony No. 3, III, imported (OpenScore, CC0) | 4:33 | 149 s | C minor, 108 | 7.0 / 7.8 (first minute) |
| `beethoven_moonlight` | Moonlight Sonata, I, piano, from MIDI with the pedal following the bass (PDMX, CC0) | 6:08 | 29 s | C# minor, 45 | 7.1 / 7.8 (first minute) |
| `joplin_entertainer` | The Entertainer, piano, from MIDI (Mutopia, public domain) | 4:13 | 15 s | C major, 144 | 7.7 / 8.2 (first minute) |
| `mozart_alla_turca` | Rondo alla Turca, piano, from MIDI (Mutopia, public domain) | 2:02 | 8 s | A major, 126 | 7.6 / 8.2 (first minute) |
| `set_chiptune` | Ten original cues (title to ambience) for the NES 2A03 | 10 cues, 23-67 s each | 0.7-1.7 s a cue (four workers) | 9 of 9 tonal cues in their keys | not measured |
| `set_synthwave` | The same ten themes as synthwave | 10 cues, 21-68 s | 1.3-3.0 s a cue (four workers) | 7 of 9 (relative minor, dominant) | not measured |
| `set_orchestral` | The same ten themes for orchestra, on a stage, with string techniques and a Latin choir | 10 cues, 23-76 s | 2.8-7.4 s a cue (four workers) | 7 of 9 (relative minor, dominant) | not measured |
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
  `prepare()` while a level loads. Since M4 a cue's parts render in parallel workers (`parallel`). Contexts not at 44.1 kHz resample
  every buffer.
- **Sound effects and voices.** Done in M2 (0.3.0). What remains: the voices sing vowels with simple consonants, so
  they read as gibberish by design; sound effects render on the main thread on their first play (10 to 180 ms),
  so `preload()` them while a level loads.
- **Importers.** The MusicXML importer runs in JavaScript since M3 (0.4.0), in browsers and Node, in seconds. The
  piano importers (`tools/import_score.py`, `tools/kern.py`: Humdrum kern, MIDI and ABC through music21) are still
  Python.
- **Notation.** Handled since M3 (0.6.0): shared percussion staves, harmonics, glissandi, ornaments and arpeggio
  marks, shared wind and brass staves, breath marks and caesuras, cue notes, fermatas on their own note, pedal marks,
  optional rubato. What remains: tempo words come from a fixed table; harmonics are marked (`*`) but sound as plain
  notes until M4's articulations; a MIDI file without dynamics imports at one level (`beethoven_moonlight` plays at
  mf, where the score asks for pp throughout).
- **Sound.** Since M4 (0.7.0) the strings, winds, brass and choir have their techniques. Choirs sing words. A stage
  places the orchestra, the master EQ thins the low mids, and parts render in parallel. What remains: the orchestra
  still scores under 7 for enjoyment on Audiobox (see M4's first box); the voices' consonants come from a spelling
  table, not a pronunciation dictionary; and the committed `ode` is the Python importer's output, so it sings vowels
  (a default-mode import sings its words).
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

- [ ] Mix: compare each orchestral family's spectrum and dynamics with analysis-only reference recordings (kept
      outside the repo, as with the piano) and fix the low-mid build-up and the dark top. Targets: Audiobox
      enjoyment at least 7.0 on the first minute of `beethoven5` and `ode`, quality kept at 7.8 or above.
      *Not met, so left unticked (a sound-quality target).

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
      - Warnings remain for balance only: the orchestral title, dungeon, victory and defeat are dark or heavy in the
        low mids, the same timbre gap as M4's first box.*

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
