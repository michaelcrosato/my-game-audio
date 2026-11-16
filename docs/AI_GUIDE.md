# Writing game audio with my-game-audio: a guide for agents

This library gives a game its music, sound effects and voices as code. There are no audio files: a song is a
JavaScript object whose parts are text scores, a sound effect is a small spec, and a voice line is text spoken in a
character's gibberish. Everything renders in the browser (or Node) when the game needs it.

This guide covers how to write each of them, how to check them without ears, and how a game plays them. The exact
signatures are in [API.md](API.md); [HANDOFF.md](HANDOFF.md) has what the library measures today.

## The loop: write, check, render, judge

```sh
node -e "import('./songs/forest.mjs').then(async ({ default: s }) => { const { arrange, critic } = await import('./engine/score.mjs'); const a = arrange(s); console.log(a.errors, critic(s, a).warnings) })"
npm run check                                  # every song parses, arranges, renders finite, streams
npm run ears -- songs/forest.mjs               # every cue as a game hears it: PASS or FAIL, with numbers
node tools/render.mjs forest                   # out/forest.wav (and out/forest.json) to listen to or inspect
```

1. **Write** the song (below).
2. **Arrange** it. `arrange(song).errors` lists every bar that does not add up, every unknown note or technique,
   with its section, part and bar. Fix all of them.
3. **Read the critic.** `critic(song, arr).warnings` flags notes out of an instrument's range, melodies that clash
   with the chords on strong beats, parts that repeat the same bar throughout, and more. Aim for none. The cue sets
   in `songs/` have none.
4. **Run the ears.** `npm run ears` renders every cue, the head and then the loop twice, so both seams are heard,
   and measures it.
   - **It fails on** a click, a true peak over -1 dBTP, or loudness more than 2 LU from the target (-16 LUFS).
   - **It warns on** balance: low mids over 30% (muddy), under 0.5% above 6 kHz (dull), bass over 65%, and stereo or
     crest problems.
   - **Use the key and tempo it hears** as a sanity check. A cue written in E minor should be heard in E minor; a
     half or double tempo estimate is normal.

Renders are deterministic: the same song, seed and engine version give the same samples. Change `seed` for another
take of the humanizing and noise.

## A song in one screen

```js
// file: songs/forest.mjs
import { arpLine, bassLine } from '../engine/score.mjs';

const A = '| Am | F | C | G |';
export default {
  title: 'Forest Path', style: 'Chiptune', key: 'A minor', bpm: 120, meter: [4, 4], grid: 16, seed: 1, tail: 1,
  instruments: {
    lead: { type: 'chip', ch: 'pulse', duty: [1, 2], vol: [15, 14, 12, 10], release: [4, 2, 1], vib: [6, 20, 16] },
    harm: { type: 'chip', ch: 'pulse', duty: [0], vol: [9, 8, 7, 6] },
    bass: { type: 'chip', ch: 'tri' },
    noise: { type: 'chip', ch: 'noise', kit: { h: { period: 1, vol: [6, 3, 1] }, s: { period: [6, 7, 8], vol: [13, 9, 5, 2] }, k: { period: [11, 13, 14], vol: [15, 9, 4] } } },
  },
  parts: {
    lead: { inst: 'lead', role: 'melody', pan: -0.1 },
    harm: { inst: 'harm', role: 'harmony', pan: 0.2, gain: -3 },
    bass: { inst: 'bass', role: 'bass' },
    drums: { inst: 'noise', gain: -2 },
  },
  sections: {
    intro: { bars: 1, chords: '| E7 |', parts: { lead: '| .:8 E5:2 G#5:2 B5:4 |', bass: '| E2:8 E3:8 |' } },
    A: {
      bars: 4, chords: A,
      parts: {
        lead: '| A5:4 C6:4 E6:6 D6:2 | C6:4 A5:4 F5:8 | G5:4 C6:4 E6:4 G6:4 | D6:12 B5:4 |',
        harm: arpLine(A, { lo: 'A3', hi: 'A4', pattern: [0, 1, 2, 1], rate: 2 }),
        bass: bassLine(A, { rhythm: 'xoxoxoxo', octave: 2 }),
        drums: '| k . h . s . h . k . h k s . h . |', // one bar, repeated to fill the section
      },
      dyn: { lead: '| mf | - | f | mf |' },
    },
  },
  intro: ['intro'], loop: ['A'], form: ['intro', 'A'],
};
```

