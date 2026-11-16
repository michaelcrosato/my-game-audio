# my-game-audio API

Everything public is exported from `engine/index.mjs` (the package's main entry). Anything else is internal and may
change between versions. Times are in seconds, sample buffers are `Float32Array`s at `SR` (44,100 Hz), and every
function is deterministic: the same arguments give the same samples.

```js
import { renderSong, critic, VERSION } from 'my-game-audio'; // or './engine/index.mjs'
import song from './songs/chiptune.mjs';
const { L, R, stats, review } = renderSong(song);
```

`test/api.test.mjs` checks that every export is listed here and every heading below is exported.

## A song

A song is a plain object, usually the default export of a `songs/<name>.mjs` file. The README has the score format in
one screen; the fields are:

| Field | Meaning |
| --- | --- |
| `title`, `style`, `key`, `source` | Text for people and tools. `source` records where imported notes came from and their licence |
| `bpm`, `meter`, `grid` | Tempo, `[beats, beatUnit]` (default `[4, 4]`) and steps per bar (default 16) |
| `seed` | Seeds every random choice (humanizing, noise, detuning); change it for a different take |
| `tail` | Seconds rendered after the last bar for tails to ring out (default 3) |
| `instruments` | Name to instrument spec: `{ type, ...settings }`. Types: `chip va fm pluck strings brass choir modal drums piano wind organ ensemble perc`; `presetSpec(name)` gives an orchestral one |
| `parts` | Name to `{ inst, pan, gain, role, sends, fx, mono, double, humanize, velVar, level, range, shift }`. `role` (`melody`, `harmony`, `bass`) tells the critic what to check; `sends` maps bus names to dB; `fx` is a list such as `[['eq', [...]], ['dynlp', 2200, 9000]]` |
| `buses` | Name to `{ type: 'reverb', rt60, size, predelay, er, hf, lowCut, highCut }` or `{ type: 'delay', time, feedback, lowCut, highCut }` (`time` in seconds or as a note value such as `'3/16'`) |
| `sections` | Name to `{ bars, chords, parts, dyn, pedal, meter, grid, tempo, bpm, rit }`. Part lines are text or functions of the song that return text, or `'@Section.part+N'` to copy another line transposed by N semitones |
| `form` | Section names in playing order; a section may appear more than once |
| `master` | `{ lufs: -16, ceiling: -2, eq, comp }`. `lufs: false` keeps the raw level (calibration) |

## Rendering

### `renderSong(song, { log, stems })`

Renders the whole song. Returns `{ L, R, sr, stats, review, arr, stems }`:
`stats` is `{ seconds, lufs, peakDb, renderMs, partMs, normDb }`; `normDb` is the loudness gain the master applied,
which `renderStream` needs. `review` is `critic(song)`. With `stems: true`, `stems` maps each part to its own
`{ L, R }` after its gain and pan, before the buses. Throws on score errors, listing all of them.

### `renderStream(song, { onChunk, normDb, first, window, log })`

Renders in windows (`first` seconds, default 3, then `window`, default 8) and calls `onChunk({ L, R, start, total,
sr })` with finished audio in order, so playback can begin after the first window. `normDb` is `stats.normDb` from
a `renderSong` of the same song; without it the mix plays at its raw level. Returns `{ seconds, renderMs, windows }`.
Linear effects stream exactly; reverb matches in loudness (within 0.2 LU) but not sample for sample.

### `streamable(song)`

`true` when no part uses a compressor, ducking, drive or chorus, the effects that stream only approximately.

### `wav(L, R, sr)`

A 16-bit stereo PCM WAV file as a `Uint8Array`.

## Checking a score

### `arrange(song)`

Turns sections into timed note events without rendering. Returns `{ duration, timeline, parts, lines, errors,
triggers, starts, pedal, damperAt, spb, beats }`. `errors` lists every problem with its section, part and bar;
`parts[name].events` holds `{ t, dur, midi | drum, vel, art, where, ... }`; `timeline` holds each bar's start and
end time; `starts` holds each section's name and first bar.

### `critic(song, arr)`

The checks an agent runs before rendering. Returns `{ warnings, report }`: warnings for notes outside an
instrument's range, melody, harmony and bass notes that miss the section's chords on the beat, and part lines whose
bars are all identical; `report` gives each part's event count, range and chord-tone share.

### `parseLine(line, { spb, drum, where })`

Parses one part line. Returns `{ events, bars, steps, errors, lead }` and never throws: every bar of the wrong length
and every unreadable token is reported with its bar number. `lead` counts steps held over from the section before.

### `parseChord(symbol)`

`'Am7'`, `'C/E'`, `'Bbmaj7'` to `{ sym, root, bass, intervals, tones }` (pitch classes), or `null`.

### `parseChords(line, spb, where)`

A chords line such as `'| Dm | Bb F |'` to `{ chords, bars, errors }`, two chords in a bar splitting it evenly.

### `noteToMidi(name)`

`'C4'` to 60, `'F#3'` to 54; `null` for anything else.

### `midiToName(midi)`

60 to `'C4'`, spelling the black keys C#, Eb, F#, Ab and Bb.

## Generators

Generators write part lines as text, so their output is checked like hand-written lines.

### `voiceLead(chords, { lo, hi, notes, spb })`

For each chord, `notes` chord tones between `lo` and `hi` that move as little as possible from the voicing before.

### `padLine(chords, { lo, hi, notes, art })`

One held, voice-led chord per chord symbol.

### `arpLine(chords, { lo, hi, pattern, rate, art })`

An arpeggio over the voice-led chord tones: `pattern` indexes into the voicing, `rate` is steps per note.

### `bassLine(chords, { rhythm, octave, art })`

A bass line from a rhythm per chord: `x` root, `o` octave up, `5` fifth, `3` third, `.` rest, `-` hold.

### `repeat(line, n)`

The bars of `line`, `n` times over.

### `transposeLine(line, semitones)`

Every note name in `line` moved by `semitones`.

## Instruments

### `build(spec)`

The instrument a spec describes: `{ range, render(event, out, ctx) }`. Mostly used by the renderer.

### `BUILDERS`

Instrument type to builder function.

### `RANGES`

Range name to `[lowest, highest]` MIDI note, sounding pitch; the critic checks parts against these.

### `presetSpec(name)`

The instrument spec of an orchestral preset (`'violins'`, `'horn'`, `'timpani'`, ...), ready for a song's
`instruments`.

### `PRESETS`

The preset table (`engine/orchestra-presets.json`): every preset's spec, range, seat, hall send, calibrated gain,
and the names, MusicXML sound IDs and MIDI programs it answers to.

## Measuring

### `lufs(L, R)`

Integrated loudness (ITU-R BS.1770-4, gated) in LUFS.

## Utilities

### `SR`

The sample rate, 44,100.

### `rng(seed)`

A seeded random number generator (mulberry32) returning numbers in [0, 1).

### `hash(text)`

A 32-bit FNV-1a hash of a string, for deriving seeds.

### `mtof(midi)`

A MIDI note number to its frequency in hertz (A4 = 440).

### `db(decibels)`

Decibels to a linear gain.

### `VERSION`

The engine version. It is part of the cache key of rendered audio and of the golden hashes in `test/golden.json`.
