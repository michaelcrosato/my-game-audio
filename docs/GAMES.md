# Using my-game-audio in a game

This page is for an agent building a game, and for the person writing its brief. A game's music, sound effects and
voices are all code here: the player's browser renders them from text, so the game ships no audio files. Read this
page first; [AI_GUIDE.md](AI_GUIDE.md) teaches the music in depth, and [API.md](API.md) has every signature.

## 1. Include the engine

The whole engine is one file, `dist/my-game-audio.js` (about 107 KB gzipped, no dependencies). It is a classic script
that sets `window.MyGameAudio` and carries its own render worker. `dist/my-game-audio.mjs` is the same engine as an ES
module (`import MyGameAudio from './my-game-audio.mjs'`).

Pin one version and use it for everything: the file you ship, the docs you read and the check below. Each version
is tagged on `main` (`v0.23.0`, say), and the newest tag is the newest version:

```sh
git ls-remote --tags --refs --sort=-version:refname https://github.com/michaelcrosato/my-game-audio 'v*' | head -1
curl -O https://raw.githubusercontent.com/michaelcrosato/my-game-audio/TAG/dist/my-game-audio.js   # TAG: the tag above
```

A commit pins as well as a tag does (`git ls-remote https://github.com/michaelcrosato/my-game-audio main`, the head
of `main`), for a change newer than the last tag.

The file's first line names its version and its licence (MIT). A single-file game pastes the file into a `<script>`
and keeps that line; a game with folders ships it beside the page and loads it with
`<script src="my-game-audio.js"></script>`. Either way the game makes no request for audio.

## 2. Start the player

```js
const player = MyGameAudio.createPlayer();           // music starts at 10%; effects and voices at full
player.volume('music', 0.1);                         // the default, written out: change it here if the game wants
const unlock = () => player.unlock();                // browsers start audio only after a tap or a key
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });

const song = MyGameAudio.importABCBook(MUSIC).song;  // MUSIC: the songbook below, as a string
await player.prepare(song, 'explore');               // render while the level loads
player.music(song, { cue: 'explore' });              // its intro once, then its loop for ever
player.layer('drums', 0.3, 1);                       // turn a layer down over a second
player.sting('found', { at: 'beat' });               // a short tune over the music
// player.cue('battle'): change to another %%cue tune of the songbook on the next bar

player.sfx('coin');                                  // a named sound effect: section 5
player.say('Well met, traveler!', 'villager', { emotion: 'happy' });  // a gibberish voice: section 6
```

The first play of a cue renders for a few seconds (a chiptune about 6 s on one thread, an orchestra about 35 s), so
call `prepare()` while a level loads. Leave the player's defaults on: they are what make music start quickly.

- `workers` (default 2): music renders in workers, off the page's thread, so a game drawing with WebGPU keeps its
  frames; fewer workers only make the music start later.
- `stream` (default on): a cue not rendered yet starts within about a second and plays while it renders.
  `stream: false` waits for the whole render.
