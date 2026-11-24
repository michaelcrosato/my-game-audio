# Changelog

All notable changes to my-game-audio. Versions follow [semantic versioning](https://semver.org): a change that
alters the rendered samples of existing songs bumps the version, says so here, and rewrites `test/golden.json`
(`npm run golden -- --write`).

## 0.19.0 (2026-11-24)

The easy path for sound effects and voices, from what the newest games made for themselves. The songs and the sounds
already here render exactly as before; the new sounds have new golden hashes.

### Added

- **Sports sounds** (a twelfth category, `sports`): `whistle`, `crowd_cheer`, `applause`, `ball_kick`, `bat_hit`,
  `racket_hit`, `glove_catch`, `post_hit`, `buzzer`, `goal_horn`, and the loop `amb_crowd`. The newest games in 52in1
  made these for themselves most often: a crowd in 7 games, a whistle in 6. 232 sounds now.
- **`voiceFor(name, base)`**: a named character's own voice, near the character it starts from and the same every
  time, for a cast (games made 27 profiles by hand).

### Changed

- **A sound name the library does not have** throws an error naming what a game may have meant (`no sound
  "confirm": did you mean ui_confirm?`), before any audio starts; it listed all the names. The names games gave
  their own sounds (`select`, `confirm`, `cancel`, `boom`, `oneup`) lead to the library's.
- **A voice name `speak` does not know** says to use `voiceFor` for a character of one's own.

### Measured

The CLAP check, each new sound's description ranked among the library's 232: `buzzer` 6, `applause` 8, `glove_catch`
10, `goal_horn` 14, `post_hit` 14, `whistle` 15, `bat_hit` 15, `racket_hit` 20, `amb_crowd` 20, `crowd_cheer` 46,
`ball_kick` 49. A net swish ranked 140 at best after four designs and was left out.

## 0.18.0 (2026-11-24)

Better defaults for the music games write by hand. The newest games in 52in1 write their songs in the score format
with raw synth specs and no room; these changes give them the calibrated presets and the rooms the ABC route already
gets, by name. The songs and sounds already here render exactly as before: no golden hash changes.

### Added

- **Instruments by preset name.** A song's `instruments` may name a preset in place of a spec (`horn: 'trumpet'`,
  `lead: 'synth_lead'`), or change some of a preset's settings (`{ preset: 'electric_bass', gain: 0.9 }`). The band
  kit and the chip's noise channel have names too: `'drum_kit'`, `'chip_noise'`.
- **`room`** (`'band'`, `'synth'`, `'chip'`, `'hall'`): the reverb, sends and master the importers give a song of
  those instruments, wherever the song sets none of its own.
- **`songOf(song)`** (`engine/orchestra.mjs`, not exported from the engine): the song as the renderers read it, with
  presets and room filled in; every render entry point, the critic and the MIDI export call it.

### Changed

- **Marks written before a note's length** (`D4!:3`, `A2^:2`) mean what they mean after it (`D4:3!`). They used to be
  unreadable: the note was left out and the bar padded with rest, which made one game's cues click.
- **A `drums` spec with no `kit`** plays the band kit; it stopped the render with "Cannot read properties of
  undefined".
- The rooms (`ROOMS`) and the kits (`GM_KIT`, `CHIP_KIT`) moved to `engine/orchestra.mjs`; `musicxml.mjs` and
  `midi.mjs` still export them.

### Measured

The 15 newest games in 52in1 that hand their songs over (0.17.0 engine): 55 of their 57 cues pass the ears; with
this version 57. Audiobox enjoyment of each game's first cue, median: 5.35 as written, 6.01 with the same notes on
presets, 6.13 on presets in a room (better in 10 of 15; the lowest went from 2.56 to 6.09).

## 0.17.0 (2026-11-24)

A library of common sound effects: 221 sounds in eleven categories, up from 58 in seven, each with a description of
what it is, and a check that each one sounds like its description. The effect models gain a tenth layer type and
five settings. The songs and the 58 earlier sounds render exactly as before: their golden hashes did not change.

### Added

