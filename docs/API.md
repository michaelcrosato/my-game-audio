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
| `intro`, `loop` | Section names: as game music the song plays `intro` once, then `loop` forever, seamlessly |
| `loops` | Several cues: `{ calm: { intro: ['in'], body: ['A', 'B'] }, fight: { body: ['C'] } }`; a game changes cue on the next bar. Without `loops` or `loop`, the whole `form` loops |
| `layers` | `{ drums: ['kick', 'snare'], strings: ['violins'] }`: groups of parts rendered as separate stems, whose gains a game sets as it plays; parts in no layer are the layer `base` |
| `stingers` | `{ win: ['fanfare'] }`: sections played once over the music (`player.sting('win')`) |

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

## Game music

A cue is the music a game loops: an optional intro, then a body that repeats with no gap and no click. The player
uses these functions; tools and tests can call them directly.

### `renderCue(song, { cue })`

Renders one cue as `{ head, loop, entry, layers, intro, body, headLoopAt, introBars, bodyBars, normDb, stats }`.
`head` and `loop` map each layer to `{ L, R }`. Play `head` from its start, then `loop` from `headLoopAt` seconds in,
repeating; `entry` is the head without the intro, for entering this cue from another at a bar line. The loop is the
body rendered once with its whole tail folded into its start, so its seam is as smooth as any other point; the master
runs over the head and loop together, and its gain curves apply to every layer, so the stems always sum to the mix.

### `renderOnce(song, form)`

