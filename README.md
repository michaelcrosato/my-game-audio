# my-game-audio

Music written by LLM agents the way composers always have: as sheet music. An agent writes a score, an ABC file
with one voice per instrument (or MusicXML, Humdrum, MIDI, or the text score the importers write), and about 8,000
lines of dependency-free JavaScript (ES modules) play it: a synthesized orchestra and band, a piano and a chip
synth, deterministically, in Node or a browser. No samples, no audio files. The tools check the score and the sound
without ears, so the agent can fix what it wrote:

```sh
npm run ears -- quartet.abc          # each voice's instrument, the score's mistakes and critic notes, the sound: PASS or FAIL
node tools/render.mjs quartet.abc    # out/quartet.wav, the piece start to end, to listen to
```

Games can play the same music, and sound effects and voices besides. They load one file,
`dist/my-game-audio.js` (87 KB gzipped, no dependencies), and play music that loops seamlessly, changes section on
the next bar, brings layers in and out and fires stingers, through music, sfx and voice buses:

```html
<script src="dist/my-game-audio.js"></script>
<script>
  const player = MyGameAudio.createPlayer();
  const song = { /* a score: see below and docs/API.md */ };
  addEventListener('pointerdown', async () => {
    await player.unlock();
    player.music(song, { fade: 1 });         // the intro, then the loop forever; renders in a worker, then cached
    player.onBar((pos) => console.log('bar', pos.bar));
  }, { once: true });
  // later: player.cue('battle', { at: 'bar' }); player.layer('drums', 0, 2); player.sting('win', { at: 'beat' });
</script>
```