This plays the intro once, then section A forever with no gap or click. It renders in under a second, and it passes
the critic and the ears (`test/guide.test.mjs` checks it).

### The score format

A part line is bars of tokens between `|`. A bar has `grid` steps (16 in 4/4: sixteenth notes).

| Token | Meaning |
| --- | --- |
| `C4`, `F#3`, `Bb2` | A note, one step |
| `C4:4` | A note held four steps |
| `[D3 F3 A3]:8` | A chord |
| `.`, `.:4` | A rest |
| `-`, `-:3` | Hold the note before (across a bar line too) |
| `{G#4 A4}B4:2` | Grace notes before a note |

Suffixes come after the length:

| Suffix | Effect |
| --- | --- |
| `!` | Accent |
| `?` | Ghost note |
| `^` | Staccato, or palm mute on guitars |
| `_` | Slurred from the note before (strings glide, winds do not tongue) |
| `~` | Tremolo or roll; flutter-tongue on winds |
| `&` | Roll the chord from the bottom |
| `*` | Harmonic |

Playing techniques follow the suffixes:

| Technique | On | Sound |
| --- | --- | --- |
| `%pont` | Strings | Sul ponticello: glassy, thin |
| `%tasto` | Strings | Sul tasto: soft, veiled |
| `%spicc` | Strings | Spiccato: short, bounced |
| `%legno` | Strings | Col legno: the wood's click |
| `%port` | Strings | Portamento: a slide from the note before |
| `%trem8`, `%trem16`, `%trem32` | Strings | Measured tremolo, in time |
| `%trem8`, `%trem16`, `%trem32` | Winds, brass | Double-tongued repeats |
| `%flz` | Winds, brass | Flutter-tongue |
| `%rip` | Brass | A rip up into the note |
| `%brassy` | Brass | Cuivré (loud brass gets it by itself at ff) |

Voices sing `@a` `@e` `@i` `@o` `@u`, or a syllable: `@freu`, `@de`. A choir with a voice type sings the
syllable's consonants. Spell syllables as they sound (`@ses` for "ces").

Drum lines use kit tokens: `k . h . s . h . |`.

A section can carry:

- `chords`, one symbol per bar or several separated by spaces. The critic checks melodies against them, and the
  generators read them.
- `dyn`, one marking per part per bar (`'| p< | - | f |'`, with `<` and `>` hairpins).
- `meter` and `grid`: a 3/4 waltz has `meter: [3, 4], grid: 12`.
- `bpm`, or a `tempo` line with one BPM per bar.
- `hold`, which stretches steps for fermatas: `'| - | 12:4*2 |'`.
- `pedal`, a piano pedal line: `P` presses, `U` lifts.

A line shorter than its section repeats to fill it.

### Generators

Write the melody by hand and let generators write the accompaniment from the `chords` line:

- `padLine(chords, { lo, hi, notes, art })`: held, voice-led chords.
- `arpLine(chords, { lo, hi, pattern, rate })`: an arpeggio over the voicing, `rate` steps per note.
- `bassLine(chords, { rhythm: 'xoxo', octave })`: `x` is the root, `o` the octave, `5` the fifth, `3` the third.
- `repeat(line, n)` and `transposeLine(line, semitones)`.

