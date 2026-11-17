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
| `parts` | Name to `{ inst, pan, gain, role, sends, fx, mono, double, humanize, velVar, level, range, shift, depth }`. `role` (`melody`, `harmony`, `bass`) tells the critic what to check; `sends` maps bus names to dB; `fx` is a list such as `[['eq', [...]], ['dynlp', 2200, 9000]]`; `depth` is how far into the stage the part sits, in metres (with `stage`; by default its section's usual place) |
| `dynamics` | How far apart the dynamic marks are (default 1: pp to ff is about 17 dB). Imported concert scores use 1.2, the range of recorded orchestras; game cues keep 1, a steadier level under play |
| `stage` | `{ seat: 'front' \| 'stalls' \| 'balcony' \| { d, h }, width, height, depth, length, early }`: places every stereo part on a concert stage, by its pan and depth, and the listener in a seat; each part gets its own direct level and early reflections (see `stageTaps`). Without it, parts are not placed |
| `buses` | Name to `{ type: 'reverb', rt60, size, predelay, er, hf, lowCut, highCut }` or `{ type: 'delay', time, feedback, lowCut, highCut }` (`time` in seconds or as a note value such as `'3/16'`) |
| `sections` | Name to `{ bars, chords, parts, dyn, pedal, meter, grid, tempo, bpm, rit, hold }`. Part lines are text or functions of the song that return text, or `'@Section.part+N'` to copy another line transposed by N semitones. `dyn` gives each part a marking a bar (`'\| p< \| - \| f \|'`) or several at their steps, written like notes (`'\| mf:12 <:4 \| f \|'`). `hold` stretches steps of a bar: `'\| - \| 12:4*2 \|'` (step:steps*factor, several per bar) |
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

### `renderPart(song, arr, part, N, { offset, range })`

One part of an arranged song, rendered through its instrument, insert effects and stage place: `[{ L, R, pan }]` (one
track, or two for a doubled part; `R` is null for a mono part), or null when the part has no notes in `range`.
`mixParts` adds parts in the song's order; a worker can render any of them (see `renderSongParallel`).

### `renderSongParallel(song, { run, ahead, stems })`

`renderSong` with its parts rendered by `run(job)`, a function returning a Promise of `partJob(job)` computed
anywhere (a Web Worker, a Node worker thread). Parts are added to the mix in order as they come back, so the samples
are the same as `renderSong`'s, bit for bit; `ahead` (default 8) bounds how many parts are in flight. In Node,
`tools/workers.mjs` has a pool: `node tools/render.mjs orchestral --workers 4`.

### `partJob(job)`

The worker's side of a parallel render: `{ song, key, pname, N, offset, range }` (a frozen song) to `renderPart`'s
tracks, keeping the last few arrangements by `key`.

### `partTransfer(tracks)`

The buffers of `partJob`'s result, to transfer back to the thread that asked (`postMessage(msg, partTransfer(t))`).

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

### `renderCueParallel(song, { cue, run, ahead })`

`renderCue` with every window's parts rendered by `run` (as for `renderSongParallel`): the same samples. The player
uses it with `parallel: true`, sending each part to its worker pool.

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
into), `workers` (render workers, default 2; 0 renders on the main thread), `parallel` (render a cue's parts across
all the workers and mix them on the page's thread, the same samples; default true with 3 or more workers; the
orchestral cue renders 2.2 times as fast on 4 workers as on one), `cache` (IndexedDB, default true),
`stream` (start music that is not cached while it renders, default true), `voiceDuck` (music level while a voice
speaks, default 0.6). Returns the player:

| Member | What it does |
| --- | --- |
| `music(song, { cue, fade, at, layers, intro, restart, loop })` | Plays a cue (default `'main'`): the intro, then the loop forever. `at` is `'now'`, `'beat'` or `'bar'` of the music playing; `fade` crossfades from it. On a cold cache it streams at once and switches to the exact loop on a bar line when that is rendered. `loop: false` streams the song's form once instead (a long piece, an imported score). Resolves when scheduled |
| `importScore(bytes, opts)` | Imports a MusicXML score in a worker (see `importMusicXML`): `{ song, text, report }`. Play it with `music(song, { loop: false })` |
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

## Sheet music

### `importMusicXML(input, { title, key, source, tempo, bars, compat, expression, pedal, fileName, log })`