Status: version 0.13.0. Agents start with [docs/AI_GUIDE.md](docs/AI_GUIDE.md): how to compose music as sheet
music and check it. [docs/HANDOFF.md](docs/HANDOFF.md) says what exists, what it measures, and what still needs to
be made; [CLAUDE.md](CLAUDE.md) holds the rules for agents, among them that work on it stays in this repository.
Other projects read from it: games built on [my-3d2dge](https://github.com/michaelcrosato/my-3d2dge) load `dist/`
through an adapter kept in that repository.

## Layout

| Path | What it is |
| --- | --- |
| `engine/index.mjs` | The public API (documented in [docs/API.md](docs/API.md)); `engine/version.mjs` holds `VERSION` |
| `engine/dsp.mjs` | Seeded RNG, band-limited oscillators, SVF and biquad filters, delay lines, envelopes |
| `engine/instruments.mjs` | Instruments as functions of note events: NES 2A03 channels, virtual analog, FM, extended Karplus-Strong, bowed-string sections, brass, choir, modal percussion, synthesized drum kits |
| `engine/fx.mjs` | FDN reverb, ping-pong delay, chorus, compressor, ducking, true-peak-aware limiter, oversampled drive, cabinet EQs, formant filter, BS.1770 loudness |
| `engine/score.mjs` | The text format: parser, bar validators, chord symbols, generators (voice leading, arpeggios, bass lines), arrangement, and the score critic |
| `engine/render.mjs` | Song -> parts -> buses -> master, loudness-normalized; a streaming renderer that plays while it renders; 16-bit WAV writer |
| `engine/loop.mjs` | Game music: cues (an intro and a seamless loop), layers as stems, stingers, cache keys |
| `engine/player.mjs`, `engine/worker.mjs` | The browser player (`createPlayer`) and its render worker |
| `dist/my-game-audio.js`, `.mjs` | The whole engine and player in one file (script and ES module), built by `npm run build` |
| `engine/piano.mjs` | The piano (see below) |
| `engine/orchestra.mjs` | Woodwinds and saxophones, organ, player ensembles, orchestral percussion; loads the presets |
| `engine/orchestra-presets.json` | 53 instrument presets and 12 percussion sounds: synthesis settings, ranges, seating, hall sends, measured gains, and the names, MusicXML sound IDs and MIDI programs they answer to |
| `songs/*.mjs` | The demo scores: four styles, two Beethoven symphony movements and the orchestra roll call (three piano pieces are generated locally, see below) |
| `tools/render.mjs` | `node tools/render.mjs <song> [--stems]`: renders `out/<song>.wav`, prints the critic's report; `<song>` is a name in `songs/`, a module's path, or a score file (`quartet.abc`, `.krn`, `.mid`, `.mxl`) |
| `tools/ears.py` | `python3 tools/ears.py out/<song>.wav`: loudness, true peak, band balance, key, tempo, clicks, a spectrogram PNG; `python3 tools/ears.py --stems out/stems/<song>` (after `node tools/render.mjs <song> --stems`) prints who carries which band |
| `tools/aesthetics.py` | Meta Audiobox Aesthetics scores (needs torch + `audiobox_aesthetics`) |
| `tools/import_score.py`, `tools/kern.py` | Piano and small-ensemble importer (Humdrum, MusicXML, MIDI, ABC) through music21; `engine/kern.mjs` reads Humdrum in JavaScript |
| `tools/import_orchestra.py` | Full-score importer: MusicXML to an orchestral song file |
| `tools/mxl_parts.py` | Shows which preset every part of a set of scores would get |
| `tools/orchestra_calibrate.mjs` | Measures every preset playing the same phrase and writes the gains that balance them |
| `tools/stream_test.mjs`, `tools/bar_loudness.py` | Streamed against whole renders; loudness per bar |
| `tools/check.mjs` | `npm run check`: every song parses and arranges, and short renders are finite, in range and deterministic |
| `tools/page_test.mjs` | `npm run page:test`: the demo page in headless Chromium (start time, loop seams, layers, cues, no console errors) |
| `test/*.test.mjs` | `npm test`: parser, arrangement, critic, golden render hashes (`test/golden.json`), streaming, loops, presets, dist, API docs |
| `docs/AI_GUIDE.md` | How an agent composes music as sheet music and checks it, and how a game plays it: start here |
| `docs/HANDOFF.md` | Status, measurements, known gaps and the roadmap |
| `docs/API.md`, `CHANGELOG.md` | The public functions; what changed in each version |
| `web/page.html`, `web/build.mjs` | The demo page, built on `dist/` by `npm run page` into `web/index.html` |

## Run

```sh
npm install                                             # dev tools only (esbuild, Playwright); the engine has no dependencies
npm test                                                # the test suite, about 2 minutes on four cores
npm run check                                           # about 40 s: parse, arrange and short renders of every song
npm run ears -- quest.abc                               # sheet music (or a song): import, score and every cue, PASS or FAIL
node tools/render.mjs quest.abc                         # sheet music to out/quest.wav, start to end
npm run build                                           # dist/my-game-audio.js and .mjs
npm run page                                            # build, then web/index.html, the demo page (open it in a browser)
npm run page:test                                       # the demo page in headless Chromium
node tools/render.mjs chiptune electronic orchestral rock
node tools/render.mjs rollcall beethoven5 ode           # the orchestra: about 2, 3 and 4 minutes on one core
pip install numpy scipy matplotlib pyloudnorm           # for the ears
python3 tools/ears.py out/orchestral.wav
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
tremolo, `&` arpeggiated chord (rolled from the bottom), `*` harmonic (strings: nearly pure, airy), `@a` `@e` `@i`
`@o` `@u` the vowel a voice sings, or `@freu` a syllable: a choir with a voice type sings its consonants (an s or f
hisses just before the beat, so the vowel lands on it; t, k and p are short bursts; m, n, l and r hum or tap into
the vowel; a final consonant closes it). Playing techniques follow the suffixes, several in a row: strings `%pont`
(sul ponticello: glassy, the fundamental weak), `%tasto` (sul tasto: soft), `%spicc` (spiccato: short, bounced),
`%legno` (col legno: the stick's click), `%port` (portamento: a slide from the note before); `%trem8` `%trem16`
`%trem32` measured tremolo in time with the music (tongued repeats on winds and brass, double-tongued); `%flz`
flutter-tongue on winds and brass; `%rip` a rip up into a brass note; `%brassy` cuivre, which loud brass also gets
by itself at ff. A slurred note (`_`) glides from the one before through a finger or lip change; an unslurred note
that joins the one before changes bow. A bar that does not add up to the grid (16 steps in 4/4) is an error with its section, part and bar number. A
section may set its own `meter`, `grid` and a `tempo` line with one BPM per bar (`'| 160 | 160 | 80 | - |'`), which is
how imported scores carry meter changes and tempo marks, and a `hold` line that stretches steps of a bar
(`'| - | 12:4*2 |'`: steps 12 to 15 of bar 2 last twice as long), which is how they carry fermatas and caesuras.
A song's `stage: { seat: 'stalls' }` seats the listener in a hall (`front`, `stalls`, `balcony`) and each stereo part
on the stage by its pan and its section's depth (strings at the front, brass and percussion at the back; `depth` on
a part moves it): each part gets its own direct level and early reflections, and the reverb bus adds the late hall.

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
trills are kept. MusicXML, MIDI and ABC go through music21. Since 0.11.0 no Python is needed for any of these:
`engine/kern.mjs` reads **kern as `tools/kern.py` does (`node tools/convert.mjs piece.krn songs/piece.mjs`), in
Node or a browser, and the other three formats have JavaScript importers too. Since 0.11.1
`node tools/import_score.mjs imports/moonlight.json` follows a config as `tools/import_score.py` does, byte for byte. Each config in `imports/` names the source file, the
tempo, how each staff splits into parts (Moonlight's melody and triplets), the pedal rule and the sound.

New score features used by the imports: grace notes (`{G#4 A4}B4:2`), a `pedal` line per section (`P` press or
re-press, `U` lift; a press comes down 50 ms after its step, so keys let go with a change are damped), a dynamics line for every part at once (`dyn: { '*': '| pp | - |' }`), and notes held from one
section into the next (a line that starts with `-`).

Licences: the compositions are in the public domain. The encodings used here are Craig Stuart Sapp's Humdrum
editions; the Joplin and Mozart ones are CC BY-NC-SA 4.0, and the Beethoven repository states no licence. That is why
the three song files they produce (`moonlight`, `entertainer`, `alla_turca`) are not committed: generate them locally
with the commands above. For anything a game ships, use sources with an explicit public-domain or CC0 licence.

## The piano

`engine/piano.mjs` is additive synthesis of stiff strings: inharmonic partials, a felt-hammer spectrum that
brightens with velocity (`felt: [lo, hi, p]`, the cutoff `lo + hi * velocity^p` Hz, default `[500, 4400, 1.8]`;
`bassBright: 0.5` brightens bass notes struck hard, as recorded notes measure), a two-stage decay from coupled unison strings, hammer noise, voicing, rolled chords, grace
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
node tools/import.mjs SCORE.mxl songs/name.mjs [--bars 93-331] [--tempo 160] [--title "..."] [--key "D major"] [--source "..."]
node tools/render.mjs name
```

`tools/import.mjs` (and `importMusicXML` in a browser: drop a score on the demo page) writes the same song as the
original Python importer, `python3 -I tools/import_orchestra.py` (music21), in seconds instead of minutes. MIDI files
and ABC tunes import the same way, and any song exports to MIDI for a DAW:

```sh
node tools/convert.mjs tune.abc songs/tune.mjs --instrument flute
node tools/convert.mjs quest.abc songs/quest.mjs     # several tunes (or %%cue lines): a songbook, a cue per tune
node tools/convert.mjs piece.mid songs/piece.mjs
node tools/convert.mjs songs/chiptune.mjs out/chiptune.mid
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