- **163 sounds** (`engine/sounds.mjs`):
  - interface: 17 more (cursor, toggles, slider, tabs, countdown and go, warning, text blip, purchase, achievement);
  - movement: 16 more (five new footstep surfaces and dirt, a heavy landing, slide, climb, swim, dive, wings, a
    spring, a fall, a roll, cloth);
  - combat: 25 more (kick, club, slash, parry, critical hit, whip, pistol, shotgun, rifle, machine gun, reload, an
    empty click, a shell casing, a ricochet, a rocket, a blaster, a heartbeat);
  - magic: 13 more (lightning, poison, buff and debuff, curse, shield, summon, sparkles, a blessing, a fizzle);
  - pickups and doors: 10 each (coins, potion, drink, eat, a sword; button, switch, pressure plate, a sci-fi door,
    knocking, a lock, a trapdoor, spikes, a slam);
  - four new categories: the world (glass, wood and clay breaking, falling rocks, a chain, thunder, a church bell, a
    clock, a page, an earthquake: 21), creatures (a growl, a roar, a hiss, a slime, birds, an owl, a frog, a bee, a
    ghost, a wolf, a zombie: 14), machines and vehicles (computer, scanner, alarm, siren, power on and off, servo,
    horn, tires, a jet, warp, glitch, static, an elevator: 17) and jingles (level up, victory, game over,
    checkpoint, quest complete, a secret, hurry, high score, a lost life: 9);
  - ambient loops: 11 more (forest, night with crickets, ocean, storm, space, dungeon, underwater, swamp, lava, an
    electric hum, a waterfall).
- **`desc`** on every sound, old and new: what it is in a few words, for people and for captions (a player who
  cannot hear the sound can read it). **`SOUND_CATEGORIES`** lists the eleven categories.
- **`scatter`**, a tenth layer type: many small strikes of one material, spread over a span (glass, debris, coins,
  a chain) or bouncing, each gap and strike smaller than the last (a shell casing, a ball).
- **Settings for any layer:** `trem` (an amplitude wobble, or a gate with a duty), `vowel` (a formant filter that
  keeps the layer's level), `rep` (the layer played again, each time quieter if asked) and `seq` (the layer played
  as notes). **`room`** gives a one-shot a reverb tail (the FDN reverb of `fx.mjs`).
- **Footstep surfaces:** sand, mud, leaves, tile and carpet.
- **`npm run sfx`** (`tools/sfx.mjs`): every sound's category, length, loudness and description; `render` writes WAV
  files to `out/sfx/`; `match` asks a CLAP model (`tools/sfx_match.py`, `laion/larger_clap_general` at a fixed
  revision) how well each sound matches its description, ranked among the whole library's; `match --try FILE` does
  the same for sounds not yet in the library.

### Changed

- **In an ambient loop, a layer with an `at` is an event** that plays once at that time (a bird's call, a far
  rumble); a layer without one runs the whole loop, as before. No earlier sound had a tone or noise layer with an
  `at` in a loop, so none changes.
- **The bundle's size budget** is 110 KB gzipped (it was 100): `dist/my-game-audio.js` is 104.2 KB, from 93.7 at
  0.16.0; the new sounds and models are 7.7 KB of that, their descriptions 2.8 KB.
- `test/guide.test.mjs` checks that the guide lists every sound once (it checked a few names and the count).

### Measured

