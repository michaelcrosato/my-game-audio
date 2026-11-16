# Changelog

All notable changes to my-game-audio. Versions follow [semantic versioning](https://semver.org): a change that
alters the rendered samples of existing songs bumps the version, says so here, and rewrites `test/golden.json`
(`npm run golden -- --write`).

## 0.6.0 (2026-11-16)

Notation and repertoire (milestone M3, third part). Rendered output of existing songs is unchanged; a pedal line now
damps keys let go with a change (no committed song had one).

### Added

- Score format: `&` after a chord rolls it (35 ms a note from the bottom, all ending together); `*` marks a harmonic
  (parsed; its sound comes with M4's articulations); a section's `hold` line stretches steps of a bar
  (`'| - | 12:4*2 |'`: steps 12 to 15 of bar 2 last twice as long, and everything after them comes later).
- The MusicXML importer reads what music21 leaves out, each with a test score in `test/scores/notation/`: several
  instruments on one percussion staff, natural and artificial harmonics, glissandi and slides (written out as runs),
  mordents and turns, arpeggio marks, "a 2", "1." and "2." on shared wind and brass staves (second players get `_2`
  lanes), breath marks and caesuras, cue notes against small print, fermatas that hold only their note (a `hold` line),
  tempo words in the beat their meter counts (a half note in 2/2, a dotted quarter in 6/8), and sustain pedal marks.
  `compat: true` gives the Python importer's output, no more; `expression: true` adds phrase rubato and agogic accents.
- MIDI: the sustain pedal (controller 64) is read into pedal lines and written from them; `pedal: 'bass'` (and
  `--pedal bass` on `tools/convert.mjs` and `tools/import.mjs`) pedals a piano score without marks at each new bass
  note.
- Songs from CC0 and public-domain editions, each with its source and licence: `brandenburg3` (Bach),
  `schubert5`, `brahms3` (OpenScore Orchestra, CC0), `joplin_entertainer`, `mozart_alla_turca` (Mutopia, public
  domain) and `beethoven_moonlight` (PDMX, CC0).

### Changed

- A pedal press comes down 50 ms after its step (legato pedalling): a key let go with a change is damped instead of
  ringing into the next harmony.
- A fermata in an ABC tune or a MusicXML score holds its note instead of halving its bar's tempo (compat mode keeps
  the old way).

## 0.5.0 (2026-11-16)

MIDI and ABC (milestone M3, second part). Rendered output of existing songs is unchanged.

### Added

- `engine/midi.mjs`: `importMidi` (tracks and channels to parts, tempo and meter maps, velocities to dynamics,
  notes snapped to a detected grid, drums on a General MIDI band kit), `exportMidi` (a format 1 file with a tempo
  track and a named track per part with its General MIDI program) and `parseMidi`.
- `engine/abc.mjs`: `importABC`: keys and modes, accidentals, lengths, broken rhythm, tuplets, chords, ties, slurs,
  grace notes, decorations, repeats with endings, inline fields, voices, lyrics, and chord symbols as chords lines
  with a harp and bass accompaniment.
- `engine/importers.mjs`: `importScore` and `scoreFormat` for any of MusicXML, MIDI and ABC; the player's
  `importScore` and the demo page take all three. The page saves any song as a MIDI file.
- `buildSong` (the MusicXML importer's layout) is shared, takes chord symbols, and lets a note carry its own kit
  token.
- `node tools/convert.mjs IN OUT`: a song to MIDI, or a score file to a song.

### Fixed

- The critic placed a section's chords on the song's grid even when the section had its own (an imported section
  of 24 or 48 steps a bar): its chord-tone warnings there were wrong.

## 0.4.0 (2026-11-16)

Sheet music in the browser (milestone M3, first part). Rendered output of existing songs is unchanged.

### Added

- `engine/musicxml.mjs`: a MusicXML importer in JavaScript (`importMusicXML`, `readMusicXMLText`, `playOrder`,
  `mapPart`), with its own XML parser and zip reader, that writes the songs `tools/import_orchestra.py` writes,
  without Python or music21: 0.6 s for Beethoven's Fifth (I) and 2 s for the Ninth's finale, against 31 s and 137 s.
- `node tools/import.mjs SCORE.mxl songs/name.mjs`: the importer from a shell.
- The player: `importScore()` imports a score in a worker; `music(song, { loop: false })` streams a song once.
- The demo page plays a MusicXML file dropped on it or chosen, streamed, and offers its song file.
- Tests: `test/musicxml.test.mjs` (the two Beethoven scores and a feature score against the Python importer's
  songs), `test/musicxml-python.test.mjs` (both importers side by side, where music21 is installed; CI's new
  `importers` job installs it); the page test drops a score. The test scores are in `test/scores/` with their
  source, licence (CC0) and commit.
- `tools/compare_import.mjs`: compares two songs, note names by pitch.

## 0.3.0 (2026-11-16)

Sound effects and voices (milestone M2). Rendered output of existing songs is unchanged.

### Added

- Sound effects as data (`engine/sfx.mjs`, `renderSfx`): layers of nine models (`tone` in the spirit of sfxr,
  `noise`, `modal` impacts on six materials, `boom`, `step` on eight surfaces, `whoosh`, `crackle`, `drip`, `creak`),
  each with a delay, gain and pan; seeded takes with `vary` ranges; loudness targets under a peak ceiling;
  seamless ambient loops (an equal-power crossfade of the steady layers into the start). `sfxLoudness` measures
  short sounds.
- A library of 58 named sounds (`engine/sounds.mjs`, `SOUNDS`, `soundNames`) in seven categories: interface,
  movement (footsteps on seven surfaces), combat, magic, pickups, doors and ambient beds.
- Voices (`engine/voice.mjs`, `speak`, `syllables`): Animalese/Simlish-style gibberish from dialogue text, a
  formant-voiced blip per syllable with consonant bursts and hisses, pitch contours from punctuation (questions
  rise, statements fall) and six `EMOTIONS`, twelve character profiles in `VOICES` (or your own), and syllable
  timing for typewriter text.
- The player: `sfx()` through the sfx bus (several seeded takes per sound, loops, panning, sounds on the music's
  beat), `define()`, `sounds()`, `preload()`; `say()` through the voice bus, ducking the music while a character
  speaks and calling back on each syllable. Effects and speech render in a worker of their own.
- The demo page has a sound board of every library sound and a talking dialog box. The page test checks effects
  and voices come out of their buses exactly, muting, the music ducking under speech, and the dialog text.
- Golden hashes for every library sound and one line from every voice (`test/golden.json`, `sounds`).

### Fixed

- Bus volume and mute set before the audio context runs (suspended, or offline) now apply at once instead of
  gliding in after the first sounds.

## 0.2.0 (2026-11-16)

The game runtime (milestone M1). Rendered output of existing songs is unchanged (the golden hashes still hold).

### Added

- Seamless loops (`engine/loop.mjs`): songs mark `intro` and `loop`, or several named cues in `loops`; `layers`
  group parts into stems; `stingers` name sections to play once over the music. `renderCue` renders a cue as a head
  and a loop whose tail is folded into its start, with one master chain shared by every layer stem; `renderOnce`,
  `cuesOf`, `layersOf`, `cueTiming`, `estimateNorm`, `freeze`, `cueKey`.
- The player (`engine/player.mjs`, `createPlayer`): music with intros and seamless loops, crossfades and cue changes
  on the next bar or beat, layer gains, stingers, `pos`, `onBeat` and `onBar`, music, sfx and voice buses with
  volume, mute and ducking; renders in Workers, streams a cue's first play through `renderStream`, and caches cues
  in memory and IndexedDB keyed by the song, the cue and the engine version.
- `dist/my-game-audio.js` (global `MyGameAudio`) and `dist/my-game-audio.mjs`: one dependency-free file each, built
  by `npm run build`, 37 KB gzipped against a 100 KB budget.
- The demo page (`npm run page`) runs on `dist/`: songs with cues, layer sliders, stingers, a mixer and a beat
  display. `npm run page:test` checks it in headless Chromium, and CI runs it.
- The four style songs have loops, layers and stingers; the orchestral one has two cues.
- `mixParts` and `master` in `engine/render.mjs` (the parts of `renderSong`), a `range` option to render the notes
  of a time window, and `compressGain` and `limitGain` in `engine/fx.mjs` (the gain curves of the compressor and
  limiter, to share across stems).
- Tests: `test/loop*.test.mjs` (the fold against continuous renders, seam clicks, layers, timing, cue keys),
  `test/dist.test.mjs`.

### Changed

- The old listening page (`web/entry.mjs`, the `MyGameAudioDemo` bundle) is replaced by the player's demo page.
- Playwright is a pinned dev dependency (1.63.0) for the browser test.

## 0.1.0 (2026-11-16)

The seed prototype, versioned, licensed and under test. Rendered output is unchanged from the seed; the golden
hashes in `test/golden.json` are recorded at this version.

### Added

- `LICENSE`: MIT, matching my-3d2dge.
- `npm test` (node:test): the score parser's errors, chord symbols, generators and the critic; arrangement timing
  with per-section meter, grid and tempo lines, ritardandos, held notes, references, dynamics and the pedal; golden
  SHA-256 hashes of every song's first two sections; streamed against whole renders (dry difference below -40 dB,
  loudness within 0.2 LU with effects); every orchestra preset at its calibrated loudness within 2 LU and audible
  at both ends of its range; the public API against `docs/API.md`.
- GitHub Actions runs `npm test` and `npm run check` on every push and pull request.
- `engine/index.mjs`, the public entry point, and `engine/version.mjs` (`VERSION`); `docs/API.md` documents every
  export.
- `npm run golden` (`tools/golden.mjs`) shows and records golden hashes, refusing to overwrite changed hashes
  without a version bump.
- `tools/calibration.mjs`: the orchestra's loudness targets and measurement, shared by
  `tools/orchestra_calibrate.mjs` and the preset tests.

### Changed

- The demo bundle's global is `MyGameAudioDemo` (was `MusicCode`, the prototype's name); `esbuild` is a pinned dev
  dependency instead of an unpinned `npx` download.