Reads a MusicXML full score (`.mxl` bytes, `.musicxml` bytes or text) and returns `{ song, text, report }`: the song
object, the same song as an ES module to save in `songs/`, and what was read (bars, each part's preset and note
count, lanes, sections, the base tempo). It matches every part to an orchestra preset by its MusicXML sound ID, its
name in English, Italian, German or French, or its General MIDI program; writes transposing instruments at sounding
pitch; writes repeats and endings out; turns metronome marks, tempo words, Tempo I, a tempo, rit., accel., recitativo
and fermatas into a tempo line, and meter changes into sections; keeps each part's dynamics, hairpins and sforzandi,
slurs, staccatos, accents, ties, grace notes, trills, tremolos, pizzicato and arco, and mutes; and gives voices the
vowels of their lyrics. `bars: 'A-B'` imports bars A to B counted as played; `tempo` overrides the score's. It writes
the same songs as `tools/import_orchestra.py` (Python and music21) with `compat: true`, in seconds:
`node tools/import.mjs SCORE.mxl songs/name.mjs` from a shell. By default it also reads what music21 leaves out:
several instruments on one percussion staff, harmonics (`*`), glissandi and slides (written out as runs), mordents
and turns, arpeggio marks (`&`), "a 2", "1." and "2." on a shared wind or brass staff (two players, `_2` lanes),
breath marks and caesuras, cue notes (not played) against small print (played), fermatas that hold their note (a
`hold` line) instead of slowing their whole bar, tempo words in the beat their meter counts, and sustain pedal marks
(a `pedal` line). `pedal: 'bass'` pedals a piano score that has no marks: the pedal changes at each new bass note (a
note that starts with nothing lower sounding). `expression: true` adds phrase-level rubato and agogic accents.

### `readMusicXMLText(input)`

The MusicXML text of a file: unzips an `.mxl` archive (its container names the score), decodes bytes, or returns text.

### `playOrder(measures)`

The order a performance plays measures in, repeats (with `times`) and first and second endings written out:
indexes into `measures`, each `{ forward, backward, times, endings }`.

### `mapPart(names, sound, program, unpitchedShare, hasVoices)`

The preset for a part: `[preset, percussion token or null, how it was chosen]`.

### `importMidi(bytes, { title, key, grid, tempo, bars, pedal, dynamic, log })`

A Standard MIDI File to a song, laid out like a MusicXML import: one part per track and channel, presets by track
name or General MIDI program, the tempo and meter maps (a bar plays at its fastest tempo, and a slower run inside it
is a hold over those steps, so a fermata comes back from `exportMidi` as one), a dynamic marking where a bar's velocities move to another
level, drums (channel 10) on a General MIDI band kit, the sustain pedal (controller 64) as a `pedal` line, or with
`pedal: 'bass'` and no controller 64, a pedal that changes with the bass (as `importMusicXML`). Notes snap to `grid` steps per quarter note, by default the
coarsest grid every onset fits (a file written on a grid) or that a played file's onsets are within 0.035 of a
quarter of on average. `dynamic: 'pp'` makes the file's commonest level pp and moves the others with it, for a file
whose velocities follow a player's touch rather than the score's marks. Band, synth and chip instruments get their
room (`report.room`, as `importABC`). Returns `{ song, text, report }`.

### `exportMidi(song, { ppq })`

A song's notes as a Standard MIDI File (`Uint8Array`, format 1): a tempo track with every bar's tempo (and a
slower one for as long as a hold, a fermata, lasts, so the notes stay on their grid) and every section's meter, then a named track per part with its General MIDI program, drums on channel 10, the pedal line as
controller 64 on the first piano's track; velocities follow accents and dynamics. `importMidi(exportMidi(song))` gives back every note at its time (a test checks it on
Beethoven's Fifth).

### `parseMidi(bytes)`

A MIDI file's tracks and events: `{ format, ppq, tracks: [{ name, events }] }`.

### `importABC(text, { instrument, presets, accompany, dynamicsInBar, title, key, tempo, index, log })`

An ABC tune (the first in the text, or number `index`) to a song: keys and modes, accidentals that last to the end
of the bar, lengths, broken rhythm, tuplets, chords, ties, slurs, grace notes, decorations (staccato, accent,
marcato, fermata, trill, mordents and turns, roll, tremolo `!/!` `!//!` `!trem!`, dynamics, hairpins), annotations
(`"^pizz."`, `"^arco"`, `"^sul pont."`, `"^flz."` as playing techniques), repeats with first and second endings,
inline fields and lyrics.

