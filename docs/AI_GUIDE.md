# Writing game audio with my-game-audio: a guide for agents

This library gives a game its music, sound effects and voices as code. There are no audio files: a song is a
JavaScript object whose parts are text scores, a sound effect is a small spec, and a voice line is text spoken in a
character's gibberish. Everything renders in the browser (or Node) when the game needs it.

This guide covers how to write each of them, how to check them without ears, and how a game plays them. Music can be
written two ways: as sheet music in ABC notation (one staff per instrument, read by `importABCBook`), or directly in
the score format the importers write (one text line per part). Start with sheet music. The exact
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

## Write it as sheet music (ABC)

Write music the way composers have always written it: one staff per instrument, notes and rests between bar lines,
dynamics and articulations on the notes, chord symbols above. ABC notation (abcnotation.com) is that score as plain
text, and it is the quickest way to get music that sounds as written. `importABCBook` reads a file of ABC tunes and
makes one song of them, each tune a cue of the game. The layout is done for you: lanes, sections, tempo, dynamics,
instruments, mix and room. `songs/lantern_road.mjs` is a five-cue orchestral score written this way.

```js
// file: songs/meadow.mjs
import { importABCBook } from '../engine/abc.mjs';

export const ABC = String.raw`
X:1
T:Meadow
%%cue explore
%%layer drums Drums
M:4/4
L:1/8
Q:1/4=112
K:G
V:1 name="Electric Piano"
V:2 name="Electric Bass"
V:3 name="Drums"
P:Intro
[V:1] z8 | z6 !mf! D2 |
[V:2] !mf! G,,4 z4 | D,4 z4 |
[V:3] !mf! C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 ^F,,2 D,,2 D,,D,, |
P:A
[V:1] "G"G2 B2 d2 B2 | "C"c2 e2 g4 | "Em"B2 G2 E2 G2 | "D"A6 D2 |
[V:2] G,,2 z G,, D,2 z2 | C,2 z C, G,,2 z2 | E,,2 z E,, B,,2 z2 | D,2 z D, A,,2 z2 |
[V:3] C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 ^F,,2 D,,2 D,,D,, |

X:2
T:Found It
%%stinger found
M:4/4
L:1/8
Q:1/4=112
K:G
V:1 name="Electric Piano"
V:2 name="Electric Bass"
[V:1] !f! G2 B2 d2 g2 | !fermata![Bdg]8 |]
[V:2] !f! G,,2 D,2 G,2 D,2 | !fermata!G,,8 |]
`;

export default importABCBook(ABC, { title: 'Meadow' }).song;
```

The game plays `player.music(song, { cue: 'explore' })`: the Intro once, then A for ever, with the drums on a layer
it can turn down. `player.sting('found')` plays the stinger over it. A chord symbol in the first voice gives the
critic its chords and the band a strummed guitar; the bass part is written, so no bass is added.

**What to write.**

- **The header.** `X:` starts a tune. Then `T:` title, `M:4/4` meter, `L:1/8` default note length, `Q:1/4=112`
  tempo, and `K:G` key (`K:Em`, `K:Dmix`, `K:Bb`). `K:` ends the header. A blank line ends the tune.
- **Voices.** Declare `V:1 name="Flute"` in the header. Then start each line of that voice's music with `[V:1]`.
  Write the voices of a passage one under another, bar for bar, as in a printed score.
- **Instruments come from the voice's name.**
  - Orchestra: Violins, Violas, Cellos, Basses, Flute, Piccolo, Oboe, Clarinet, Bassoon, Horn, Trumpet, Trombone,
    Tuba, Timpani, Glockenspiel, Harp, Piano, Celesta, Organ, Choir (Soprano, Alto...), and the solo strings.
  - Band: Acoustic Guitar, Electric Guitar, Distortion Guitar (or Lead or Rhythm Guitar), Electric Bass (or Bass
    Guitar), Electric Piano (or Rhodes).
  - Synth: Synth Lead, Synth Pluck (or Arp), Synth Pad (or Pad), Synth Bass.
  - Chip: Pulse (or Square), Triangle Wave.
  - Drums: a voice named Drums or Drum Kit.
  - `%%MIDI program 33` after a `V:` line chooses by General MIDI program instead (0 to 127).
- **Notes.** `C D E F G A B c d e f g a b`; `C` is middle C, `c` the octave above. `'` raises a note an octave,
  `,` lowers it (`C,` is C3). A number after a note multiplies `L:` (`c2`, `c/2`, `c3/2`). `^c` is sharp, `_e` flat,
  `=f` natural, and an accidental lasts to the bar line. `z` is a rest, `[CEG]` a chord, `c2-c` a tie, `(3abc` a
  triplet, `c>d` dotted.
- **Expression.**
  - Dynamics: `!pp!` to `!ff!`; hairpins: `!<(!` ... `!<)!`.
  - Articulations: `.c` staccato, `!>!c` accent, `!marcato!c`, `Hc` or `!fermata!c`, `!trill!c`, `!mordent!c`.
  - Tremolo: `!//!c4` in sixteenths, `!trem!c4` unmeasured.
  - Techniques, as text above the staff: `"^pizz."`, `"^arco"`, `"^sul pont."`, `"^sul tasto"`, `"^col legno"`,
    `"^con sord."`, `"^flz."`, and `"^ord."` to go back.
- **Chords.** Write `"Am"` before a note in the first voice. The critic checks the melody against the chords.
  The chords also become an accompaniment in the song's style: harp and pizzicato cellos for an orchestra, guitar and
  bass for a band, pad and synth bass for synths, an arpeggio and the triangle for chips. `%%accompany off` keeps them
  for the critic only.
- **Form.** `|:` and `:|` repeat; `[1` and `[2` are first and second endings. `P:Intro` and `P:A` in the body mark
  parts; `P:Intro A2 B` in the header sets the order they play in.
- **Drums.** General MIDI notes in the drum voice:

  | Note | Sound | Note | Sound |
  | --- | --- | --- | --- |
  | `C,,` | kick | `^F,,` | closed hi-hat |
  | `D,,` | snare | `^A,,` | open hi-hat |
  | `^C,,` | rim | `^C,` | crash |
  | `^D,,` | clap | `_E,` | ride |
  | `F,,` `A,,` `C,` | low, middle, high tom | `^F,` | tambourine |

- **Cues.** In each tune, write:
  - `%%cue battle` to name its cue (the default is the title);
  - `%%stinger win` to make it a stinger, played once over the music;
  - `%%intro A` for the parts played once before the rest loops (a part named Intro is one already);
  - `%%layer drums Drums, Timpani` to make a layer of those voices.

**Check it.**

- `importABCBook(ABC).report.warnings` lists each bar that does not add up to its meter, with its voice, part and bar.
  Such a bar is padded with rest, or cut at the bar line, so the rest of the score stays in time. Fix it anyway: it
  costs a beat.
- Then arrange it, read the critic and run the ears (above), as for any song.
- A file of tunes converts to a song module: `node tools/convert.mjs quest.abc songs/quest.mjs`.
- Band, synth and chip tunes get a room and a master voiced for them. One orchestral instrument puts the whole
  songbook in the concert hall.

## A song in one screen (the score format)

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
