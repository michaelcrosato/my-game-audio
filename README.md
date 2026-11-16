# my-game-audio

Game audio written as code, by LLM agents: music today, sound effects and voices next. A score is plain text; about
2,800 lines of dependency-free JavaScript (ES modules) turn it into stereo audio, deterministically, in Node or a
browser worker. No samples, no audio files. It has a synthesized orchestra and band, a piano, a chip synth, importers
that read printed scores (MusicXML, Humdrum, MIDI, ABC), and a renderer that plays while it renders.

Status: version 0.1.0. It began as a research prototype and is growing into the audio library for
games built with [my-3d2dge](https://github.com/michaelcrosato/my-3d2dge) and
[my-game-matrix](https://github.com/michaelcrosato/my-game-matrix). [docs/HANDOFF.md](docs/HANDOFF.md) says what
exists, what it measures, and what still needs to be made; [CLAUDE.md](CLAUDE.md) holds the rules for agents.

## Layout

| Path | What it is |
| --- | --- |
| `engine/index.mjs` | The public API (documented in [docs/API.md](docs/API.md)); `engine/version.mjs` holds `VERSION` |
| `engine/dsp.mjs` | Seeded RNG, band-limited oscillators, SVF and biquad filters, delay lines, envelopes |
| `engine/instruments.mjs` | Instruments as functions of note events: NES 2A03 channels, virtual analog, FM, extended Karplus-Strong, bowed-string sections, brass, choir, modal percussion, synthesized drum kits |
| `engine/fx.mjs` | FDN reverb, ping-pong delay, chorus, compressor, ducking, true-peak-aware limiter, oversampled drive, cabinet EQs, formant filter, BS.1770 loudness |
| `engine/score.mjs` | The text format: parser, bar validators, chord symbols, generators (voice leading, arpeggios, bass lines), arrangement, and the score critic |
| `engine/render.mjs` | Song -> parts -> buses -> master, loudness-normalized; a streaming renderer that plays while it renders; 16-bit WAV writer |
| `engine/piano.mjs` | The piano (see below) |
| `engine/orchestra.mjs` | Woodwinds and saxophones, organ, player ensembles, orchestral percussion; loads the presets |
| `engine/orchestra-presets.json` | 53 instrument presets and 12 percussion sounds: synthesis settings, ranges, seating, hall sends, measured gains, and the names, MusicXML sound IDs and MIDI programs they answer to |
| `songs/*.mjs` | The demo scores: four styles, two Beethoven symphony movements and the orchestra roll call (three piano pieces are generated locally, see below) |
| `tools/render.mjs` | `node tools/render.mjs <song> [--stems]`: renders `out/<song>.wav`, prints the critic's report |
| `tools/ears.py` | `python3 tools/ears.py out/<song>.wav`: loudness, true peak, band balance, key, tempo, clicks, a spectrogram PNG; `--stems out/stems/<song>` prints who carries which band |
| `tools/aesthetics.py` | Meta Audiobox Aesthetics scores (needs torch + `audiobox_aesthetics`) |
| `tools/import_score.py`, `tools/kern.py` | Piano and small-ensemble importer (Humdrum, MusicXML, MIDI, ABC) |
| `tools/import_orchestra.py` | Full-score importer: MusicXML to an orchestral song file |
| `tools/mxl_parts.py` | Shows which preset every part of a set of scores would get |
| `tools/orchestra_calibrate.mjs` | Measures every preset playing the same phrase and writes the gains that balance them |
| `tools/stream_test.mjs`, `tools/bar_loudness.py` | Streamed against whole renders; loudness per bar |
| `tools/check.mjs` | `npm run check`: every song parses and arranges, and short renders are finite, in range and deterministic |
| `tools/page_test.mjs` | Headless-browser test of the listening page (Playwright) |
| `test/*.test.mjs` | `npm test`: parser, arrangement, critic, golden render hashes (`test/golden.json`), streaming, presets, API docs |
| `docs/HANDOFF.md` | Status, measurements, known gaps and the roadmap |
| `docs/API.md`, `CHANGELOG.md` | The public functions; what changed in each version |
| `web/build.mjs` | Builds the self-contained listening page (bundle the engine first with esbuild, see below) |

## Run

```sh
npm install                                             # dev tools only (esbuild); the engine has no dependencies
npm test                                                # the test suite, about 50 s
npm run check                                           # about 40 s: parse, arrange and short renders of every song
node tools/render.mjs chiptune electronic orchestral rock
node tools/render.mjs rollcall beethoven5 ode           # the orchestra: about 2, 3 and 4 minutes on one core
pip install numpy scipy matplotlib pyloudnorm           # for the ears
python3 tools/ears.py out/orchestral.wav
npm run page                                            # bundles the engine and writes web/index.html (needs the renders' out/*.json)
```

## The score format in one screen

```js
sections: {
  A: {
    bars: 4, chords: '| Dm | Bb | Gm | A |',            // the plan the critic checks notes against
    parts: {
      horns: '| A3:4 D4:4 F4:6 E4:2 | D4:6 C4:2 Bb3:4 F4:4 | G4:6 F4:2 D4:4 Bb3:2 C4:2 | C#4:8 E4:4 A3:4 |',
      harp: arpLine('| Dm | Bb | Gm | A |', { lo: 'D3', hi: 'D5', rate: 2 }),   // generators write text too
      drums: '| k . h . s . h . k . h k s . h . |',     // kit tokens; a 1-bar line repeats to fill the section
    },
    dyn: { horns: '| mf | mf | mf< | f |' },            // one marking per bar, hairpins ramp to the next
  },
}
```

Tokens: `C4` a note (1 step), `C4:4` held 4 steps, `[D3 F3 A3]:8` a chord, `.` rest, `-` hold, `|` bar line.
Suffixes: `!` accent, `?` ghost, `^` staccato / palm mute, `_` legato (slurred from the note before), `~` roll /
tremolo, `@a` `@e` `@i` `@o` `@u` the vowel a voice sings. A bar that does not add up to the grid (16 steps in 4/4)
is an error with its section, part and bar number. A section may set its own `meter`, `grid` and a `tempo` line with
one BPM per bar (`'| 160 | 160 | 80 | - |'`), which is how imported scores carry meter changes, tempo marks and
fermatas.

## Importing sheet music

```sh
git clone --depth 1 https://github.com/craigsapp/beethoven-piano-sonatas scores/beethoven-piano-sonatas
git clone --depth 1 https://github.com/craigsapp/joplin scores/joplin
git clone --depth 1 https://github.com/craigsapp/mozart-piano-sonatas scores/mozart-piano-sonatas
pip install music21                                # the importer uses it for note names, and for MusicXML, MIDI and ABC
python3 -I tools/import_score.py imports/moonlight.json
node tools/render.mjs moonlight
```

`tools/import_score.py` turns machine-readable sheet music into a song file in the text format above. Humdrum
**kern is read by `tools/kern.py`: repeats are written out from the expansion list, ties are merged, grace notes and
trills are kept. MusicXML, MIDI and ABC go through music21. Each config in `imports/` names the source file, the
tempo, how each staff splits into parts (Moonlight's melody and triplets), the pedal rule and the sound.

New score features used by the imports: grace notes (`{G#4 A4}B4:2`), a `pedal` line per section (`P` press or
re-press, `U` lift), a dynamics line for every part at once (`dyn: { '*': '| pp | - |' }`), and notes held from one
section into the next (a line that starts with `-`).

Licences: the compositions are in the public domain. The encodings used here are Craig Stuart Sapp's Humdrum
editions; the Joplin and Mozart ones are CC BY-NC-SA 4.0, and the Beethoven repository states no licence. That is why
the three song files they produce (`moonlight`, `entertainer`, `alla_turca`) are not committed: generate them locally
with the commands above. For anything a game ships, use sources with an explicit public-domain or CC0 licence.

## The piano

`engine/piano.mjs` is additive synthesis of stiff strings: inharmonic partials, a felt-hammer spectrum that
brightens with velocity, a two-stage decay from coupled unison strings, hammer noise, voicing, rolled chords, grace
notes, and dampers that follow the pedal line. Its envelopes and spectra were calibrated with
`tools/piano_compare.py` and `tools/piano_note.mjs` against measurements of recorded grand-piano notes, which are
not included here.

## The orchestra

`engine/orchestra-presets.json` defines every instrument a symphonic score asks for, each with its range, seat in
the stereo field, hall send and a gain measured by `tools/orchestra_calibrate.mjs` (every preset plays the same
phrase at mf, dry, and is set to its family's target loudness):

- Strings: violins, violas, cellos, basses as sections (several detuned players, divisi for chords), each also as a
  soloist and pizzicato.
- Woodwinds: piccolo, flute, recorder, oboe, English horn, clarinet, bass clarinet, bassoon, contrabassoon, and
  soprano, alto, tenor and baritone saxophones (`wind`: a source shaped like the instrument's bore, breath noise,
  attack chiff, vibrato, a brightness that follows the dynamics).
- Brass: horn, trumpet, cornet, muted trumpet, trombone, bass trombone, euphonium, tuba.
- Tuned percussion: timpani, glockenspiel, xylophone, marimba, vibraphone, tubular bells, celesta, crotales.
- Keyboards and harp: piano, harp, harpsichord, organ.
- Voices: soprano, alto, tenor and bass choirs and soloists. Each note is sung on the vowel of its syllable, with the
  first formant raised to the pitch on high notes and every vowel and pitch brought to an even level.
- Unpitched percussion as kit tokens: `bd` bass drum, `sd` snare, `cym` crash cymbals, `scym` suspended cymbal
  (`scym:8~` swells), `tri`, `tam` tam-tam, `tamb`, `wb` wood block, `cast`, `sleigh` bells, `cowbell`, `whip`.

`songs/rollcall.mjs` plays every one of them in turn and then all together.

## Importing a full score

```sh
pip install music21
python3 -I tools/import_orchestra.py SCORE.mxl songs/name.mjs [--bars 93-331] [--tempo 160] [--title "..."] [--key "D major"] [--source "..."]
node tools/render.mjs name
```

Export the score from MuseScore, Sibelius, Finale or Dorico as MusicXML (`.mxl` or `.musicxml`). The importer:

- matches each part to a preset by its MusicXML sound ID, its name in English, Italian, German or French, or its
  General MIDI program (`python3 -I tools/mxl_parts.py *.mxl` shows the choices without importing);
- writes transposing instruments at sounding pitch, and repeats and endings out in the order they are played;
- turns metronome marks, tempo words (Allegro, Adagio, Tempo I, a tempo, rit., accel., recitativo) and fermatas
  into a tempo line, and meter changes into sections of their own;
- keeps each part's dynamics, hairpins and sforzandi, slurs, staccatos, accents, ties, grace notes and trills,
  measured tremolos as written-out notes and unmeasured ones as `~`, pizzicato and arco, and mutes;
- gives voices the vowels of their lyrics, and spreads doubled parts (two flutes, first and second violins) across
  the stage.

The two Beethoven pieces here came from these commands (the corpus is large, so fetch only the files you need):

```sh
git clone --filter=blob:none --no-checkout https://github.com/MarkGotham/Hauptstimme scores/hauptstimme
D="data/Beethoven,_Ludwig_van"
git -C scores/hauptstimme checkout HEAD -- "$D/Symphony_No.5,_Op.67/1/Beethoven_Op.67_1.mxl" "$D/Symphony_No.9,_Op.125/4/Beethoven_Op.125_4.mxl"
python3 -I tools/import_orchestra.py "scores/hauptstimme/$D/Symphony_No.5,_Op.67/1/Beethoven_Op.67_1.mxl" songs/beethoven5.mjs --title "Symphony No. 5, I" --key "C minor"
python3 -I tools/import_orchestra.py "scores/hauptstimme/$D/Symphony_No.9,_Op.125/4/Beethoven_Op.125_4.mxl" songs/ode.mjs --bars 93-331 --title "Symphony No. 9, IV: Ode to Joy" --key "D major"
```

`--bars` counts bars in the order they are played, from the first bar of the file. In this file of the Ninth's finale
the opening upbeat is bar 1, so the printed bars 92 to 330 are 93 to 331.

`songs/beethoven5.mjs` (all of the first movement, 18 parts) and `songs/ode.mjs` (bars 92 to 330 of the Ninth's
finale, 36 parts with soloists and choir) were made this way from the OpenScore Orchestra corpus, CC0 MusicXML of
nearly a hundred symphonic movements (github.com/MarkGotham/Hauptstimme). All 1,663 parts of its 96 full scores map to
a preset. Not yet handled: lyrics as words (the choir sings vowels only), percussion staves that mix several
instruments on one line, harmonics, glissandi, and tempo rubato beyond the marks in the score.

## Playing while rendering

`renderStream(song, { onChunk, normDb })` renders in windows (3 seconds, then 8) and hands finished audio to
`onChunk` in order, so playback can start after the first window: the first movement of Beethoven's Fifth starts
after about 1.3 seconds in Node and renders faster than real time on a laptop core. Windows overlap-add, which is
exact for linear effects; with reverb the result matches the whole-piece render in loudness and sound but not sample
for sample (the reverb's modulation restarts per window). The loudness gain comes from an offline render
(`stats.normDb`). The listening page streams every piece longer than a minute.
