# Changelog

All notable changes to my-game-audio. Versions follow [semantic versioning](https://semver.org): a change that
alters the rendered samples of existing songs bumps the version, says so here, and rewrites `test/golden.json`
(`npm run golden -- --write`).

## 0.10.0 (2026-11-16)

A score with mistakes still plays, the reverbs leave the page's thread, and fixes from the review of the first
build. Rendered output changes: every song with a bus (the reverb's output is now added to the mix after it is
computed, so the parallel and one-thread renders can share it: sums differ in their last bit), and `ode` and
`beethoven5` are re-imported. `test/golden.json` is rewritten.

### Changed

- `arrange(song)` repairs what it can and lists it in `arr.repairs`, so a score with a miscounted bar still renders:
  a bar that does not add up is padded with rest or cut at the bar line, an unreadable note plays as a rest, an
  unknown technique or dynamic is left out, a part with too few bars repeats to fill its section, a short tempo
  line carries its last tempo on, a part the song does not have is left out. Each repair names its section, part
  and bar. `arrange(song, { strict: true })` makes them errors, as before; `parseLine` takes `lenient`. The critic
  lists the repairs first, so a song with any still shows notes.
- The ears name keys with Bellman-Budge profiles in place of Krumhansl-Kessler's (both `engine/ears.mjs` and
  `tools/ears.py`): all 31 tonal cues of the three cue sets and `lantern_road` in their written keys, where 27 were.
- `ode` and `beethoven5` are re-imported by the JavaScript importer in its default mode: the choir sings
  Schiller's words, and the Fifth's fermatas hold their notes instead of slowing their bars.

### Added