On a drum staff, `!ghost!` plays a hit softly and grace notes before a hit are a flam (`{D,,}D,,`) or a drag; a note
that takes an accidental from earlier in its bar (`F,,` after `^F,,`) plays as written that way, with a warning.
`!harmonic!` makes a note a natural harmonic (sounding as written) and a two-note chord an artificial one (the
stopped note and the touch above it). Glissandi as abcm2ps writes them, `!-(!` (or the wavy `!~(!`) before the note one leaves and `!-)!` before the note
it reaches, run in the time of the first note. After a voice, `%%gain` (dB), `%%pan` (-1 to 1) and `%%double` (two
panned takes, width 0 to 1, default 0.85) set its place in the mix.

Dynamics and hairpins are read where they are written, within the bar (`dyn` lines such as `'| p:2 f:2 | mp<:3
mf:1 |'`); a hairpin closed with no dynamic arrives one level above or below the one it began at.
`dynamicsInBar: false` reads one dynamic a bar instead, as the MusicXML, MIDI and Humdrum importers do.

Several voices: `V:` lines in the header (`V:2 name="Cello"`), then the music either under each `V:` line or line by
line with `[V:2]` at the start. Each voice's instrument comes from its name (`"Violins"`, `"Electric Bass"`, `"Synth
Pad"`, `"Pulse"`), its `%%MIDI program n` (General MIDI, from 0), or `presets: { voiceId: 'preset' }`. A voice named
Drums, with `clef=perc`, or on `%%MIDI channel 10` plays General MIDI drum notes (C,, kick, D,, snare, ^F,, closed
hat) on a band kit, or on the chip noise channel in a chip song. Parts: `P:A` in the body starts part A in every
voice; `P:Intro A2 B` in the header plays them in that order. The sections are named after the parts.

Bars that do not fill their meter are padded with rest, and bars that overfill it are cut at the bar line, each
with a warning in `report.warnings` (`"Flute, part B, bar 3: 5 beats in a 4/4 bar; cut at the bar line"`); the
first bar may be a pickup. Chord symbols become each section's `chords` line and, unless `accompany: false` or
`%%accompany off`, an accompaniment in the song's style: harp and pizzicato cellos for an orchestra, strummed guitar
and electric bass for a band, pad and synth bass for synths, a pulse arpeggio and the triangle for chips (the bass
sits out when the tune has one). A song of band, synth or chip instruments gets a room, a master and no stage to
suit it (`report.room`: `'hall'`, `'band'`, `'synth'` or `'chip'`). `instrument` names a one-voice tune's preset.

### `importABCBook(text, { title, ...importABC options })`

A songbook: every tune in the text (each from its `X:` line) becomes a cue of one song. In a tune, `%%cue battle`
names its cue (default: the title), `%%stinger victory` makes it a stinger instead, `%%intro A` names the parts
played once before the rest loops (a part named Intro is one), and `%%layer drums Timpani, Snare` makes a layer of
those voices. Lines before the first `X:` apply to every tune. Voices with the same instrument share a lane across
cues. Returns `{ song, text, report }`: `report.cues` (`{ name: { intro, body, bars, warnings } }`),
`report.stingers`, `report.layers`, `report.warnings`, `report.room`. `songs/lantern_road.mjs` is one, written out.

### `partOrder(p)`

The part labels a `P:` header field plays, in order: `partOrder('A2B')` is `['A', 'A', 'B']`,
`partOrder('Intro (AB)2')` is `['Intro', 'A', 'B', 'A', 'B']`.

### `songText(song, head)`

A song as the text of a song module (`export default {...};`, short arrays on one line), after `head`.

### `importKern(text, { title, tempo, key, source, list, instrument, pedal, log })`

A Humdrum **kern score (`.krn`, the format of many digitized piano and chamber scores) to a song, in JavaScript: the
port of `tools/kern.py`. It reads spine splits and merges (several voices on a staff), ties, grace notes, trills,
staccato and accent marks, a **dynam spine, `*MM` tempo, `*k[...]` key, `*I"` instrument names, and the expansion
list (`*>[A,A,B]`, or `list` names another) that writes the repeats out. Each staff is a part; `pedal: 'bass'` pedals
with the bass, as `importMidi`. Returns `{ song, text, report }`; `report.expansion` is the section order played.

### `readKern(text, list)`

The notes of a **kern score before layout: `{ notes: { staff: [{ on, dur, midi, name, arts, grace, trill }] }, dyn,
barLen, pickup, bars, end, order, tempo, keys, names }`, times in ticks of 20160 to the quarter note. It reads as
`tools/kern.py` does (a test compares them note for note).

### `importScore(input, options)`

