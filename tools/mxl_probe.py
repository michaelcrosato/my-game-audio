"""Probe a MusicXML score with music21: parts, instruments, transpositions, meters, tempos, repeats, marks.
usage: python3 -I tools/mxl_probe.py FILE.mxl"""
import sys
from collections import Counter

import music21 as m21

s = m21.converter.parse(sys.argv[1])
print("title:", s.metadata.title if s.metadata else None, "| parts:", len(s.parts))
for p in s.parts:
    ins = p.getInstrument(returnDefault=False)
    tr = ins.transposition if ins else None
    notes = list(p.flatten().notes)
    texts = Counter(t.content.strip().lower()[:24] for t in p.recurse().getElementsByClass("TextExpression"))
    arts = Counter(type(a).__name__ for n in notes for a in n.articulations)
    exps = Counter(type(e).__name__ for n in notes for e in n.expressions)
    print(f"- {p.partName!r:34} inst={type(ins).__name__ if ins else None:18} prog={getattr(ins, 'midiProgram', None)} "
          f"sound={getattr(ins, 'instrumentSound', None)} transp={tr} notes={len(notes)} unpitched={sum(1 for n in notes if 'Unpitched' in type(n).__name__)}")
    if arts or exps:
        print("    arts", dict(arts), "exps", dict(exps))
    if texts:
        print("    texts", dict(texts.most_common(8)))
ms = s.parts[0].getElementsByClass("Measure")
print("measures:", len(ms))
tss = [(m.number, m.timeSignature.ratioString) for m in ms if m.timeSignature]
print("time signatures:", tss[:10])
mm = [(round(float(x.getOffsetInHierarchy(s)), 2), x.number, x.text) for x in s.recurse().getElementsByClass("MetronomeMark")]
print("tempo marks:", mm[:12])
reps = [(m.number, type(b).__name__, getattr(b, "direction", None)) for m in ms for b in [m.leftBarline, m.rightBarline] if b is not None and "Repeat" in type(b).__name__]
print("repeat barlines:", reps[:10])
sp = Counter(type(x).__name__ for x in s.spannerBundle)
print("spanners:", dict(sp))
dyn = Counter(d.value for d in s.recurse().getElementsByClass("Dynamic"))
print("dynamics:", dict(dyn.most_common(12)))