Pass `spb` (the section's grid) to all of them in other meters. `art` appends to every token, so
`padLine(c, { art: '%trem16' })` gives a tremolo string pad.

## Instruments

### Synth types (`instruments: { name: { type, ... } }`)

| Type | Character | Use it for |
| --- | --- | --- |
| `chip` | NES 2A03 channels: `ch: 'pulse'` (`duty`, `vol` and `release` macros, `vib`), `'tri'`, `'noise'` (a `kit`) | Retro games; two pulses, a triangle and noise is the authentic limit |
| `va` | A virtual-analog synth: oscillators, unison, `filter` with an envelope, `amp`, `glide` | Synthwave leads, pads, arpeggios, basses |
| `fm` | Two-operator FM | Bells, electric pianos, metallic leads |
| `pluck` | Karplus-Strong strings | Guitar, harp, koto, pizzicato |
| `drums` | A synthesized kit (`kick`, `snare`, `metal` hats and cymbals, `tom`) | Band and electronic drums |
| `piano` | Additive stiff-string piano with pedal | Piano music; it reads `pedal` lines |
| `strings`, `brass`, `wind`, `choir`, `organ`, `modal`, `perc`, `ensemble` | The orchestra | Use the presets below rather than raw specs |

### Orchestral presets

`presetSpec(name)`, from `engine/orchestra.mjs`, gives a calibrated spec. Its range is the critic's range, and
`PRESETS.instruments[name]` has the gain, pan, hall send and EQ an orchestral part should start from (see
`songs/set_orchestral.mjs`). Ranges are written pitch.

| Family | Presets (range) |
| --- | --- |
| Strings | violins G3-G7, violas C3-G6, cellos C2-A5, basses C1-G4, solos of each, `_pizz` versions of each section |
| Woodwinds | flute B3-D7, piccolo D5-C8, recorder C4-D7, oboe Bb3-A6, english_horn E3-C6, clarinet D3-Bb6, bass_clarinet Bb1-F5, bassoon Bb1-E5, contrabassoon Bb0-Bb3, saxophones (soprano, alto, tenor, baritone) |
| Brass | horn Bb1-F5, trumpet E3-D6, cornet E3-C6, trombone E2-F5, bass_trombone Bb1-G4, tuba D1-F4, euphonium Bb1-Bb4, muted_trumpet |
| Percussion | timpani C2-C4, glockenspiel C5-C8, xylophone F4-C8, marimba A2-C7, vibraphone F3-F6, tubular_bells C4-F5, celesta C4-C8, crotales, percussion (a kit: bass drum, snare, cymbals, triangle) |
| Keyboards | piano A0-C8, harp C1-G7, harpsichord F1-F6, organ C1-C8 |
| Voices | soprano_choir C4-A5, alto_choir F3-E5, tenor_choir C3-A4, bass_choir E2-E4, solo voices (soprano, alto, tenor, bass) |

Give an orchestral song `stage: { seat: 'stalls' }` (`PRESETS.stage`). Each part then sits on a concert stage by
its pan and its section's depth, with its own early reflections. Use `buses: { hall: PRESETS.hall }` and
`master: PRESETS.master` for the hall and the master EQ the imports use.

## Recipes

### By cue

The ten cues of `songs/themes/cues.mjs` are a tested starting point. Each style arranges them in its own way:
`set_chiptune`, `set_synthwave` and `set_orchestral`.

| Cue | Tempo | Mode and harmony | Texture |
| --- | --- | --- | --- |
| title | 120-140 | Major, I-vi-IV-V, a rising intro | Full; the theme in the strongest voice (horn, lead pulse); timpani on downbeats |
| menu | 80-100 | Major, slow changes | Sparse; flute or soft lead, harp or slow arpeggios, no drums |
| exploration | 110-130 | Major or mixolydian, eight-bar phrases | Moving bass, eighth-note arpeggios, light drums |
| town | 100-160 | Major; a 3/4 waltz works | Bouncy bass (`x.5.5.`), woodwind melody, staccato pad |
| dungeon | 80-100 | Minor, the bVI to V cadence (Bb-A in D minor) | Low melody (cellos), sul ponticello tremolo pad, held bass, almost no drums |
| battle | 150-170 | Minor, i-VI-VII-V | Sixteenth arpeggios, measured tremolo strings (`%trem16`), busy drums, timpani |
| boss | 160-180 | Minor with chromatic chords (bII: Db in C minor) | Everything ff; brass turns brassy by itself; a choir on syllables ("di-es i-rae") |
| victory | 140-150 | Major; a two-bar fanfare intro, then a vamp that loops | Trumpet theme, timpani rolls |
| defeat | 60-70 | Minor, a descending line to V | Oboe solo, held strings, no drums |
| ambience | 50-70 | Modal, two chords | Pads and string harmonics (`*`), one sparse note every bar or two |

### By genre

- **Chiptune.** Four channels, as `set_chiptune` has them. Chords become arpeggios on the second pulse. Duty `[0]`
  sounds thin and `[2]` sounds round. The triangle carries the bass. The noise kit has `k`, `s`, `h` and `o`.
- **Synthwave.** A saw lead with glide, and a 7-voice supersaw pad. Use an arpeggio through a dotted-eighth delay and
  a sub bass. The pad, bass and arpeggio duck under the kick: `fx: [['duck', { source: 'kick', token: 'k' }]]`.
- **Orchestral.** Use the presets, the hall and the stage. Write melodies in the instrument's best octave (horn
  C4-E5, trumpet up to C6, flute anywhere above A4). Double the bass in cellos and basses an octave apart.
