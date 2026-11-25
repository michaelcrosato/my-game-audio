# Composing music with my-game-audio: a guide for agents

Write music the way composers always have: as sheet music. One staff per instrument, notes and rests between bar
lines, dynamics, articulations and chord symbols on them. This library plays it on a synthesized orchestra, band,
piano or chip, with no audio files. Its tools tell you what to fix without ears: what each voice became, every bar
that does not add up, notes out of range, and how the music sounds.

Write in ABC notation (below). MusicXML, Humdrum **kern and MIDI files are read the same way, and every import
becomes the text score format ("A song in one screen"), which you can also write directly. Games play the same
music, with sound effects and voices besides: that is the second half of this guide. The exact signatures are in
[API.md](API.md); [HANDOFF.md](HANDOFF.md) has what the library measures today. Building a game? [GAMES.md](GAMES.md)
is the short path: the file to include, the player code, a songbook template, the check, and the sounds.

## The loop: write, check, listen, fix

```sh
npm run ears -- evening.abc                    # the import, the score's mistakes, critic notes, the sound: PASS/FAIL
npm run take -- evening.abc --once             # keep this version as a take: checked, scored, and what to do next
node tools/render.mjs evening.abc              # out/evening.wav: the piece once, start to end
npm run ears -- out/evening.wav                # that file's loudness, peaks, balance, key and tempo
python3 tools/aesthetics.py out/evening.wav    # optional: Audiobox Aesthetics (needs torch, audiobox_aesthetics)
node tools/convert.mjs evening.abc songs/evening.mjs   # keep it as a song module (or .krn, .mid, .mxl in)
npm run check                                  # every song in songs/ parses, arranges, renders finite, streams
```

`npm run ears` on a score file prints, in order: each voice and the instrument it became; the import's warnings (a
bar that did not add up, with its voice, part and bar); the arranger's errors, if any (the only thing that stops the
music playing); the critic's notes; then the music, rendered and measured, PASS or FAIL. It exits 1 if anything
failed. It plays the music as a game would, the intro once and then round its loop twice, so it hears both seams: a
one-minute piece measures about two and a half. For a piece that plays once (a concert piece, a cutscene), add
`--once`: it is rendered start to end and measured as it is, as `node tools/render.mjs` renders it.

1. **Write** the score (below).
2. **Fix every import warning.** A bar that does not add up is padded with rest or cut at the bar line, so the rest
   of the score stays in time, but it costs a beat. A voice that became `piano` was not recognized by its name.
3. **Read the critic.** It lists what the arranger repaired first, then notes out of an instrument's range, melodies
   that clash with the chord symbols on strong beats, parts other than drums that repeat one bar throughout, and
   more. Aim for none.