The sections `form` (default the song's form) rendered once with their tail and mastered: `{ L, R, sr, seconds,
normDb }`. Stingers and jingles.

### `cuesOf(song)`

The song's cues: name to `{ intro, body }` (section names), from `loops`, or `intro` and `loop`, or the whole form.

### `layersOf(song)`

The song's layers: name to part names, with every part in no layer in `base`.

### `cueTiming(song, cue)`

A cue's timing without rendering it: `{ intro, body, introBars, bodyBars }` (seconds; each bar's start, length and
beats). The player uses it for bar and beat callbacks while audio is still rendering.

### `estimateNorm(song, { cue, seconds })`

A quick estimate of a cue's loudness gain from its body's first seconds, for streaming before the exact render exists.

### `freeze(song)`

The song as plain data (part lines written as functions replaced by their text), ready to post to a worker or store.

### `cueKey(song, cue)`

The cache key of a cue's rendered audio: it changes with the song's content, the cue and the engine version.

## The player

### `createPlayer(options)`

A player for browsers. Options: `context` (an `AudioContext` or `OfflineAudioContext`; one at 44.1 kHz is made on
first use otherwise), `destination`, `buses` (`{ music, sfx, voice }`: a game engine's own `AudioNode`s to play
into), `workers` (render workers, default 2; 0 renders on the main thread), `cache` (IndexedDB, default true),
`stream` (start music that is not cached while it renders, default true), `voiceDuck` (music level while a voice
speaks, default 0.6). Returns the player:

| Member | What it does |
| --- | --- |
| `music(song, { cue, fade, at, layers, intro, restart })` | Plays a cue (default `'main'`): the intro, then the loop forever. `at` is `'now'`, `'beat'` or `'bar'` of the music playing; `fade` crossfades from it. On a cold cache it streams at once and switches to the exact loop on a bar line when that is rendered. Resolves when scheduled |
| `cue(name, { at, fade, intro })` | Changes to another cue of the same song on the next bar line (default) or beat |
| `layer(name, gain, fade)` | Sets a layer's gain (0..1) with a fade; the setting is kept for the song's other cues. `layers()` lists them |
| `sting(nameOrSong, { at, duck, gain })` | Plays one of the song's `stingers` (or a song's form) once over the music, on `'now'`, `'beat'` or `'bar'`, ducking the music under it |
| `stop({ fade, at })` | Stops the music |
| `prepare(song, cue)` | Renders a cue into the caches without playing it (call it while a level loads). `ready(song, cue)` says whether it is in memory |
| `pos` | Where the music is: `{ playing, cue, time, bar, beat, beats, pass, inIntro }` |
| `onBeat(fn)`, `onBar(fn)` | Call `fn(pos)` on every beat or bar line as it is heard; return `{ cancel() }` |
| `bus(name)` | The `GainNode` of `'master'`, `'music'`, `'sfx'` or `'voice'`, to connect your own nodes |
| `volume(bus, v)`, `mute(bus, on)` | A bus's volume (0..1) and mute; `volume(bus)` reads it |
| `duck(on, { depth, fade })` | Holds the music down (a pause screen, a dialog) |
| `sfx(nameOrSpec, { volume, pan, pitch, loop, fade, at, bus })` | Plays a sound effect through the sfx bus: a name from `SOUNDS` or a spec. Each play takes the next of several seeded takes (the first renders at once, the rest in a worker), so repeats vary. Ambient beds loop. `at: 'beat'` puts it on the music's beat. Returns `{ stop(fade), set({ volume, pan }), duration, playing }` |
| `define(name, spec)`, `sounds()`, `preload(names)` | Adds a named sound; lists the names; renders sounds ahead of their first play |
| `say(text, character, { emotion, seed, volume, pan, onSyllable })` | Speaks a line in gibberish through the voice bus, ducking the music meanwhile; `onSyllable(s, i)` fires as each syllable sounds (reveal `text.slice(0, s.to)`). Resolves when it starts to `{ duration, syllables, done, stop() }` |
| `unlock()` | Resumes the context after the first tap or key (browsers start audio suspended) |
| `stats`, `dispose()` | Counts of renders, streamed starts and cache hits; stop and release the workers |

Rendered cues are cached in memory and in IndexedDB (16-bit), keyed by `cueKey`, so a cue renders once per engine
version on each device.

## Sound effects

An effect is data: `{ layers: [...], level, ceiling, vary, loop, tail }`. Each layer is a small model with its own
`at` (delay, s), `gain` (dB) and `pan`:

| Type | What it makes | Main settings |
| --- | --- | --- |
| `tone` | sfxr-style blips, jumps, lasers, coins | `wave` (square saw sine triangle noise pulse), `freq` (Hz or `'C6'`), `slide` (octaves/s), `dslide`, `vib` `[Hz, semitones]`, `arp` `[[s, semitones], ...]`, `repeat`, `duty`, `dutySlide`, `a` `s` `punch` `d` `curve`, `lp` `{ f, sweep, res }`, `hp` `{ f, sweep }` |
| `noise` | hisses, swells, beds | `color` (white pink brown), `bp` / `lp` / `hp` `[from Hz, to Hz]`, `q`, `a` `s` `d` `curve` |
| `modal` | struck things: wood, metal, glass, stone, plastic, flesh | `material` or `modes` `[[ratio, amp, T60]]`, `freq`, `hardness`, `d` |
| `boom` | explosions | `size` (0..1) |
| `step` | footsteps | `surface` (grass gravel wood stone metal water snow dirt), `weight` |
| `whoosh` | swings, passes, dashes | `from`, `to` (Hz), `d`, `q` |
| `crackle` | fire, sparks, grinding | `density`, `bp`, `decay`, `d` |
| `drip` | drops, splashes, bubbles | `count`, `freq`, `spread`, `span`, `d` |
| `creak` | doors, hinges, timber | `rate` `[from, to]`, `res` `[Hz...]`, `q`, `d` |

`level` is the target loudness (dB, near LUFS; default -18) and `ceiling` the peak limit (default -1 dBFS).
`vary: { pitch, gain }` spreads each take. `loop: seconds` makes a seamless ambient bed of that length.

### `renderSfx(spec, { seed, pitch })`

Renders an effect: `{ L, R, seconds, peakDb, loudness }`. The same seed gives the same take.

### `sfxLoudness(L, R)`

The loudness of a short sound: K-weighted, over its loudest 400 ms, ungated (dB, close to LUFS).

### `SFX_TYPES`

The layer types above.

### `SOUNDS`

The library: 58 named sounds in seven categories (`interface`, `movement`, `combat`, `magic`, `pickups`, `doors`,
`ambient`), each a spec with its `cat`. Copy one and change it to make your own.

### `soundNames(category)`

The names of the library's sounds in a category, or all of them.

## Voices

### `speak(text, character, { emotion, seed, level, pan })`

Says `text` in gibberish: `{ L, R, seconds, syllables }`, where each syllable is `{ t, dur, text, from, to, semis }`
(when it sounds, its letters in the text, its pitch in semitones). `character` is a name from `VOICES` or a profile.

### `syllables(text)`

How a line splits into syllables: `[{ text, from, to, vowel, onset, coda, word, end }]`, `end` being the
punctuation after the word (`. ? ! ,`).

### `VOICES`

Character profiles: `villager hero heroine child elder merchant giant fairy critter robot monster ghost`. A profile
is `{ pitch (Hz), speed (syllables/s), size (formant scale), range (semitones), voice (soprano alto tenor bass),
breath, buzz, shake, growl, square, style ('simlish' or 'animalese') }`; pass your own object for a new character.

### `EMOTIONS`

`neutral happy sad angry scared surprised`: how each moves the pitch, the range, the speed and the loudness.

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