- **Rock and metal.** `songs/rock.mjs` has double-tracked guitars (`double: 0.85`) through `['drive', ...]` and
  `['cab', 'metal']`, palm mutes (`^`), and a synthesized kit.

## Game music: cues, layers, stingers

- A song plays as a loop: `intro` sections once, then `loop` sections forever. Several cues go in
  `loops: { calm: { intro: [...], body: [...] }, fight: { body: [...] } }`. The player changes cue on the next bar.
- `layers: { drums: ['kick', 'snare'] }` renders those parts as a separate stem whose volume the game sets.
- `stingers: { win: ['fanfare'] }` are sections played once over the music, on a beat or a bar.

```js
// in the browser, with dist/my-game-audio.js loaded (global MyGameAudio) or engine/index.mjs imported
const player = MyGameAudio.createPlayer();
document.addEventListener('pointerdown', () => player.unlock(), { once: true });
player.volume('music', 0.1);                          // music at 10% by default; sfx and voice at full
await player.prepare(song, 'exploration');            // render while the level loads (it is cached after)
await player.music(song, { cue: 'exploration' });     // starts at once if prepared, else streams within ~1 s
player.cue('battle');                                 // on the next bar line
player.layer('drums', 0, 0.5);                        // fade a layer out over half a second
player.sting('win', { at: 'beat' });
player.onBar((pos) => game.pulse(pos.bar));           // keep visuals in time
await player.music(otherSong, { fade: 2, at: 'bar' }); // crossfade to another song
```