- `cache` (default on): rendered music, never a game's saves, kept in an IndexedDB database of the page's own
  (`my-game-audio:` and the page's path) and pruned only of its own old renders, so games that share a site never
  touch each other's. `cache: 'my-game'` names it under the game's prefix. A returning player hears the music at once.
  Where a page cannot use IndexedDB, the player keeps renders in memory on its own.
- `context`: the game's own `AudioContext`, and `buses: { music, sfx, voice }`, its own mixer nodes.

Measured on three games' first cues in headless Chromium: with `workers: 1, cache: false, stream: false`, 1.9 to 4.8 s
from `music()` to sound on every visit; with the defaults, 0.8 to 1.5 s on the first visit and 0.07 to 0.29 s after.

For a settings menu: `player.volume(bus, v)` and `player.mute(bus, on)` for `'master'`, `'music'`, `'sfx'` and
`'voice'`; `player.duck(true)` holds the music down under a pause screen.

## 3. Write the music as sheet music

A game's music is a songbook in ABC notation: one tune per cue, each part a voice named after its instrument. A tune
marked `%%cue` loops (its Intro part plays once first); `%%stinger` makes a short tune that plays over the music;
`%%layer` turns voices into a layer the game can fade. This one is complete:

```abc
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
```

Write a tune for each place in the game (title, explore, battle, victory) and a stinger for each event the music
should mark. [AI_GUIDE.md](AI_GUIDE.md) has the instruments, the drums, dynamics, recipes by mood and genre, and
what makes music sound good here ("Write it as sheet music" and "Recipes").

ABC picks each voice's calibrated instrument from its name and gives the song a room to play in. Name each voice
after its instrument (`V:2 name="Electric Bass"`): a name that matches no instrument plays the piano, and the check
prints a warning that says so. A song written
directly as data (the text score format, "A song in one screen" in the guide) gets the same when it names its
instruments by preset and its room in one word: each preset's tone, range, calibrated level and effects, a part's
`gain` counting from that level (since 0.26.0):

```js
instruments: { lead: 'synth_lead', bass: 'electric_bass', horn: 'trumpet', kit: 'drum_kit' },
room: 'band',                                        // or 'synth', 'chip', 'hall'
```

Raw specs such as `{ type: 'brass' }` with no room sound dry and dull: the same notes on presets, in a room, scored
6.13 against 5.35 for enjoyment on Audiobox (median of 15 games, 0.17.0), and with each preset at its calibrated level
(0.26.0) 6.29 against 6.02 (mean of 25 games' first cues). Leave `master.lufs` at its -16, so every
game's music sits at the same level and `player.volume('music', 0.1)` means the same thing everywhere.

## 4. Check it before it ships

The checks hear the music so you don't have to. They need no install:

```sh
git clone https://github.com/michaelcrosato/my-game-audio && git -C my-game-audio checkout TAG   # the version you pinned
node my-game-audio/tools/ears.mjs music.abc
```

It names the instrument each voice became, lists the bars that do not add up and the critic's notes, then renders
every cue as the game plays it and prints PASS or FAIL with the reasons: loudness, peaks, clicks, balance, and the
key and tempo it heard. The songbook above passes in about 4 seconds. Fix what it reports and run it again until
every cue passes. A warning is advice; a FAIL is a fault the player will hear.

## 5. Sound effects: use the library's first

The library has 232 named sounds in twelve categories, each tested and loudness-matched, each with seeded takes so
repeats vary. Use one before writing your own. [AI_GUIDE.md](AI_GUIDE.md) lists them all ("Sound effects"), and
`MyGameAudio.SOUNDS[name].desc` says what each one is, in words a game can show as a caption.

| You might call it | Library sounds |
| --- | --- |
| select, cursor | `ui_move`, `ui_hover` |
| confirm, accept | `ui_confirm`, `ui_success` |
| cancel, back | `ui_back` |
| error, denied | `ui_error` |
| pause | `ui_pause` |
| click, button | `ui_click`, `button` |
| dialog text blip | `ui_text` |
| countdown, go | `ui_countdown`, `ui_go` |
| warning, low health | `ui_warning`, `heartbeat`, `alarm` |
| jump | `jump`, `double_jump` |
| land, stomp | `land`, `land_heavy` |
| footsteps | `step_grass`, `step_stone`, `step_wood`, `step_sand`, `step_snow` and eight more surfaces |
| coin, money | `coin`, `coins`, `ui_purchase` |
| power-up | `power_up`, `upgrade`, `star` |
| 1-up, extra life | `extra_life` |
| hit, bump | `hit`, `punch`, `thud` |
| hurt | `hurt` |
| death | `player_die`, `enemy_die` |
| boom, explosion | `explosion`, `explosion_small`, `explosion_distant` |
| shoot | `laser`, `blaster`, `pistol` |
| swing, whoosh | `sword_swing`, `swing_heavy`, `dash`, `throw` |
| secret found | `discover` |
| win, level clear | `victory`, `complete`, `level_up` |
| lose | `game_over`, `lose_life` |
| checkpoint, save | `checkpoint`, `ui_save` |
| door | `door_open`, `door_close`, `door_slam`, `door_locked` |
| whistle (referee) | `whistle` |
| crowd, cheer, applause | `crowd_cheer`, `applause`, `amb_crowd` |
| ball hits | `ball_kick`, `bat_hit`, `racket_hit`, `glove_catch`, `post_hit`, `ball_bounce` |
| buzzer, goal horn | `buzzer`, `goal_horn` |
| ambience | `amb_rain`, `amb_wind`, `amb_forest`, `amb_night`, `amb_cave` and thirteen more loops |

```js
player.preload(['jump', 'coin', 'hurt']);                   // render ahead in a worker, while a level loads
player.sfx('step_grass', { pan: -0.3, volume: 0.8 });
const rain = player.sfx('amb_rain', { loop: true, fade: 2 }); // later: rain.stop(2)
const zap = { ...MyGameAudio.SOUNDS.laser, level: -18 };     // a sound of your own: copy the nearest, change it
player.define('zap', zap);
player.sfx('zap');
```

Sounds render in a worker. Played without `preload`, a sound starts when its first take is ready, 20 to 460 ms
later (the long loops take longest), and its handle works meanwhile; preloaded, it plays at once.

A sound of your own is a few layers of small models (API.md, "Sound effects"); start from the nearest library sound
rather than from nothing.

## 6. Voices

`player.say(text, character, { emotion })` speaks the line in Animalese or Simlish-style gibberish: a blip per
syllable, on the character's pitch and timbre. The music ducks while a character speaks, and
`onSyllable(s, i)` fires as each syllable sounds, to reveal the text in time.

- Characters: `villager`, `hero`, `heroine`, `child`, `elder`, `merchant`, `giant`, `fairy`, `critter`, `robot`,
  `monster`, `ghost`.
- Emotions: `neutral`, `happy`, `sad`, `angry`, `scared`, `surprised`. A question rises at its end.
- A cast of your own: `MyGameAudio.voiceFor('Lena', 'heroine')` gives a named character a voice of their own, near
  the character it starts from and the same every time: `player.say(line, MyGameAudio.voiceFor('Lena', 'heroine'))`.
  A profile works too: `{ ...MyGameAudio.VOICES.heroine, pitch: 260 }`.

## 7. A brief to give an agent

Paste this into a game's brief, or adapt it:

```text
All music, sound effects and voices are written in code with my-game-audio
(https://github.com/michaelcrosato/my-game-audio). Follow its docs/GAMES.md:
- pin one version tag (or commit) and paste its dist/my-game-audio.js into the game;
- write the music as an ABC songbook, one tune per cue, and run
  `node my-game-audio/tools/ears.mjs music.abc` until every cue passes;
- use the library's named sound effects first, and make your own only for what it lacks;
- voices are Animalese/Simlish-style gibberish: player.say(text, character);
- music plays at 10% volume, the player's default: player.volume('music', 0.1);
- keep createPlayer()'s defaults (render workers, streaming, the cache): they start the music quickly, and the
  cache is the page's own, so it is safe on a site shared with other games.
```