4. **Run the ears.**
   - **It fails on** a click, a true peak over -1 dBTP, or loudness more than 2 LU from the target (-16 LUFS).
   - **It warns on** balance: low mids over 30% (muddy), bass over 65% (bass-heavy), over 25% above 6 kHz (harsh),
     and stereo or crest problems; each warning says what to do. A title theme should not be muddy. It does not warn
     on a dark sound: strings, piano and brass put little above 6 kHz (the library's pieces under 0.5% score higher
     on Audiobox than the rest, and brightening the games' 16 darkest cues lowered theirs a little). In the games,
     bass-heavy came from a synth bass alone under a sparse tune and from kits of their own, muddy mostly from a
     warm keyboard tune between middle C and B4 (GAMES.md, section 3, gives each fix). The balance
     line reports the air all the same: a bright style wants hats, a shaker or a brighter instrument there; for an
     orchestra the top band comes from high violins, flute or piccolo, cymbals, the triangle, trills and tremolo.
   - **Use the key and tempo it hears** as a sanity check. A piece written in E minor should be heard in E minor; a
     tempo heard at half, double, two thirds or one and a half times the written one is normal (150 written, 99 or
     225 heard; 80 written, 161 heard). Guitars and power chords pull the key heard a fifth up (A major heard as E
     major).
   - **To see who carries what,** render the parts apart, `node tools/render.mjs piece.abc --stems`, then
     `npm run ears -- out/stems/piece` prints each part's loudness, its share of every band, and its loudness in
     each section, so a melody buried under its accompaniment shows (no Python needed).
   - **Each part (`P:`) gets its own loudness** on the line under PASS or FAIL, so you can see that a chorus lifts.
5. **Listen** to `out/<name>.wav` if you can. If you cannot, the Audiobox scores are a rough stand-in: higher is
   better, and "Make it sound good" has measured examples to compare with.
6. **Keep each version as a take, and stop at the limit.** When you have changed the music and want to know whether
   it got better, run `npm run take -- piece.abc` (with `--note "what changed"`; add `--once` on the first take of a
   piece that plays once, and later takes are measured the same way). It checks the score as `npm run ears` does,
   scores the first minute of each cue with Audiobox where that is installed (and the last minute of a piece played
   once, longer than a minute: a weak ending shows there), keeps the score in `takes/<piece>/`, and tells you what to
   do next:
   - **Five takes at most:** a first draft and four revisions.
   - **A revision counts as a gain** when it is clean (no import warnings, no critic notes, PASS) and either it is
     the first clean take or it adds 0.1 or more to the best take's enjoyment.
   - **Two revisions in a row without a gain, and you stop.** The tool refuses a take after a stop, as it does after
     the fifth.
   - **Your answer is the best take, not the last:** the first take, replaced by each later one that gains on it.
     The tool names it. Fix mistakes as often as you need with `npm run ears` between takes; a take is for a change
     you hope sounds better.

   Every take is kept, the weak ones too, so people can listen and learn whether the scores track what they hear.
   [takes/README.md](../takes/README.md) has the rules and the pieces kept so far.

Renders are deterministic: the same score, seed and engine version give the same samples. Change `seed` for another
take of the humanizing and noise.

## Write it as sheet music (ABC)

ABC notation (abcnotation.com) is a printed score as plain text, and it is the quickest way to get music that sounds
as written. The importer does the layout: lanes, sections, tempo, dynamics, instruments, mix and room.

### A piece

```abc
% file: evening.abc
X:1
T:Evening Air
C:for strings
%%accompany off
M:3/4
L:1/8
Q:1/4=76
K:D
V:1 name="Violins I"
V:2 name="Violins II"
V:3 name="Violas"
V:4 name="Cellos"
% bars 1-4: the theme, quiet; the inner voices hold the harmony
[V:1] "D"!p! (A2 d2 f2) | "G"(g4 f2) | "A"(e2 c2 A2) | "D"d6 |
[V:2] !p! F4 A2 | B4 A2 | (G2 E2 C2) | F6 |
[V:3] !p! D4 D2 | D4 D2 | A,4 A,2 | A,6 |
[V:4] !p! D,6 | B,,6 | A,,6 | D,6 |
% bars 5-8: it rises to forte and falls back to a cadence; each hairpin ends on the dynamic it leads to
[V:1] "Bm"!<(! (f2 b2 d'2) | "G"(c'4 b2) | "A"!<)! !f! !>(! (a2 g2 e2) | "D"!>)! !p! f4 !fermata!d2 |]
[V:2] !<(! d4 f2 | g4 g2 | !<)! !f! !>(! (e2 c2 A2) | !>)! !p! A4 !fermata!F2 |]
[V:3] !<(! B,4 B,2 | D4 D2 | !<)! !f! !>(! C4 C2 | !>)! !p! D4 !fermata!A,2 |]
[V:4] !<(! B,,6 | G,,6 | !<)! !f! !>(! A,,6 | !>)! !p! D,4 !fermata!D,2 |]
```

`npm run ears -- evening.abc` finds four string sections, no warnings and no critic notes, and hears D major; it
passes at -16 LUFS. `node tools/render.mjs evening.abc` writes 24 seconds of it. The chord symbols are there for the
critic, which checks the melody against them; `%%accompany off` stops them adding a harp and a bass, because the four
voices already carry the harmony (`test/guide.test.mjs` checks all of this).

**What to write.**

- **The header.** `X:` starts a tune. Then `T:` title, `M:4/4` meter, `L:1/8` default note length, `Q:1/4=112`
  tempo, and `K:G` key (`K:Em`, `K:Dmix`, `K:Bb`). `K:` ends the header. A blank line ends the tune.
- **Voices.** Declare `V:1 name="Flute"` in the header. Then start each line of that voice's music with `[V:1]`.
  Write the voices of a passage one under another, bar for bar, as in a printed score.
- **Instruments come from the voice's name.**
  - Orchestra: Violins, Violas, Cellos, Basses, Flute, Piccolo, Oboe, Clarinet, Bassoon, Horn, Trumpet, Trombone,
    Tuba, Timpani, Glockenspiel, Harp, Piano, Celesta, Organ. "Violins I" and "Violins II" are two lanes of
    violins.
  - One player instead of a section: "Solo Violin", "Solo Cello". The solo strings sound weaker than the sections
    (see "Make it sound good"), so use sections unless the music needs one player.
  - Voices: name them Soprano, Alto, Tenor, Bass (two or more of these are a choir, with words or without); "Solo
    Soprano" is one singer; "Choir" alone sings the part its register suits. Words go in `w:` lines (see Words).
  - Band: Acoustic Guitar, Electric Guitar, Distortion Guitar (or Lead or Rhythm Guitar), Electric Bass (or Bass
    Guitar), Electric Piano (or Rhodes). A voice named only "Bass" is the bass of the music around it: the bass
    guitar in a band, the synth bass among synths, the triangle in a chip tune, the string basses otherwise.
  - Synth: Synth Lead, Synth Pluck (or Arp), Synth Pad (or Pad), Synth Bass.
  - Chip: Pulse (or Square), Triangle Wave. `%%duty 0` after a Pulse voice makes it thin (a 12.5% pulse), `%%duty 2`
    round (50%), so a lead and its harmony differ in colour (`1` and `3` lie between; the level stays the same).
  - Drums: a voice named Drums or Drum Kit.
  - General MIDI's names work too: "Acoustic Bass" and "Upright Bass" (the double basses, plucked), "String
    Ensemble" or "Strings" (violins), "Brass Section" or "Brass" (trumpets), "Accordion", "Music Box", "Pan Flute".
  - `%%MIDI program 33` after a `V:` line chooses by General MIDI program instead (0 to 127).
  - A voice whose name matches none of these plays the piano, and the import says so in a warning: name it after
    its instrument. (In the newest games, "Net", "Gloves" and "Acoustic Bass" played the piano unnoticed.)
- **Notes.** `C D E F G A B c d e f g a b`; `C` is middle C, `c` the octave above. `'` raises a note an octave,
  `,` lowers it (`C,` is C3). A number after a note multiplies `L:` (`c2`, `c/2`, `c3/2`). `^c` is sharp, `_e` flat,
  `=f` natural, and an accidental lasts to the bar line. `z` is a rest, `[CEG]` a chord, `c2-c` a tie, `(3abc` a
  triplet, `c>d` dotted, `{g}a` a grace note (or several: `{gag}a`), played quickly just before its note on any
  instrument. Write every instrument at concert pitch, as it
  sounds: a clarinet's, a horn's or a double bass's notes are not transposed.
- **Marks go before the note they belong to**, as in all ABC: `!f!c`, `!<)!d`, `!ped!C,`. A mark this reader does not
  know is ignored with an import warning that says so, often with the right way to write it.
- **Expression.**
  - Dynamics: `!pp!` to `!ff!`, read where they are written, in each voice: `!p! c d !f! e f` is p, then f on beat
    3. A hairpin, `!<(!` ... `!<)!` (or `!>(!` ... `!>)!`), ramps from the note its opening mark is written before to
    the note its closing mark is written before. End each one on a dynamic: `!mp! !<(! c d e | f2 g2 !<)! !f! a2`.
    One closed with no dynamic arrives one level above (or below) the level it began at, mp to mf. A hairpin over
    one note is not heard, and says so. Every instrument follows the dynamics; the band, synth and chip instruments
    take the level at each note's start, so a single held note on them does not swell.
  - Tempo: words above the staff, changing by whole bars. `"^rit."` (`"^rall."`, `"^poco rit."`) slows each bar by
    a tenth of the tempo, down to 70% of it, until `"^a tempo"`; `"^accel."` speeds each bar up by 7%. An inline
    `[Q:1/4=92]` sets a new tempo from its bar on.
  - Articulations: `.c` staccato (on a guitar, palm-muted), `!>!c` accent, `!marcato!c`, `Hc` or `!fermata!c`,
    `!trill!c` (played from the note above), `!mordent!c`, `!arpeggio![CEG]` a rolled chord, `!breath!` (a breath
    before the note it is written before: the note before it gives up its last eighth, at most), `!caesura!` (a
    breath and a pause).
  - Glissandi: `!-(! C2 !-)! c2` (or the wavy `!~(!` ... `!~)!`) slides from C to c in the time of the first note:
    over the white keys on a harp or a keyboard, chromatically on anything else.
  - Harmonics: `!harmonic!c'` is a natural harmonic, sounding as written (nearly pure, airy); `!harmonic![EA]`, the
    stopped note and the touch a fourth above, is an artificial one, sounding two octaves over the stopped note.
  - Slurs: `(c d e)` joins every note after the first to the one before, as a player phrases it: strings in one bow
    (a step glides over a finger change), winds in one breath (not tongued). Notes outside slurs are each started
    anew. (A MusicXML import reads slurs as music21 does: only a slur's last note is joined.)
  - The piano's sustain pedal: `!ped!` presses it (again, on a held pedal: a change), `!ped-up!` lifts it. Mark it
    as a pianist would, a change with each new harmony; a piano with no marks plays dry. Write the two staves as two
    voices, both named "Piano"; the pedal marks go in either one (the left hand is usual), as there is one pedal.
  - Tremolo: `!//!c4` in sixteenths (`!/!` eighths), `!trem!c4` unmeasured; on timpani or percussion, `!trem!` is a
    roll. On strings, winds and brass a measured tremolo is one note whose bow strokes or tongued repeats keep time;
    on a piano, a guitar or pizzicato strings the note is repeated.
  - Techniques, as text above the staff: `"^pizz."`, `"^arco"`, `"^sul pont."`, `"^sul tasto"`, `"^col legno"`,
    `"^con sord."`, `"^flz."`, and `"^ord."` to go back.
- **Chords.** Write `"Am"` before a note (or a rest) in the first voice: that voice is the melody, and the critic
  checks it against the chords (at least 60% of its notes on the beat should be chord tones). A chord written within
  a bar starts on the note it is written before. It reads C, Cm, C7,
  Cmaj7, Cm7, Cdim, Cdim7, Cm7b5, Caug, Csus2, Csus4, C6, Cm6, C9, Cm9, Cadd9 and C5, with a bass note after a slash
  (`"G7/B"`); any other symbol, or one over another voice, is ignored with a warning. The chords also become an
  accompaniment in the song's style: harp and pizzicato cellos for an orchestra, guitar and bass for a band, pad and
  synth bass for synths, an arpeggio and the triangle for chips. That suits a melody with chords (a lead sheet). When
  your voices already carry the harmony, as in a full score, write `%%accompany off`: the chords are then for the
  critic only.
- **Form.** `|:` and `:|` repeat; `[1` and `[2` are first and second endings. `P:Intro` and `P:A` in the body mark
  parts; `P:Intro A2 B` in the header sets the order they play in. A part named Intro (or those `%%intro A` names)
  plays once, and the rest loops in a game; a piece meant to end is checked with `npm run ears -- piece.abc --once`.
- **Words.** A `w:` line under a voice's music line is sung by that line: one syllable a note, `-` between the
  syllables of a word, `_` holding the syllable before over the next note, `*` leaving a note without a syllable, `~`
  keeping two words on one note (`of~the`), `|` going on to the next bar. A tied note, a rest and a grace note take no
  syllable. A held or skipped note goes on singing the vowel before it, which is how a melisma is written:
  `(g a b)` under `A___-` sings "Ah" over three notes. A `w:` line written after a bare `V:` line, before any music,
  is sung by that voice's next music line. Syllables left over at the end of their line are not sung, and the import
  says so.
  - **Spell the words as they sound.** The voices read letters, not a dictionary. A syllable is sung on its first
    vowel letters (`y`, `ee` and `ie` are i; `ai`, `ei` and `ay` are a; `oo` and `ou` are u), with the consonants
    before its first vowel and after its last; any between its vowels are not sung (`lite` sounds "li"), so split
    words into syllables. `light` is sung on i, `lait` on a, nearer the English. `c` is always hard: write `ses` for
    "cess" and `de-sends` for "descends". `s`, `z`, `f`, `v`, `h`, `sh`, `ch` and `th` hiss (an `s` or `f` just
    before the beat); `t`, `d`, `k`, `g`, `p` and `b` are short bursts; `m`, `n`, `l`, `w` and a `y` before a vowel
    hum into it, and `r` taps.
  - **A choir in close harmony can still read as muddy.** Since 0.22.0 the voices are lighter at 350 Hz and clearer
    at 3 kHz: a four-part hymn carries 27% of its energy in the low mids (250 to 500 Hz; the warning is at 30%), where
    it carried 35% to 41%. Close voicing low in the voices' range piles up there; it eases where the men rest.
- **Drums.** A voice named Drums (or Drum Kit) plays the band's kit; in a score of chip voices, the chip's noise
  channel, from the same notes. Its notes are General MIDI drum notes, read without the key signature. Hits at the
  same moment are a chord: `[C,,^F,,]` is the kick and the closed hi-hat. Each note of a chord plays on a lane of
  its own, and a score may have two drum voices (a kick on one, with its own `%%gain`, the hats on the other).
  - `!ghost!D,,` is a ghost note, played softly; `{D,,}D,,` is a flam and `{D,,D,,}D,,` a drag.
  - An accidental lasts to the bar line here too: after `^F,,` (closed hi-hat), a plain `F,,` in the same bar is the
    hi-hat again. Write `=F,,` for the low tom; the import warns when a drum note takes an accidental this way.

  | Note | Sound | Note | Sound |
  | --- | --- | --- | --- |
  | `C,,` | kick | `^F,,` | closed hi-hat |
  | `D,,` | snare | `^A,,` | open hi-hat |
  | `^C,,` | rim (cross-stick) | `^C,` | crash |
  | `^D,,` | clap | `_E,` | ride |
  | `F,,` `A,,` `C,` | low, middle, high tom | `^F,` | tambourine |

- **Orchestral percussion.** In a score with orchestral instruments, a voice named Percussion (with no voice named
  Drums) plays the orchestra's: `C,,` bass drum, `D,,` snare drum, `^C,` cymbals, `_E,` suspended cymbal (`!trem!`
  for a roll), `E,` tam-tam, `F,` triangle, `^F,` tambourine. A voice named for one instrument ("Cymbals", "Bass
  Drum", "Triangle", "Tam-tam") plays only it, whatever the note. Timpani and glockenspiel are pitched: name them.
- **The mix.** After a `V:` line, `%%gain +3` raises that voice 3 dB, and `%%pan -0.5` seats it left of centre (-1 to
  1). `%%double` double-tracks it, two takes panned apart (`%%double 0.6` for less width), as rhythm guitars are
  recorded. `%%duck` makes it dip under every kick of the drums and swell back (`%%duck 0.6` deeper), the pump of a
  synthwave pad and bass; `%%delay 3/16 -9` sends it to a delay of a dotted eighth at -9 dB, the echo on an
  arpeggio or a lead. abc2midi's `%%MIDI control 7 110` (volume, 100 as it is) and `%%MIDI control 10 30` (pan, 64 the centre) work
  too. Use them when a part the dynamics cannot balance stays buried (a glockenspiel doubling, a hi-hat staff).
**Check it.** Save the score as a file and run `npm run ears -- quest.abc`.

- **Each voice's instrument.** It is listed tune by tune; a voice that became `piano` was not recognized by its
  name.
- **Import warnings.** Each bar that does not add up to its meter, with its voice, part and bar. Such a bar is padded
  with rest, or cut at the bar line, so the rest of the score stays in time. Fix it anyway: it costs a beat.
- **The critic's notes.** Notes out of an instrument's range, melodies that miss the chords on strong beats. Aim for
  none.
- **The music, cue by cue, as a game hears it.** PASS or FAIL, its loudness, the key and tempo heard (check they
  are the ones you wrote) and balance warnings.
- **To hear it,** run `node tools/render.mjs quest.abc`: `out/quest.wav`, start to end.
- **To keep it as a song module,** run `node tools/convert.mjs quest.abc songs/quest.mjs`, or embed the ABC as the
  songbook template below does. In code, `importABC(text).report.warnings` gives the same warnings, and
  `importABC(text).text` shows the song the import made: each voice's notes, dynamics and tempo, bar by bar.
- Band, synth and chip scores get a room and a master voiced for them. One orchestral instrument puts the whole
  score in the concert hall.

### A game's music: a songbook of cues

A game needs cues, not one piece: music that loops while the player explores, changes for a battle, and a stinger for
a find. `importABCBook` reads a file of ABC tunes and makes one song of them, each tune a cue.
`songs/lantern_road.mjs` is a five-cue orchestral score written this way.

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

**Cues.** In each tune, write:

- `%%cue battle` to name its cue (the default is the title);
- `%%stinger win` to make it a stinger, played once over the music;
- `%%intro A` for the parts played once before the rest loops (a part named Intro is one already);
- `%%layer drums Drums, Timpani` to make a layer of those voices.

## Make it sound good

The checks catch mistakes; these make the music better. Each one is something the renderer does with what you write.

- **Mark the dynamics, everywhere.** The renderer plays what is marked and nothing more: a score with one `!mf!`
  plays at one level from start to end. Give each phrase its level and each climax its hairpin (`!<(!` ... `!<)!`),
  and contrast the sections (`!p!` then `!f!`). A recording of a Bach concerto spans 9.3 LU of loudness; the same
  score, with few marks, rendered 4.4.
- **Choose instruments that sound well here.** The eight bars of `evening.abc`, each ensemble playing the same four
  voices, scored by Audiobox Aesthetics (enjoyment, then quality, out of 10; higher is better; rendered once, at
  0.15.0):

  | Ensemble (voice names) | Enjoyment | Quality |
  | --- | --- | --- |
  | Brass (Trumpet, Horn, Trombone, Tuba; a few horn notes above its range) | 6.61 | 7.91 |
  | Piano (four voices named Piano) | 6.53 | 7.85 |
  | Band (Electric Guitar, Electric Piano, Electric Piano, Electric Bass) | 6.34 | 8.24 |
  | String sections (Violins I, Violins II, Violas, Cellos) | 6.32 | 7.91 |
  | Choir (Soprano, Alto, Tenor, Bass; some notes above its range) | 6.28 | 6.97 |
  | Woodwinds (Flute, Oboe, Clarinet, Bassoon) | 6.20 | 7.63 |
  | Flute, Clarinet, Violas, Cellos | 6.17 | 7.78 |
  | Synths (Synth Lead, Synth Pad, Synth Pad, Synth Bass) | 6.09 | 7.94 |
  | Solo strings (Solo Violin I, Solo Violin II, Solo Viola, Solo Cello) | 5.73 | 7.71 |
  | Chip (Pulse, Pulse, Pulse, Triangle Wave) | 3.94 | 6.96 |

  The chip is meant to sound like an 8-bit console, and Audiobox scores a slow string piece played on it low; a cue
  written for the chip (two pulses, the triangle and noise drums, at 144 BPM) scored 5.96 / 7.99 on its first take
  (`takes/chip-overworld`). Judge chip music by its own style. The solo strings are the weakest sound in the
  library: write for sections unless the music needs one player.
- **Know what the classics score here.** `library/` holds 100 famous public-domain pieces this engine plays from
  their own sheet music (0.16.0). Their first minutes score a median of 7.08 for enjoyment and 7.85 for quality:
  piano pieces 7.25, orchestral movements 7.00, from 4.53 for Bach's solo cello prelude to 7.79 for Schubert's
  Ständchen. A new piece in that range sounds as good as the engine plays Beethoven; one far below it has a problem
  worth finding even when every check passes. Sung voices score low (a solo tenor aria 5.39): give a melody to an
  instrument unless it needs words.
- **Keep each voice in its best range.** The critic flags notes outside an instrument's range; stay well inside it
  for the best sound (the preset table below has the ranges). A melody sounds best in the middle and upper part of
  its instrument: horn C4 to E5, trumpet up to C6, flute above A4, violins above D4.
- **Voice the harmony as an orchestrator would.** Wide intervals at the bottom (the bass an octave or more below the
  next voice), close ones higher up. Thirds below C3 sound muddy, and the ears flag the low mids at over 30%.
  Double the bass an octave apart (cellos and basses) for weight.
- **Give the melody to a voice that carries:** the top voice, or a different colour from its accompaniment (an oboe
  over strings, a trumpet over a band). Keep the accompaniment two dynamics below the melody (`!mf!` over `!p!`). A
  piano's left hand at `!p!` under an `!mf!` melody measured clear; one dynamic below, the ears called it muddy. In
  a string quartet, a sustained second violin one dynamic under the tune measured within 1 dB of it, and two
  dynamics under, 5 to 6 dB below; pizzicato double stops at `!mp!` were as loud as an arco melody at `!mf!`.
  `npm run ears -- out/stems/piece` shows each part's level, section by section.
- **Phrase it.** Four- and eight-bar phrases that end on a cadence (V to I), slurs over the notes a player would
  join, staccato and accents where the rhythm should bite, a fermata on the last chord.
- **Fix what the tools say.** Every import warning and critic note is a place where the music is not what you meant.

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

For anything but chip music, name each instrument by its preset and give the song a room:
`instruments: { lead: 'synth_lead', bass: 'electric_bass', horn: 'trumpet', kit: 'drum_kit' }, room: 'band'`.
The presets are calibrated (tone, range, level): a part on one plays at the preset's level and through its effects,
and its own `gain` counts from there, so parts at 0 dB start balanced (since 0.26.0; before, a named preset played its
raw spec, up to 14 dB off and with no effects). The room brings the reverb and the master an ABC score of those
instruments gets by itself. The games that wrote songs this way by hand used raw specs (`{ type: 'brass' }`) and no
room: the same notes on presets, in a room, scored 6.13 for enjoyment on Audiobox against their own 5.35 (median of
15 games' first cues, 0.17.0), and 6.29 against 6.02 once each preset played at its calibrated level (0.26.0, mean
of 25 games' first cues). Leave `master.lufs` at its -16: the game sets the music's volume, the same in every
game.

### The score format

A part line is bars of tokens between `|`. A bar has `grid` steps (16 in 4/4: sixteenth notes).

| Token | Meaning |
| --- | --- |
| `C4`, `F#3`, `Bb2` | A note, one step |
| `C4:4` | A note held four steps |
| `[D3 F3 A3]:8`, `D3+F3+A3:8` | A chord |
| `.`, `.:4` (`R:4` too, on a line of notes) | A rest |
| `-`, `-:3` | Hold the note before (across a bar line too) |
| `{G#4 A4}B4:2` | Grace notes before a note |

Suffixes come after the length (`D4:3!`; written before it, `D4!:3`, they mean the same):

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

- `chords`, one symbol per bar or several separated by spaces, sharing the bar evenly, or at their steps written
  like notes (`'| G:4 D7:4 G:8 |'`). The critic checks melodies against them, and the generators read them.
- `dyn`, a part's dynamics bar by bar: one marking for the bar (`'| p< | - | f |'`, with `<` and `>` hairpins that
  ramp to the next marking), or several at their steps, written like notes (`'| mf:12 <:4 | f |'`: mf, then a
  crescendo over the last beat to f; `'| p f |'` puts f half way).
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
| `strings`, `brass`, `wind`, `choir`, `organ`, `modal`, `perc`, `ensemble` | The orchestra | Name a preset below rather than a raw spec: `horn: 'trumpet'` |

### Orchestral presets

Name a preset in a song's `instruments` (`horn: 'trumpet'`, or `{ preset: 'trumpet', ...settings }` to change some of
it): its parts get the preset's calibrated gain and effects, their own on top. `presetSpec(name)`, from
`engine/orchestra.mjs`, gives the preset's spec as an object, which plays as written: `PRESETS.instruments[name]` has
the gain, pan, hall send and EQ a part on it should start from (`songs/set_orchestral.mjs` spells them out). Its
range is the critic's range. Ranges are sounding pitch, as you write them.

| Family | Presets (range) |
| --- | --- |
| Strings | violins G3-G7, violas C3-G6, cellos C2-A5, basses C1-G4, solos of each, `_pizz` versions of each section |
| Woodwinds | flute B3-D7, piccolo D5-C8, recorder C4-D7, oboe Bb3-A6, english_horn E3-C6, clarinet D3-Bb6, bass_clarinet Bb1-F5, bassoon Bb1-E5, contrabassoon Bb0-Bb3, saxophones (soprano, alto, tenor, baritone) |
| Brass | horn Bb1-F5, trumpet E3-D6, cornet E3-C6, trombone E2-F5, bass_trombone Bb1-G4, tuba D1-F4, euphonium Bb1-Bb4, muted_trumpet |
| Percussion | timpani C2-C4, glockenspiel C5-C8, xylophone F4-C8, marimba A2-C7, vibraphone F3-F6, tubular_bells C4-F5, celesta C4-C8, crotales, percussion (a kit: bass drum, snare, cymbals, triangle) |
| Keyboards | piano A0-C8, harp C1-G7, harpsichord F1-F6, organ C1-C8 |
| Voices | soprano_choir C4-A5, alto_choir F3-E5, tenor_choir C3-A4, bass_choir E2-E4, solo voices (soprano, alto, tenor, bass) |
| Band | acoustic_guitar E2-C6, electric_guitar E2-E6, distortion_guitar E2-E6, electric_bass E1-G4, electric_piano E1-G7 |
| Synth and chip | synth_lead C2-G7, synth_pluck C2-G7, synth_pad C2-C7, synth_bass C1-C4, chip_pulse A2-C7, chip_triangle E1-C6 |

The orchestral presets were measured against recordings of each instrument and corrected (HANDOFF), so start from
them rather than raw specs. Give an orchestral song `stage: { seat: 'stalls' }` (`PRESETS.stage`). Each part then sits on a concert stage by
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
player.volume('music', 0.1);                          // the player's default: music at 10%, sfx and voice at full
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

There are 232 named sounds in twelve categories (`SOUND_CATEGORIES`), each with seeded takes so repeats vary.
`npm run sfx` lists them with their lengths, levels and descriptions. `SOUNDS[name].desc` says what each one is, in a
few words: show it as a caption for players who cannot hear the sound.

- **Interface (26):** `ui_click`, `ui_hover`, `ui_confirm`, `ui_back`, `ui_error`, `ui_open`, `ui_close`, `ui_type`,
  `ui_notify`, `ui_move`, `ui_toggle_on`, `ui_toggle_off`, `ui_slider`, `ui_tab`, `ui_popup`, `ui_success`,
  `ui_purchase`, `ui_achievement`, `ui_countdown`, `ui_go`, `ui_warning`, `ui_text`, `ui_pause`, `ui_save`,
  `ui_equip`, `ui_drop`.
- **Movement (28):** `jump`, `double_jump`, `land`, `step_grass`, `step_gravel`, `step_wood`, `step_stone`,
  `step_metal`, `step_water`, `step_snow`, `dash`, `splash`, `step_dirt`, `step_sand`, `step_mud`, `step_leaves`,
  `step_tile`, `step_carpet`, `land_heavy`, `slide`, `climb`, `swim`, `dive`, `flap`, `bounce`, `fall`, `roll`,
  `rustle`.
- **Combat (36):** `sword_swing`, `sword_hit`, `punch`, `hurt`, `block`, `bow_shoot`, `arrow_hit`, `explosion`,
  `explosion_small`, `laser`, `enemy_die`, `kick`, `club_hit`, `slash`, `parry`, `shield_hit`, `critical`,
  `swing_heavy`, `whip`, `throw`, `pistol`, `shotgun`, `rifle`, `machine_gun`, `reload`, `dry_fire`, `shell_casing`,
  `ricochet`, `bullet_impact`, `rocket_launch`, `blaster`, `hit`, `player_die`, `stun`, `explosion_distant`,
  `heartbeat`.
- **Magic (20):** `spell_cast`, `fireball`, `ice`, `heal`, `teleport`, `charge`, `power_up`, `lightning`, `poison`,
  `buff`, `debuff`, `curse`, `shield_up`, `summon`, `sparkle`, `mana`, `bless`, `magic_bolt`, `fizzle`, `vanish`.
- **Pickups (16):** `coin`, `gem`, `heart`, `key`, `item`, `extra_life`, `coins`, `star`, `ammo`, `potion`, `drink`,
  `eat`, `weapon`, `xp`, `collect`, `upgrade`.
- **Doors and mechanisms (17):** `door_open`, `door_close`, `door_locked`, `gate_metal`, `lever`, `chest_open`,
  `stone_door`, `button`, `switch`, `pressure_plate`, `door_slide`, `door_knock`, `door_unlock`, `trapdoor`, `spikes`,
  `chest_close`, `door_slam`.
- **The world (21):** `glass_break`, `wood_break`, `pot_break`, `rock_fall`, `metal_clang`, `ball_bounce`, `chain`,
  `bubbles`, `steam`, `spark`, `fuse`, `ignite`, `thunder`, `bell`, `clock_tick`, `water_drop`, `page_turn`, `thud`,
  `floor_creak`, `gust`, `quake`.
- **Creatures (14):** `growl`, `roar`, `hiss`, `slime`, `squeak`, `bat`, `bird`, `owl`, `frog`, `bee`, `ghost`,
  `howl`, `groan`, `bite`.
- **Machines and vehicles (17):** `computer`, `scanner`, `alarm`, `siren`, `power_down`, `power_on`, `servo`,
  `keypad`, `car_horn`, `tire_screech`, `jet_pass`, `gears`, `phone`, `warp`, `glitch`, `static`, `elevator`.
- **Sports (10):** `whistle`, `crowd_cheer`, `applause`, `ball_kick`, `bat_hit`, `racket_hit`, `glove_catch`,
  `post_hit`, `buzzer`, `goal_horn`.
- **Jingles (9):** `level_up`, `victory`, `game_over`, `checkpoint`, `complete`, `discover`, `hurry`, `high_score`,
  `lose_life`.
- **Ambient loops (18):** `amb_rain`, `amb_wind`, `amb_fire`, `amb_stream`, `amb_cave`, `amb_machine`, `amb_forest`,
  `amb_night`, `amb_ocean`, `amb_storm`, `amb_space`, `amb_dungeon`, `amb_underwater`, `amb_swamp`, `amb_lava`,
  `amb_hum`, `amb_waterfall`, `amb_crowd`.

```js
player.sfx('coin');
player.sfx('step_grass', { pan: -0.3 });
const rain = player.sfx('amb_rain', { loop: true, fade: 2 }); // later: rain.stop(2), a two-second fade
player.define('zap', { layers: [{ type: 'tone', wave: 'square', freq: 'C6', slide: -3, d: 0.15 }], level: -18 });
player.preload(['coin', 'jump', 'zap']);                     // render ahead in a worker, while a level loads
```

A new effect is layers of small models: `tone`, `noise`, `modal`, `boom`, `step`, `whoosh`, `crackle`, `drip`, `creak`
and `scatter` (their settings are in API.md). Start from the library sound nearest to what you want, copy its spec,
and change it. Set `level` (about -18 LUFS for most sounds; interface sounds sit lower, at -22). Any layer also takes
`trem` (an amplitude wobble or gate), `vowel` (a formant filter: growls, moans), `rep` (played again: knocks, bursts)
and `seq` (played as notes: jingles); a one-shot takes a `room` (a reverb tail: shots, bells, roars). For an ambient
bed, use `loop: seconds`; a layer with an `at` is an event in it (a bird's call), the rest run the whole loop.

Check a new sound two ways. `sfxLoudness` and `npm run ears -- out/x.wav` give its level and peaks. Then give it a
`desc` and run `npm run sfx -- match --try mine.mjs` (a module whose default export maps names to specs): a listening
model (CLAP) ranks the sound's description among the library's. Rank 1 to 5 means it sounds like what it says; far
down the list, it does not, and the sounds it was heard as say what it sounds like instead. The library's own median
rank is 5. Interface sounds rank lowest (median 13), because the model knows little about menus: there, trust the
description and the ears.

## Voices

`player.say(text, character, { emotion })` speaks a line in Animalese-style gibberish: a blip per syllable, shaped
by the character's formants and pitch. It ducks the music while it speaks. `onSyllable(s, i)` fires on each
syllable, to reveal dialog text in time.

- **Characters:** villager, hero, heroine, child, elder, merchant, giant, fairy, critter, robot, monster, ghost.
  Custom characters take the same fields. A cast of your own: `voiceFor('Lena', 'heroine')` moves the heroine's voice
  by the name, so each named character sounds like itself and the same every time.
- **Emotions:** neutral, happy, sad, angry, scared, surprised. Punctuation shapes the pitch: a question rises.

## Public-domain music

`importScore(bytes)` takes MusicXML, MIDI, ABC or Humdrum **kern and returns a song you can play with
`music(song, { loop: false })`. From a shell, use `node tools/convert.mjs piece.mxl songs/piece.mjs`.

Commit only CC0 or public-domain sources, with their source, licence and commit in the song's `source` field. Good
sources are OpenScore, PDMX's CC0 files, and Mutopia's public-domain pieces. Downloaded scores are untrusted data:
keep them in `scores/`, which is ignored.

## Checklist before shipping a cue

A game outside this repository checks its own songbook from a clone of it, with nothing to install:
`node my-game-audio/tools/ears.mjs music.abc` ([GAMES.md](GAMES.md), "Check it before it ships").

- [ ] `arrange(song).errors` is empty and `critic(song, arr).warnings` is empty, or every warning is understood.
- [ ] `npm run check` passes.
- [ ] `npm run ears -- songs/<name>.mjs` passes every cue: no clicks, true peak at or under -1 dBTP, about -16
      LUFS. The key it hears is the key you wrote.
- [ ] Balance warnings are deliberate: a dungeon may be dark, but a title should not be muddy.
- [ ] What ships is the best take (`npm run takes` names it), not the last, and no more than five takes were made.
- [ ] Loops are seamless by construction. Still, end a body so it leads back to its start (a V chord, a drum fill),
      or the music will repeat abruptly even without a click.
- [ ] In the repository: the song has a golden hash (`npm run golden -- --write`), and `npm test` passes.
- [ ] Music plays at 10%, the player's default since 0.27.0; `player.volume('music', v)` sets another level.

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