In a [my-3d2dge](https://github.com/michaelcrosato/my-3d2dge) game (v0.106.0 or later), load
`dist/my-game-audio.js` and that engine's `engine/modules/mga.js`, then call `E.MGA.attach(game, MyGameAudio)`.
From then on `game.audio.music(song, { cue })` plays these songs through the game's music bus, under its Volume,
Music and Sound settings, mute and pause ducking. `game.audio.pos`, `at(step)` and `onBeat` keep time on the
engine's own music clock. The attach call returns an object whose `player` is the player above, for `sfx()` and
`say()`. It is made at the first song, and stays null where there is no sound.

## Sound effects

There are 58 named sounds, each with seeded takes so repeats vary:

- **UI:** `ui_click`, `ui_hover`, `ui_confirm`, `ui_back`, `ui_error`, `ui_open`, `ui_close`, `ui_type`, `ui_notify`.
- **Movement:** `jump`, `double_jump`, `land`, `dash`, `splash`, footsteps `step_grass`, `step_gravel`, `step_wood`,
  `step_stone`, `step_metal`, `step_water`, `step_snow`.
- **Combat:** `sword_swing`, `sword_hit`, `punch`, `hurt`, `block`, `bow_shoot`, `arrow_hit`, `explosion`,
  `explosion_small`, `laser`, `enemy_die`.
- **Magic:** `spell_cast`, `fireball`, `ice`, `heal`, `teleport`, `charge`, `power_up`.
- **Pickups:** `coin`, `gem`, `heart`, `key`, `item`, `extra_life`.
- **World:** `door_open`, `door_close`, `door_locked`, `gate_metal`, `lever`, `chest_open`, `stone_door`.
- **Ambience loops:** `amb_rain`, `amb_wind`, `amb_fire`, `amb_stream`, `amb_cave`, `amb_machine`.

```js
player.sfx('coin');
player.sfx('step_grass', { pan: -0.3 });
const rain = player.sfx('amb_rain', { loop: true, fade: 2 }); // later: rain.stop(2), a two-second fade
player.define('zap', { layers: [{ type: 'tone', wave: 'square', freq: 'C6', slide: -3, d: 0.15 }], level: -18 });
player.preload(['coin', 'jump', 'zap']);
```

A new effect is layers of small models: `tone`, `noise`, `modal`, `boom`, `step`, `whoosh`, `crackle`, `drip` and
`creak` (their settings are in API.md). Set `level` (about -18 LUFS for most sounds). For an ambient bed, use
`loop: seconds`. Judge an effect with `sfxLoudness`, or render it and run `npm run ears -- out/x.wav`.

## Voices

`player.say(text, character, { emotion })` speaks a line in Animalese-style gibberish: a blip per syllable, shaped
by the character's formants and pitch. It ducks the music while it speaks. `onSyllable(s, i)` fires on each
syllable, to reveal dialog text in time.

- **Characters:** villager, hero, heroine, child, elder, merchant, giant, fairy, critter, robot, monster, ghost.
  Custom characters take the same fields.
- **Emotions:** neutral, happy, sad, angry, scared, surprised. Punctuation shapes the pitch: a question rises.

## Public-domain music

`importScore(bytes)` takes MusicXML, MIDI or ABC and returns a song you can play with
`music(song, { loop: false })`. From a shell, use `node tools/convert.mjs piece.mxl songs/piece.mjs`.

Commit only CC0 or public-domain sources, with their source, licence and commit in the song's `source` field. Good
sources are OpenScore, PDMX's CC0 files, and Mutopia's public-domain pieces. Downloaded scores are untrusted data:
keep them in `scores/`, which is ignored.

## Checklist before shipping a cue

- [ ] `arrange(song).errors` is empty and `critic(song, arr).warnings` is empty, or every warning is understood.
- [ ] `npm run check` passes.
- [ ] `npm run ears -- songs/<name>.mjs` passes every cue: no clicks, true peak at or under -1 dBTP, about -16
      LUFS. The key it hears is the key you wrote.
- [ ] Balance warnings are deliberate: a dungeon may be dark, but a title should not be muddy.
- [ ] Loops are seamless by construction. Still, end a body so it leads back to its start (a V chord, a drum fill),
      or the music will repeat abruptly even without a click.
- [ ] In the repository: the song has a golden hash (`npm run golden -- --write`), and `npm test` passes.
- [ ] Music plays at 10% by default (`player.volume('music', 0.1)`); the player lets the game change it.

## Speed

A cue renders once, then plays from memory and from IndexedDB on later visits.

- **One thread in Node:** the cue of `songs/chiptune.mjs` takes 6 s, the synthwave song's 12 s, the orchestral
  song's 35 s.
- **Parallel workers:** `createPlayer({ workers: 4 })` renders a cue's parts in parallel. The orchestral cue takes 15
  s on four workers against 35 s on one. The cue sets' cues take 1 to 7 s each on four worker threads.
- **On a phone-class CPU:** emulated with Chromium's 4x slowdown, a 35-second chiptune cue renders in 26 s on one
  thread.

So call `prepare()` while a level loads. Music that is not ready streams within about a second, at an estimated
loudness.