- `importMidi` and `tools/convert.mjs` take `dynamic`: the level a file's commonest dynamic becomes, the others moving
  with it, for files whose velocities follow a player's touch rather than the score. `beethoven_moonlight` stays at
  mf for now: at pp, the level its score asks for, Audiobox rates its first minute 7.02 / 7.32 against 7.06 / 7.81
  (the piano's soft hammer is the weaker sound).
- Bus effects run in the worker pool: `partJob` takes a bus job, and `mixPartsParallel` sends each bus there and
  lets the event loop turn between parts. While a cue renders on three workers in Node, the longest stretch the
  calling thread is busy fell from 2.3 s to 0.18 s (`lantern_road` battle) and from 1.5 s to 0.18 s
  (`set_orchestral` title).

### Fixed

- `exportMidi` placed the notes after a fermata off their beat: a bar with held steps now has the slower tempo for
  as long as they last, and every note lands on its grid. `importMidi` reads it back: each bar plays at its fastest
  tempo, and a slower run inside it is a hold over those steps that takes exactly as long (a tempo change inside a
  bar had applied from the bar it fell in, roughly).

## 0.9.0 (2026-11-16)

Sheet music as the way in: an agent writes a game's music as an ABC score, one voice per instrument, and gets a
song of cues. Rendered output changes: the roll call plays the eleven new band, synth and chip presets; a cue's
loop is limited with the start of the next pass in view (a loop that ended on a transient could peak above -1
dBTP); a plucked string that is not left to ring is given 1 s after its end, not 8, so cues of guitars and basses
render faster (their heads are shorter). The golden hashes of existing songs are unchanged (their excerpts do not
reach the roll call's new bars, and cues are not hashed); `lantern_road` joins `test/golden.json`.

### Added

- `importABCBook`: a file of ABC tunes is one song, each tune a cue. `%%cue`, `%%stinger`, `%%intro` and `%%layer`
  lines name cues, stingers, intros and layers; a part named Intro plays once before the loop; voices with the same
  instrument share a lane across cues; lines before the first `X:` apply to every tune. `importScore` and
  `tools/convert.mjs` read such a file as a songbook. `songs/lantern_road.mjs` is an original five-cue score written
  this way (title with an intro, town waltz, dungeon, battle, victory stinger), with no critic notes, and its cues
  pass the ears.
- ABC voices written line by line (`[V:2] ...`), the usual layout of a score. Each voice's instrument comes from its
  name (`"Violins"`, `"Electric Bass"`, `"Synth Pad"`, `"Pulse"`), its `%%MIDI program`, or `presets`. A voice named
  Drums, with `clef=perc` or on `%%MIDI channel 10` plays General MIDI drum notes, unaffected by the key signature.
- ABC parts: `P:A` in the body marks a part in every voice; `P:Intro A2 B` in the header plays them in that order
  (`partOrder`). Sections are cut at part boundaries and named after the parts (`report.partSections`).
- ABC decorations and annotations: `!/!` `!//!` `!///!` and `!trem!` tremolo, `!marcato!`, `!mordent!` and
  `!pralltriller!`, `!turn!`, and the technique words `"^pizz."`, `"^arco"`, `"^sul pont."`, `"^sul tasto"`,
  `"^col legno"`, `"^con sord."`, `"^flz."`.
- Lenient bars: an ABC bar that does not fill its meter is padded with rest, and one that overfills it is cut at the
  bar line, each with a warning naming the voice, part and bar (`report.warnings`); the first bar may be a pickup.
- Eleven presets for band, synth and chip music, calibrated like the orchestra's and played in the roll call:
  `acoustic_guitar`, `electric_guitar`, `distortion_guitar`, `electric_bass`, `electric_piano`, `synth_lead`,
  `synth_pluck`, `synth_pad`, `synth_bass`, `chip_pulse`, `chip_triangle`. The importers find them by name, MusicXML
  sound and General MIDI program (a MIDI file's bass on program 33 is an electric bass now, not a piano).
- Rooms: an ABC or MIDI import whose instruments are all band, synth or chip gets a short reverb, a master voiced
  for the style and no concert stage (`report.room`); drums in a chip song play on the noise channel (`CHIP_KIT`).
  Chord symbols become an accompaniment in the song's style, and its bass sits out when the tune has one.
- `songText(song)`: a song as compact module text. `docs/AI_GUIDE.md` starts with "Write it as sheet music (ABC)":
  a tested template songbook and what to write.
- `tools/orchestra_calibrate.mjs --only name,name` calibrates new presets without touching the others; a `clean`
  guitar cabinet.

### Fixed

- A cue's loop could peak above the limiter's ceiling in its last few milliseconds: the limiter looks ahead, and the
  mastering buffer ended there. It now holds the start of the next pass.
- An ABC part played twice in a row (`P:A2`) was one part in the layout; each now starts its own section.

## 0.8.0 (2026-11-16)

The agent workflow (milestone M5). Rendered output of existing songs is unchanged.

### Added

- `engine/ears.mjs`: `ears(L, R)` measures loudness, true peak, band balance, stereo, onsets, tempo, key and clicks
  as `tools/ears.py` does, with no Python; `checkAudio` passes or fails a measurement for a game. `npm run ears`
  measures WAV files, or renders every cue of a song as a game hears it (the head, then the loop twice).
- `docs/AI_GUIDE.md`: how an agent writes and checks game audio with the library, with a tested example song.
- Cue sets: `songs/themes/cues.mjs` holds ten original themes (title, menu, exploration, town, dungeon, battle, boss,
  victory, defeat, ambience). `set_chiptune`, `set_synthwave` and `set_orchestral` arrange each of them as a
  loopable cue. CI's new `cues` job runs the ears on all thirty.

## 0.7.0 (2026-11-16)

Sound quality (milestone M4). Rendered output changes: strings, brass, winds and choirs play their new transitions,
the orchestral presets gain a master EQ and a stage, and the limiter measures true peaks better. `test/golden.json`
is rewritten.

### Added

- Playing techniques after a note's suffixes (`C5:4%pont`, `TECHNIQUES`). Strings: `%pont` sul ponticello,
  `%tasto` sul tasto, `%spicc` spiccato, `%legno` col legno, `%port` portamento, and `%trem8` `%trem16` `%trem32`
  measured tremolo in time with the music. Winds and brass: `%flz` flutter-tongue, and `%tremN` tongued repeats
  (double-tongued). Brass: `%rip` and `%brassy` (cuivre). A harmonic (`*`) on strings now sounds nearly pure. The
  MusicXML importer reads "sul pont.", "sul tasto", "col legno", "flz." and "ord." words and spiccato marks into
  techniques.
- Sung syllables (`C5:4@freu`). A choir with a voice type sings each syllable's consonants: fricatives before the
  beat, plosive bursts, voiced consonants into the vowel, and a final consonant closing it. The MusicXML importer
  writes the lyrics' syllables. The rollcall's voices sing "hear the voices sing in tune".
- A concert stage (`song.stage`, `stageTaps`, `SEATS`): each stereo part gets its own direct level and early
  reflections from its place on the stage (pan and depth) and the listener's seat (front, stalls, balcony). Imported
  orchestral songs sit in the stalls.
- Parallel rendering: `renderPart`, `renderSongParallel`, `renderCueParallel`, `partJob`, `partTransfer`. Parts render
  in workers and mix in order, so the samples are the same as on one thread. `node tools/render.mjs --workers N`
  defaults to one worker per core. The player's `parallel` option is on with 3 or more workers. The orchestral cue
  renders 2.2 to 2.3 times as fast on four workers.

### Changed

- Strings: a slurred note glides from the one before through a finger change, and the note it is slurred from hands
  over quickly; an unslurred note that joins the one before changes bow. Brass: slurred notes move by the lips, and ff
  turns brassy by itself.
- The orchestral master EQ dips the low mids (-2.5 dB at 320 Hz) and lifts the top (+3.5 dB above 6 kHz). On the
  Fifth's first minute the low mids fall from 36% to 29% of the energy.
- The limiter estimates true peaks with a 16-tap windowed sinc instead of Catmull-Rom points. Bright mixes no longer
  overshoot their ceiling between samples (the rollcall: -0.4 dBTP before, -1.7 after).

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