The library at 0.17.0, seed 1, by the CLAP check: 43 of the 221 sounds rank their own description first among the
221, 113 in the top five; median rank 5. Ambient loops rank best (median 2) and interface sounds worst (13): the
model knows little about menus. Eighteen new sounds were redesigned after the model heard them as something else (the
reload, the bell, the kick, a gulp, the zombie's groan); the 163 new ones now rank a median 5 (88 in the top five), the
58 earlier ones a median 7. Render times in Node: one-shots a median 16 ms, at most 182 ms; loops up to 268 ms.

## 0.16.0 (2026-11-23)

A library of famous public-domain music, fed to the engine as the sheet music it was written in: symphonies, piano
pieces, arias, marches, folk songs and carols, each imported, rendered and checked ahead of time, with a page to
listen to them all. The MusicXML importer now takes D.C., D.S., To Coda and Fine, and can play a transcription at its
own playback tempo. The songs render as before: no golden hash changes.

### Added

- **The library** (`library/`, `npm run library`). Each piece is a score file, unchanged from its source, with its
  source and licence in `library/library.json` (CLAUDE.md, rule 4):
  - OpenScore Orchestra full scores (CC0, the Hauptstimme corpus at commit `8f677853`);
  - PDMX scores under CC0 with no licence conflict, of works checked to be in the public domain by composer and
    date (PDMX's own check misses arrangements of copyrighted songs); each records its MuseScore page and
    transcriber;
  - the Mutopia Project's public-domain engravings, from their MIDI files.

  `npm run library -- check` imports and arranges each piece; `render` renders it start to end, checks it with the
  ears and keeps its numbers (no audio is committed); `score` adds Audiobox scores in one batch; `page` writes a page
  to listen to every rendered piece (`--audio m4a` encodes small files with ffmpeg). `test/library.test.mjs` checks
  each piece's record, file hash and licence, that every piece imports and arranges, and that the README's table is
  current.
- **`importMusicXML(..., { soundTempo: true })`**: play a score at its own playback tempo, the `<sound tempo>` a
  notation program writes beside each mark, in place of its printed marks and words. For transcriptions tuned by
  ear: an "Adagio" over an alla breve Ave verum read a half-note beat and played at twice the speed, and words the
  table does not know ("Tempo di valse", "Larghissimo") fell back to 120. A score with no tempo mark at its start
  plays at MusicXML's default (a quarter at 120) until its first mark, not at the first mark it finds.
- **`importMusicXML(..., { instruments: { 'part name': 'preset' } })`**: a part's preset chosen by its name, for a
  part named after a character (Aida's high priest Ramfis played on a tuba) or in a language the preset names do
  not cover; `'percussion:bd'` chooses a percussion sound.
- **`measureSong`** (`tools/takes.mjs`): the measuring half of `measureTake`, for a song module or an import.

### Changed

- **MusicXML jumps.** A default-mode import plays D.C. (da capo), D.S. (dal segno), To Coda and Fine as a performance
  does: from a score's `<sound>` jump marks, or else from the words "D.C.", "D.S." and "Fine". After the jump,
  repeats are not taken again and only the last ending plays. Beethoven's Ninth, II, now plays its scherzo again
  and the coda (12:40, was 9:22); a minuet returns after its trio. Compat mode keeps music21's order.

### Measured

The library at 0.16.0: 100 pieces, 494 minutes of music, rendered whole. 99 pass the ears' checks; Aida's Triumphal
March fails one, a click flagged at 7:46 where the whole orchestra enters after a near-silent bar (a jump of 0.052
against the detector's 0.05: not a fault in the render). Audiobox on each first minute: enjoyment median 7.08 (4.53
to 7.79), quality median 7.85; piano and organ 7.25, voices 7.07, orchestra 7.00, folk and carols 6.99, chamber 6.63.

### Fixed

- **Choir staves in transcriptions.** A choral score whose parts carry no voice sound ID (most MuseScore exports in
  PDMX) played its "Alto" on violas (the French name for the viola) and its "Bass" on the soprano choir (the MIDI
  program for Choir Aahs). A staff now counts as a voice when it maps to a choir or has words of its own, and then
  sings the voice it is named for: the Mozart Requiem's Dies irae and Lacrimosa, Handel's Hallelujah, Joy to the
  World. A staff without words keeps its instrument (the "Bassi." under Ombra mai fu are cellos and basses).

## 0.15.0 (2026-11-18)

Takes: every version of a piece an agent writes is kept, with a limit on how many there are. A trial in four styles
made the first takes and found what got in the way, which this version fixes. Renders differ in three places:

- grace notes now sound on every instrument, not only the piano (`ode` and `schubert5`, from 185 s and 61 s; their
  golden excerpts and first minutes have none);
- the solo string presets drift a little in pitch (`rollcall`);
- `lantern_road`'s dungeon flute plays the pp written on its held note (title, town and battle render as before).

No golden hash changes: each covers a song's first two sections, and none of these passages is in them.

ABC scores read differently where they use dynamics within a bar, slurs, measured tremolo, `w:` words or chord
symbols within a bar (below).

### Added

- **Takes** (`npm run take -- piece.abc`, `npm run takes`, `takes/`). A take is checked as `npm run ears` checks it,
  scored by Audiobox Aesthetics where that is installed (the first minute of each cue), and kept: the score in
  `takes/<piece>/`, its numbers in `takes.json`, its audio in `out/takes/` (never committed).
  - **The limit:** five takes a piece. A revision counts as a gain when it is clean (no import warnings, no critic
    notes, PASS) and either it is the first clean take or it adds 0.1 or more to the best take's enjoyment; two
    revisions in a row without a gain stop the piece, and the tool refuses a take after a stop.
  - **The best take** is the first, replaced by each later one that gains on it.
  - `npm run takes -- listen NAME [--blind]` renders every take to compare (in a random order, lettered, with
    `--blind`); `heard NAME BETTER WORSE` records which sounded better and whether the scores agree; `rescore`
    measures the takes again on a new engine.
- **A trial**, kept in `takes/`. Four fresh agents composed from `docs/AI_GUIDE.md` alone, in the styles that score
  lowest, within the limit. Enjoyment / quality, first take to best:
  - a choir hymn (`hymn`): 6.62 / 7.05 to 6.72 / 6.78 (take 3);
  - a solo string quartet (`quartet`): 5.69 / 7.50 to 6.08 / 7.65 (take 2 of 4);
  - a chiptune overworld cue (`chip-overworld`): 5.96 / 7.99, stopped after 3 takes;
  - a synthwave chase cue (`synth-chase`): 6.45 / 8.09, stopped after 3 takes.
- **The ears give each part of a piece its own loudness** (`sections: A 0:00 -22.8, B 0:08 -13.4 LUFS`), and
  `npm run ears -- out/stems/<name>` prints who carries which band and each part's loudness by section, with no
  Python (`tools/render.mjs --stems` now saves the section times).
- **The score format:** a dynamics bar can hold several markings at their steps, written like notes
  (`'| mf:12 <:4 | f |'`); a chord symbol can take its steps (`'| G:4 D7:4 G:8 |'`); a drum line can have grace
  notes (`{s}s` a flam, `{s s}s` a drag).
- **ABC:**
  - dynamics and hairpins where they are written within the bar; a hairpin closed with no dynamic arrives one level
    above or below the one it began at;
  - glissandi (`!-(!` before the note one leaves, `!-)!` before the one it reaches, or the wavy `!~(!` `!~)!`);
  - harmonics (`!harmonic!`: natural on a note, artificial on a two-note chord);
  - drums: `!ghost!`, flams (`{D,,}D,,`) and drags; a warning when a drum note takes an accidental from earlier in
    its bar (`F,,` after `^F,,` is the hi-hat, not the low tom);
  - after a voice: `%%double` (double-tracked), `%%duty 0` to `3` (a chip pulse's duty cycle, at the preset's
    level), `%%duck` (dips under the kick) and `%%delay 3/16 -9` (a send to a delay of that note value).
- The strings option `drift` (cents): a player's pitch wanders slowly.
- `tools/aesthetics.py`: `--seconds`, `--json`, and a local checkpoint (`MGA_AUDIOBOX_CKPT`) where Hugging Face is
  not reachable.

### Changed

- **Grace notes sound on every instrument.** Every importer kept them and the guide taught them, but only the piano
  played them. Each instrument plays them as short notes just before their note (55 ms each, in whole samples),
  joined to each other; a drum kit as flams and drags (softer hits 30 ms apart).
- **The solo string presets drift by +/-4 cents.** Three changes were tried, each scored on the guide's piece for
  four solo strings, the quartet trial's four takes and `rollcall` (first minute, enjoyment / quality):
  - kept: the drift. The guide's piece went from 5.58 / 7.68 to 5.73 / 7.71; the quartet takes from 5.75, 6.06,
    5.95, 5.87 to 5.74, 6.11, 6.00, 5.92, quality up on all four; `rollcall` stayed at 6.34 / 7.89.
  - not kept: with it, a quicker bow start (0.07 s): every piece 0.01 to 0.06 lower than the drift alone.
  - not kept: a drift of 7 cents: the guide's piece 5.85, but the quartet takes 0.04 to 0.11 under 4 cents.
- **ABC slurs join every note under them**, as a player phrases them; before, only the last (music21's reading,
  which MusicXML imports keep). **A measured tremolo** (`!/!`, `!//!`) on strings, winds or brass is one note with
  the tremolo technique, its strokes in time, not repeated notes.
- **ABC words are sung by the music line above them**, aligned as ABC 2.1 aligns them (`-`, `_` holds, `*` skips,
  `~`, `|`); left-over syllables are reported. Before, a `w:` line was sung by the voice's next line: a line late.
  A `w:` line after a bare `V:` line is sung by the next music line, as before.
- **ABC chord symbols keep their place in the bar**, so the critic checks each note against the chord over it.
- **The import report names a drum voice's kit** (band kit, chip noise channel, orchestral percussion), once a
  voice.
- `docs/AI_GUIDE.md`: the take limit; a Words section (alignment, how the voices read letters, a breath's length,
  a choir's low mids); drum chords and two drum voices; the chip's ensemble score in context; tempo heard at two
  thirds; an accompaniment two dynamics under the melody; the dull warning on solo strings.

### Fixed

- The critic checked a preset's range only when something had loaded the presets before it: `ode` had 11 critic
  notes when `engine/score.mjs` was imported alone, 12 after a render.
- A note's own grace notes keep a repeated pitch (`{gag}a` lost its second g).

## 0.14.0 (2026-11-17)

The sound changes the agent trial found, on the owner's word. Each was measured before and after, and kept only
where no committed song got worse. `brandenburg3` renders differently (its golden hash is rewritten); every other
committed song renders as before. Scores using the presets below sound different.

### Changed

- **The solo strings' vibrato is 60% as deep** (violin 0.24 to 0.144 semitones; viola, cello and double bass alike).
  The solo quartet scores 5.64 / 7.67 on Audiobox, up from 4.96 / 7.55.
- **The band kit's quiet pieces are raised to where a mix puts them.** Four quarter hits at mf, in LUFS:
  - closed hi-hat -38 to -30;
  - open hi-hat -33 to -28;
  - cross-stick -33 to -27;
  - ride -28 to -25;
  - tambourine -35 to -29.

  Kick and snare stay at -20.
- **Electric guitars keep their level up the neck.** The new `keyTrack` option of the pluck model gives dB per
  octave above middle C:
  - distortion guitar 4: from C3 to C5 it now holds -21.6 to -21.2 LUFS, where it fell from -20.2 to -25.6;
  - electric guitar 3;
  - acoustic guitar 2.

  The trial's band tune scores 6.99 / 7.86, up from 6.89 / 7.79.
- **The glockenspiel is 4 dB louder** (calibration target -25 to -21 LUFS).
- **The harpsichord plays as a continuo**, quieter (target -24 to -28 LUFS) and darker (a high shelf of -8 dB at
  5.5 kHz). This applies to the preset and to `brandenburg3`'s harpsichord.
  - Against the recorded performance, the first minute was 14.3 dB too bright above 5 kHz and is now 6.6.
  - The spectrum's RMS difference from 80 Hz to 8 kHz went from 4.8 to 3.7 dB.
  - Audiobox: enjoyment 7.31 to 7.40, quality 7.85 to 7.85.
  - Of four settings tried, this is the one that is better on every measure. A shelf of -12 dB at 4.5 kHz was closer
    to the recording (4.4 dB) but scored quality 7.80.
- Gains recalibrated for all of the presets above (`tools/orchestra_calibrate.mjs`).

### Not changed

- Dynamics for the harp were tried three ways and not kept. Each lowered `lantern_road`, whose harp accompaniment
  is marked soft (town cue 6.61 / 8.01 before):
  - full range, recalibrated: town 6.52 / 7.92;
  - full range at its old gain: town 6.44;
  - half the range: town 6.54 to 6.57.

  The title fell from 7.20 to 7.17 or 7.18 in every case.

## 0.13.0 (2026-11-17)

Fixes from a trial: three fresh agents each composed from `docs/AI_GUIDE.md` alone, a piano waltz, an orchestral
theme and a band tune, and reported what got in their way. Every committed song renders as before (`npm run golden`:
all the same). Scores on band, synth or chip instruments with dynamics marked sound different, as the marks now
apply.

### Fixed

- **Dynamics reach the band, synth and chip instruments.**
  - The guitars, the electric bass, the electric piano, the synths, the chip channels and the General MIDI drum kits
    ignored every dynamic. The trial's band tune rendered the same at pp and at ff.
  - These presets (`dyn: true`) now take the level at each note's start, on the orchestra's scale: pp to ff spans
    13 to 17 dB.
  - Their gains are recalibrated, so they sound as before at mf, and music with no marks is unchanged.
  - Instruments written as raw specs (the demo songs' own) are unchanged. The harp, which has the same gap, waits
    with the other changes to the sound.
- **The critic checks an ABC melody against its chord symbols.**
  - The voice under the chord symbols is the melody (`role`). Before, a score whose chords were all wrong passed
    with no notes.
  - Songbook lanes are shared whatever their role.
- **An ABC hairpin ends on the note its closing mark is written before**, as every ABC mark belongs to the note after
  it. One closed before a bar line was dropped.
- **A chord on an ABC drum staff is hits at once.** `[C,,^F,,]` kept only the kick. Each extra hit goes to a lane of
  its own, and a layer takes all of a voice's lanes.
- **A single ABC tune's Intro part (or `%%intro`) plays once and the rest loops**, as in a songbook. Before, the
  whole form looped, Intro included.
- **The README's stems command** names the right order: `python3 tools/ears.py --stems out/stems/<song>`.

### Added

- ABC import warnings where something was dropped in silence:
  - a mark the reader does not know, with the right spelling for rit., cresc., dim. and the like;
  - a hairpin over one note;
  - a chord symbol it cannot read;
  - a chord symbol over a voice other than the first.
- ABC marks:
  - `!arpeggio!` (a rolled chord);
  - `!breath!` and `!caesura!` (a pause after the note before);
  - `!invertedfermata!`;
  - tenuto, bowings, fingerings and navigation marks are accepted without a warning.
- ABC orchestral percussion. In a score with orchestral instruments, a voice named Percussion plays the orchestra's
  kit from General MIDI notes: bass drum, snare, cymbals, suspended cymbal, tam-tam, triangle, tambourine. One named
  for an instrument ("Cymbals") plays only it. A voice named Drums is the band kit anywhere.
- ABC mix directives after a voice: `%%gain +3` (dB) and `%%pan -0.5`, or abc2midi's `%%MIDI control 7` (volume)
  and `%%MIDI control 10` (pan).
- `npm run ears -- piece.abc --once`: a piece that ends, rendered and measured start to end.
- `tools/render.mjs`:
  - prints a usage message;
  - prints each part's statistics under "parts" and the critic's notes apart, or "critic notes: none".
- `npm run ears` says "critic notes: none" too.
- `test/dynamics.test.mjs`.

### Changed

- `docs/AI_GUIDE.md`:
  - **How the importer reads a score:**
    - marks go before their note;
    - dynamics are read once a bar, and a hairpin should end on a dynamic;
    - the tempo words, and the inline `[Q:]` field;
    - how slurs are read;
    - the pedal in either piano staff;
    - grace notes;
    - concert pitch;
    - palm mute;
    - the chord symbols read.
  - **Drums, percussion and the mix:** drum chords, orchestral percussion, the mix directives.
  - **Checking:**
    - `importABC(text).text`;
    - why the ears measure longer than a piece, and `--once`;
    - stems for who carries what;
    - the key heard a fifth up under guitars;
    - what brightens an orchestra.
  - **Its own piece** ends each hairpin on a dynamic.
  - **The ensemble table** is measured again.
- The preset table's ranges are sounding pitch (the guide called them written pitch).

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
