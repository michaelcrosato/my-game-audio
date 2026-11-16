"""Cross-check kern.read against music21 on the same expanded file: note onsets, pitches and lengths per staff."""
import os
import sys
from collections import Counter
from fractions import Fraction as F

import music21 as m21

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kern  # noqa: E402

path, lst, upto = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else ""), float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
text = open(path, encoding="utf-8").read()
notes, dyn, bar, pickup, order, end = kern.read(text, lst)
mine = Counter()
for staff, ns in notes.items():
    for n in ns:
        if n["on"] < upto:
            mine[(staff, n["on"], n["midi"], n["dur"])] += 1
exp, _ = kern.expand(text, lst)
s = m21.converter.parse(exp, format="humdrum")
theirs = Counter()
parts = list(s.parts)
for idx, p in enumerate(parts):
    staff = idx + 1  # music21 lists the top staff first
    for el in p.flatten().stripTies().notes:
        if el.duration.isGrace:
            continue
        on = F(el.offset).limit_denominator(192)
        if on < upto:
            for pt in el.pitches:
                theirs[(staff, on, pt.midi, F(el.quarterLength).limit_denominator(192))] += 1
only_m, only_t = mine - theirs, theirs - mine
print(f"{os.path.basename(path)}: kern.read {sum(mine.values())} notes, music21 {sum(theirs.values())}; only kern.read {sum(only_m.values())}, only music21 {sum(only_t.values())}")
for k in list(only_m)[:6]:
    print("  only kern.read", k)
for k in list(only_t)[:6]:
    print("  only music21  ", k)
