# Changelog

All notable changes to my-game-audio. Versions follow [semantic versioning](https://semver.org): a change that
alters the rendered samples of existing songs bumps the version, says so here, and rewrites `test/golden.json`
(`npm run golden -- --write`).

## 0.12.3 (2026-11-17)

Fixes from a trial: fresh agents composed from `docs/AI_GUIDE.md` alone and reported what got in their way. The
rendered output of every committed song is unchanged (`npm run golden`: all the same). An ABC score whose hairpin
closes before a bar line now plays that hairpin, which it dropped before.

### Fixed

- The critic checks an ABC melody against its chord symbols. The voice under the chord symbols is the melody
  (`role`). Before, a score whose chords were all wrong passed with no notes. Songbook lanes are shared whatever
  their role.
- An ABC hairpin ends on the note its closing mark is written before, as every ABC mark belongs to the note after
  it. One closed before a bar line was dropped.

### Added

- ABC import warnings where a mark was dropped in silence:
  - a mark the reader does not know, with the right spelling for rit., cresc., dim. and the like;
  - a hairpin over one note;
  - a chord symbol it cannot read;
  - a chord symbol over a voice other than the first.
- ABC: `!arpeggio!` (a rolled chord), `!breath!` and `!caesura!` (a pause after the note before), and
  `!invertedfermata!`. Tenuto, bowings, fingerings and navigation marks are accepted without a warning.
- `tools/render.mjs` prints each part's statistics under "parts" and the critic's notes apart, or "critic notes:
  none". `npm run ears` says "critic notes: none" too.

### Changed

- `docs/AI_GUIDE.md` adds:
  - marks go before their note;
  - dynamics are read once a bar, and a hairpin should end on a dynamic;
  - the tempo words, and the inline `[Q:]` field;
  - how slurs are read;
  - the pedal goes in either piano staff;
  - grace notes;
  - the chord symbols the reader knows;
  - `importABC(text).text` for checking what was imported;
  - why the ears measure longer than the piece;
  - the accompaniment a dynamic or two under the melody.

## 0.12.2 (2026-11-17)

The north star, kept in this repository: an agent composes music as sheet music and gets good music from it.
Rendered output of every committed song is unchanged (`npm run golden`: all the same).

### Added

- `node tools/render.mjs quartet.abc`: a score file (`.abc`, `.krn`, `.mid`, `.mxl`, `.musicxml`) or a song
  module's path, rendered once, start to end, to `out/<name>.wav`. The voices and import warnings print first, as
  in `npm run ears`, which now shares that code (`loadSong`, `printImport` in `tools/ears.mjs`).
- ABC: the piano's sustain pedal, as abcm2ps writes it: `!ped!` presses (again, a change), `!ped-up!` lifts.

### Changed

- ABC voice names:
  - two or more of Soprano, Alto, Tenor, Bass (or Baritone) are a choir, with words or without; alone, "Alto" was a
    viola and "Bass" a piano;
  - "Solo Soprano" is one singer;
  - a voice named "Choir" (or "Chorus", "Voices") sings the part its register is;
  - a bare "Bass" is the bass of the music around it: bass guitar, synth bass, the chip's triangle, or the string
    basses.
- `CLAUDE.md`: the north star, and the scope: work stays in this repository; other repositories are read, never
  written, without the owner's explicit word. `docs/GOAL.md` holds both; the first `/goal` is in git history.
- `docs/AI_GUIDE.md` starts from composing:
  - a piece for strings in ABC, tested;
  - solo players, choirs, the pedal and `%%accompany off` for full scores;
  - then the songbook of cues for a game;
  - "Make it sound good": mark the dynamics, the ensembles that sound best (measured), ranges, voicing, melody and
    phrasing.
- README and HANDOFF (M8) re-centred on the north star.

## 0.12.1 (2026-11-16)

The handoff to other agents. Rendered output is unchanged.

### Added

- `npm run ears` takes a score file (`.abc`, `.krn`, `.mid`, `.mxl`, `.musicxml`). One command now covers an agent's
  whole check:
  - each voice and the instrument it became, tune by tune;
  - the import's warnings (a miscounted bar, with its voice, part and bar);
  - the arranger's errors and the critic's notes;
  - every cue as a game hears it, PASS or FAIL.
  On a song module it now also prints the score's errors and critic notes before the cues.
  `test/ears-cli.test.mjs` runs it on a tune with a mistake.

### Changed

- `docs/AI_GUIDE.md`:
  - the loop and the sheet-music "Check it" use the one command;
  - the preset table lists the band, synth and chip presets with their ranges;
  - the orchestral presets are noted as measured against recordings.
- HANDOFF: the string sections checked against a recorded string section (they match within 4 dB from 80 Hz to
  8 kHz); the harpsichord continuo is too bright and loud in an ensemble, recorded and left as it is.

## 0.12.0 (2026-11-16)

The orchestra compared family by family with recorded instruments, and corrected. Rendered output changes for the
eight songs that use the corrected presets (`beethoven5`, `ode`, `brahms3`, `schubert5`, `brandenburg3`,
`lantern_road`, `set_orchestral`, `rollcall`); `test/golden.json` is rewritten.

### Changed

- Fifteen presets get a correction EQ, fitted to recordings of the instrument playing the same notes at mf (the
  University of Iowa's anechoic recordings, kept outside the repository, analysis only), and their gains are
  recalibrated. Measured by third-octave long-term spectrum:
  - violin (and the violin section): 10 to 12 dB too much above 6 kHz, now within 4 dB;
  - cello (and the section): too much below 250 Hz, 5 to 8 dB too little at 0.8 to 2.5 kHz, now within about
    3 dB in its range;
  - horn: too bright above 1.2 kHz (up to 17 dB at 4 kHz);
  - trumpet: too much above 4 kHz (up to 21 dB) and at 200 to 600 Hz;
  - viola (and the section), flute, bassoon, trombone: the difference from the recording fell from 9.2, 5.0, 8.6
    and 5.6 dB (RMS over the bands above each run's lowest note) to 3.5, 3.0, 5.1 and 2.6 dB.
  - clarinet: fitted against its run at written pitch (the recording's labels are a B-flat clarinet's written
    notes): 9.0 dB to 6.9;
  - tuba: its source was 10 to 54 dB too dark above 500 Hz, because the brass filter's cutoff is a multiple of the
    note's fundamental and a tuba's is low. Its brightness range goes from [1.2, 8] to [3, 30] times the
    fundamental, with an EQ fitted after it: 25.3 dB to 5.0.
  - oboe: 13.8 dB too bright above 2 kHz (up to 25 dB): a deeper correction, 13.8 dB to 6.5;
  - double bass (and the section): its level-following low-pass kept it far too dark; without it, and with a fitted
    EQ, 12.8 dB to 3.3.
- Audiobox, the first minute rendered alone (enjoyment / quality): `beethoven5` 6.79 / 7.89 before, 6.97 / 7.91
  after; `ode` 6.32 / 7.59 before, 6.69 / 7.57 after; the `set_orchestral` title cue 7.22 / 7.96 before,
  7.28 / 8.00 after.
- The five imported symphonies carry the corrected presets' effects and gains, as a re-import writes them; the
  Python importer's recorded digests and `test/scores/features.expected.mjs` are regenerated with the new presets.

## 0.11.1 (2026-11-16)

No Python is needed for any import any more. Rendered output is unchanged.

### Added

- `tools/import_score.mjs`: the JavaScript port of `tools/import_score.py` for Humdrum sources. A config
  (`imports/*.json`) splits each staff into parts by note length (Moonlight's melody and triplets), pedals with the
  bass, and writes the song file; `node tools/import_score.mjs imports/moonlight.json` writes the file the Python tool
  writes, byte for byte (`test/import-score.test.mjs`, on `test/scores/kern_study.json`; CI's importers job runs it
  against the Python tool).

## 0.11.0 (2026-11-16)

The rest of the review's list: the orchestra compared with recordings, the cue's master off the page's thread, and
Humdrum in JavaScript. Rendered output changes for the five imported symphonies (`beethoven5`, `ode`, `brahms3`,
`schubert5`, `brandenburg3`), which gain `dynamics: 1.2`; `test/golden.json` is rewritten.

### Added

- `song.dynamics`: how far apart the dynamic marks are (1: pp to ff is about 17 dB). Two public-domain recordings of
  Beethoven's Fifth, I, measured outside the repository (analysis only), span 16.8 and 16.9 LU of loudness range; the
  imported movement spanned 12.9. The MusicXML importer's default mode now gives a concert score `dynamics: 1.2`
  (`CONCERT_DYNAMICS`), and the movement spans 15.8. Game cues keep 1. Audiobox, first minute: `beethoven5` 6.82 /
  7.91 (was 6.85 / 7.86), `ode` 6.40 / 7.88 (was 6.35 / 7.82).
- `importKern` and `readKern` (`engine/kern.mjs`): Humdrum **kern in JavaScript, in Node or a browser, reading as
  `tools/kern.py` does (spine splits and merges, ties, grace notes, trills, marks, a dynamics spine, tempo, key,
  expansion lists). `importScore` and `tools/convert.mjs` read `.krn`. `test/kern.test.mjs` compares the two readers
  note for note on an original study (`test/scores/kern_study.krn`); CI's importers job runs it with Python.
- The piano's felt curve is a spec option (`felt: [lo, hi, p]`, default as before). Measured against recorded piano
  notes at pp, mf and ff (the University of Iowa's, analysis only), the piano's soft end matches a real piano's
  (darker at pp, 23 to 25 dB below ff), so the default stays: Audiobox's lower score for Moonlight at pp is its
  preference for a brighter piano, and the song stays at mf. `bassBright` (default 0) brightens bass notes struck
  hard; 0.5 matches the recorded C2 and C3 at ff.
- `test/parallel-cue.test.mjs`: a cue rendered on worker threads equals one rendered on this thread, sample for
  sample.

### Changed

- A cue rendered in parallel masters (EQ, compressor, limiter) in the pool too (`partJob` takes `{ master }`;
  `masterCueJob`), and sums its parts and bus outputs in slices of about 3 s with turns of the event loop between.
  The longest stretch the calling thread is busy while a cue renders on three Node workers: 0.12 s
  (`lantern_road` battle) and 0.07 s (`set_orchestral` title), from 0.18 s in 0.10.0 and 2.3 s and 1.5 s before it.
  The samples are the same.

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
