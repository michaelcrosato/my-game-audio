// "The Lantern Road": a small adventure game's music, written as sheet music. The score below is ABC notation, the
// text form of a printed score: five tunes (title, town, dungeon, battle, and a victory stinger) for a chamber
// orchestra, one voice per instrument, with dynamics, articulations, chord symbols and string techniques written as
// a composer marks them on paper. engine/abc.mjs importABCBook turns it into one song with a cue per tune: the title's
// Intro plays once before its A strain loops, the chord symbols give the harp its part, %%layer names the layers a
// game turns up and down. An original score, dedicated to the public domain (CC0), written for this repository.
import { importABCBook } from '../engine/abc.mjs';

export const ABC = String.raw`%abc-2.1
% The Lantern Road: an original score, CC0.

X:1
T:The Lantern Road
%%cue title
%%layer drums Timpani
M:4/4
L:1/8
Q:1/4=88
K:D
V:1 name="Violins"
V:2 name="Horn"
V:3 name="Cellos"
V:4 name="Timpani"
P:Intro
[V:1] "D"!p! [FAd]8- | "A"[EAc]8 |
[V:2] !mf! z2 A,2 D2 F2 | A6 z2 |
[V:3] !p! D,8- | A,,8 |
[V:4] !p! !trem!D,,8 | !trem!A,,8 |
P:A
[V:1] "D"!mf! d3 e f2 a2 | "G"g3 f e2 d2 | "Bm"f3 e d2 B2 | "A"c4 A4 | "G"B3 c d2 g2 | "D/F#"f3 e d2 A2 | "Em"B2 e2 "A"c2 e2 | "D"d6 z2 |
[V:2] !mp! A4 F4 | G4 B4 | F4 D4 | E8 | D4 G4 | A4 F4 | G4 A4 | F6 z2 |
[V:3] !mf! D,4 A,,4 | G,,4 D,4 | B,,4 F,4 | A,,4 E,4 | G,,4 B,,4 | F,4 D,4 | E,4 A,,4 | D,6 z2 |
[V:4] !mf! D,,2 z2 A,,2 z2 | z8 | z8 | A,,2 A,,2 A,,4 | z8 | z8 | z4 A,,2 A,,2 | D,,2 z6 |

X:2
T:Market Day
%%cue town
%%layer melody Flute, Oboe
M:3/4
L:1/8
Q:1/4=138
K:G
V:1 name="Flute"
V:2 name="Oboe"
V:3 name="Violins"
V:4 name="Cellos"
[V:1] "G"!mp! d3 c B G | "C"e3 d c e | "D"d2 A2 F2 | "G"G4 B2 | "Em"B3 c d B | "Am"c3 d e c | "D7"B2 A2 F A | "G"G4 z2 |
[V:1] "C"g3 e c e | "G"d3 B G B | "Am"c3 A E A | "D"F4 A2 | "G"B3 d g d | "C"e3 g e c | "D7"d2 c2 A2 | "G"G4 z2 |]
[V:2] z6 | z6 | z6 | z6 | z6 | z6 | z6 | z6 |
[V:2] !p! c6 | B6 | A6 | A6 | B6 | c6 | A4 F2 | G4 z2 |]
[V:3] "^pizz."!p! z2 [Bd]2 [Bd]2 | z2 [ce]2 [ce]2 | z2 [Ad]2 [Ad]2 | z2 [Bd]2 [Bd]2 | z2 [Be]2 [Be]2 | z2 [Ac]2 [Ac]2 | z2 [Ac]2 [Ac]2 | z2 [Bd]2 [Bd]2 |
[V:3] z2 [ce]2 [ce]2 | z2 [Bd]2 [Bd]2 | z2 [Ac]2 [Ac]2 | z2 [Ad]2 [Ad]2 | z2 [Bd]2 [Bd]2 | z2 [ce]2 [ce]2 | z2 [Ac]2 [Ac]2 | z2 [Bd]2 [Bd]2 |]
[V:4] !mp! G,,2 z4 | C,2 z4 | D,2 z4 | G,,2 z4 | E,2 z4 | A,,2 z4 | D,2 z4 | G,,2 z4 |
[V:4] C,2 z4 | G,,2 z4 | A,,2 z4 | D,2 z4 | G,,2 z4 | C,2 z4 | D,2 z4 | G,,2 z4 |]

X:3
T:Below the Mill
%%cue dungeon
%%accompany off
M:4/4
L:1/8
Q:1/4=66
K:Dm
V:1 name="Cellos"
V:2 name="Violins"
V:3 name="Basses"
V:4 name="Flute"
[V:1] "Dm"!p! D4 F2 A2 | "Bb"B6 A2 | "Gm"G4 B2 d2 | "A"^c8 | "Dm"d4 c2 A2 | "Bb"B4 A2 G2 | "Gm"G4 "A"A4 | "Dm"D8 |]
[V:2] "^sul pont."!pp! !trem![da]8 | !trem![df]8 | !trem![dg]8 | !trem![^ce]8 | !trem![da]8 | !trem![df]8 | !trem![Bd]4 !trem![^ce]4 | !trem![df]8 |]
[V:3] !pp! D,,8 | B,,,8 | G,,,8 | A,,,8 | D,,8 | B,,,8 | G,,,4 A,,,4 | D,,8 |]
[V:4] z8 | z8 | z6 !pp! a2- | a8 | z8 | z8 | z8 | z8 |]

X:4
T:Steel on the Road
%%cue battle
%%accompany off
%%layer drums Timpani
%%layer brass Horn
M:4/4
L:1/8
Q:1/4=152
K:Am
V:1 name="Violins"
V:2 name="Horn"
V:3 name="Cellos"
V:4 name="Basses"
V:5 name="Timpani"
[V:1] "Am"!ff! .a.a.e'.a .c'.a.e'.a | "F".a.a.f'.a .c'.a.f'.a | "G".b.b.g'.b .d'.b.g'.b | "E".b.b.e'.b .^g.b.e'.b | "Am".a.a.e'.a .c'.a.e'.a | "F".a.a.f'.a .c'.a.f'.a | "Dm".a.a.d'.f' "E".b.b.e'.^g' | "Am".a.a.e'.a !>!a'4 |]
[V:2] !f! !>!A,4 E2 A2 | !>!F4 E2 C2 | !>!D4 G2 B2 | !>!^G6 E2 | !>!A4 c2 e2 | !>!d4 c2 A2 | !>!d4 B2 ^G2 | !>!A6 z2 |]
[V:3] !mf! A,,2A,,2 A,,2A,,2 | F,,2F,,2 F,,2F,,2 | G,,2G,,2 G,,2G,,2 | E,,2E,,2 E,,2E,,2 | A,,2A,,2 A,,2A,,2 | F,,2F,,2 F,,2F,,2 | D,,2D,,2 E,,2E,,2 | A,,2A,,2 A,,4 |]
[V:4] !mp! A,,,4 A,,,4 | F,,,4 F,,,4 | G,,,4 G,,,4 | E,,,4 E,,,4 | A,,,4 A,,,4 | F,,,4 F,,,4 | D,,4 E,,,4 | A,,,8 |]
[V:5] !mf! A,,2 zA,, E,,2 zE,, | A,,2 zA,, E,,2 zE,, | A,,2 zA,, E,,2 zE,, | E,,2 E,,2 E,,E,,E,,E,, | A,,2 zA,, E,,2 zE,, | A,,2 zA,, E,,2 zE,, | A,,2 zA,, E,,2 zE,, | A,,2 z2 !trem!A,,4 |]

X:5
T:Victory
%%stinger victory
M:4/4
L:1/8
Q:1/4=120
K:D
V:1 name="Trumpet"
V:2 name="Horn"
V:3 name="Violins"
V:4 name="Cellos"
V:5 name="Timpani"
[V:1] !f! (3A,A,A, D2 F2 A2 | d4 c2 e2 | !fermata!d8 |]
[V:2] !f! z2 D2 F2 A2 | A4 A2 A2 | !fermata!F8 |]
[V:3] !f! z2 [DFA]6 | [DFA]4 [EAc]4 | !fermata![FAd]8 |]
[V:4] !f! z2 D,6 | D,4 A,,4 | !fermata!D,8 |]
[V:5] !f! z2 D,,2 D,,2 D,,2 | A,,2 A,,2 A,,A,, A,,A,, | !trem!D,,8 |]
`;

export default importABCBook(ABC, { title: 'The Lantern Road' }).song;