Any of the four: MusicXML, MIDI, ABC or Humdrum **kern, told apart by their first bytes. Returns `{ song, text, report, format }`.
ABC text with more than one tune, or a `%%cue` or `%%stinger` line, is read as a songbook (`importABCBook`).

### `scoreFormat(input)`

`'musicxml'`, `'midi'`, `'abc'` or `'kern'`.

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

### `arrange(song, { strict })`

Turns sections into timed note events without rendering. Returns `{ duration, timeline, parts, lines, errors,
repairs, triggers, starts, pedal, damperAt, spb, beats }`. `parts[name].events` holds `{ t, dur, midi | drum, vel,
art, where, ... }`; `timeline` holds each bar's start and end time; `starts` holds each section's name and first bar.

`errors` are what stop a song playing: a form naming a section that does not exist. Everything else that can be
repaired is, and listed in `repairs` with its section, part and bar and what was done:

- a bar that does not add up is padded with rest or cut at the bar line;
- an unreadable token or note plays as a rest, an unknown technique or dynamic is left out;
- a part with too few bars repeats to fill its section (and stops where it ends), one with too many is cut;
- a tempo line that is short carries its last tempo on;
- a section's part or dynamics line for a part the song does not have is left out.

With `strict: true` each of these is an error instead, as before 0.10.0. Renders arrange leniently, so a score with
a miscounted bar still plays; the critic lists the repairs first.

### `critic(song, arr)`

The checks an agent runs before rendering. Returns `{ warnings, report }`. The warnings are, in order:

- what the arranger repaired (`repaired: A.lead bar 2: 20 steps, expected 16 (4 too many); cut at the bar line`);
- notes outside an instrument's range;
- melody, harmony and bass notes that miss the section's chords on the beat;
- part lines whose bars are all identical.

`report` gives each part's event count, range and chord-tone share.

### `TECHNIQUES`

The playing techniques a note may carry after its suffixes (`C5:4%pont`): `pont tasto spicc legno port trem8 trem16
trem32` for strings, `flz trem8 trem16 trem32` for winds and brass, `rip brassy` for brass. The README's score format
says what each sounds like.

### `parseLine(line, { spb, drum, where, lenient })`

Parses one part line. Returns `{ events, bars, steps, errors, repairs, lead }` and never throws: every bar of the
wrong length and every unreadable token is reported with its bar number. With `lenient`, those that can be repaired
are (as `arrange` does) and listed in `repairs` instead. `lead` counts steps held over from the section before.

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

### `stageTaps(song, part)`

Where a part sits and what the listener hears of it, with `song.stage` set: `{ direct, taps }`, the direct sound's
gain (relative to a player 4 m into the stage) and its early reflections `[delay in samples, gain, pan]` from image
sources in a shoebox hall (side walls, ceiling, the stage's back wall, the rear wall, and pairs of them). From the
front row the first reflection comes 38 ms after the violins' direct sound, from the stalls 27 ms, from the balcony
18 ms; trombones at the back are 2 dB quieter directly than violins at the front, with 4 dB more reflected sound for
their direct sound. null without a stage.

### `SEATS`

The named seats: `front`, `stalls` (the default) and `balcony`, each `{ d, h }`: metres from the stage and ear height.

### `ears(L, R)`

Measures stereo audio as `tools/ears.py` does, with no Python: `{ seconds, integrated_lufs, true_peak_dbtp,
sample_peak_dbfs, crest_db, loudness_range_lu, balance_pct, centroid_hz, stereo_corr, side_vs_mid_db, onsets_per_s,
tempo_bpm_est, key_est, key_conf, key_runner_up, clicks, flags }`. `balance_pct` splits the energy into sub (20-60
Hz), bass, low-mid (250-500), mid, high-mid (2-6 kHz) and air; `flags` name what may sound wrong (true peak over -1
dBTP, low mids over 30%, under 0.5% above 6 kHz, bass over 65%, stereo correlation under 0.1, crest under 8 dB,
clicks). On renders it agrees with `ears.py` within 0.2 LU, 0.4 dB of true peak and 1 point of balance, on the same
key and tempo (`test/ears.test.mjs`). `npm run ears -- songs/<name>.mjs` measures every cue of a song as a game first
hears it (the head, then the loop twice); `npm run ears -- out/x.wav` measures a file.

### `checkAudio(measurement, { lufs, tolerance })`

Pass or fail an `ears` measurement for a game: `{ pass, problems, warnings }`. It fails on any click, a true peak
over -1 dBTP, or loudness more than `tolerance` (default 2) LU from `lufs` (default -16); the other flags are warnings.

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
