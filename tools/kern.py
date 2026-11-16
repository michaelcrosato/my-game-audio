"""kern.py: a small reader for Humdrum **kern (the subset piano scores use), with repeats written out.

Timing follows the Humdrum rule: each data line starts when the earliest sounding event ends. Spine splits (*^) and
merges (*v) are followed, so a staff can have several voices. Ties are merged, grace notes (q, Q) attach to the next
note in their spine, trills (t, T) are written out, and staccato (') and accent (^) marks are kept.
read(text, list_name) -> (staves, dynamics, bar_len_quarters, pickup_quarters)
"""
import re
from fractions import Fraction as F

PC = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
NOTE_RE = re.compile(r"([a-gA-G])\1*")


def expand(text, list_name=""):
    """Humdrum `thru`: put the labelled sections (*>A) in the order of the expansion list (*>[A,A,B] or *>name[...])."""
    lines = text.split("\n")
    order = None
    for ln in lines:
        f = ln.split("\t")[0]
        if f.startswith("*>" + list_name + "["):
            order = f[len("*>" + list_name) + 1 : -1].split(",")
    labels = [i for i, ln in enumerate(lines) if ln.startswith("*>") and "[" not in ln.split("\t")[0]]
    if order is None or not labels:
        return text, None
    end = next(i for i, ln in enumerate(lines) if ln.split("\t")[0] == "*-")
    header = [ln for ln in lines[: labels[0]] if not ln.startswith("*>")]
    secs = {}
    bounds = labels + [end]
    for a, b in zip(bounds, bounds[1:]):
        secs[lines[a].split("\t")[0][2:]] = lines[a + 1 : b]
    body = []
    for lab in order:
        body += secs[lab]
    return "\n".join(header + body + lines[end:]), order


def duration(tok):
    m = re.match(r"(\d+)(%(\d+))?(\.*)", re.sub(r"^[\[\(\{&<>]+", "", tok))
    if not m:
        return None
    r = int(m.group(1))
    base = F(8) if r == 0 else F(4) / r
    if m.group(3):
        base = base * int(m.group(3))
    dots = len(m.group(4))
    return base * (2 - F(1, 2**dots)) if dots else base


def pitch(tok):
    """kern pitch -> (midi, spelled name) or None for a rest."""
    m = NOTE_RE.search(tok)
    if not m:
        return None
    letters = m.group(0)
    L = letters[0]
    n = len(letters)
    octave = 3 + n if L.islower() else 4 - n
    rest = tok[m.end():]
    acc = re.match(r"(#{1,2}|-{1,2}|n)?", rest).group(0) or ""
    semis = acc.count("#") - acc.count("-")
    midi = (octave + 1) * 12 + PC[L.lower()] + semis
    name = L.upper() + ("#" * acc.count("#")) + ("b" * acc.count("-")) + str(octave)
    return midi, name


def read(text, list_name=""):
    text, order = expand(text, list_name)
    cols = []  # per column: {'type': '**kern', 'staff': n, 'end': F}
    T = F(0)
    notes = {}  # staff -> list of notes
    dyn = []
    open_ties = {}  # (staff, midi) -> note
    pend_grace = {}  # column index -> [midi]
    bar_len, first_bar_at, meter_seen = None, None, False
    bar_times = []
    for raw in text.split("\n"):
        if not raw or raw.startswith("!"):
            continue
        f = raw.split("\t")
        if raw.startswith("**"):
            cols = [{"type": x, "staff": None, "end": F(0)} for x in f]
            continue
        if raw.startswith("*"):
            if any(x in ("*+", "*x") for x in f):
                raise ValueError(f"spine manipulator not supported: {raw}")
            if any(x in ("*^", "*v") for x in f):
                new, i = [], 0
                while i < len(f):
                    x = f[i]
                    if x == "*^":
                        new += [dict(cols[i]), dict(cols[i])]
                        i += 1
                    elif x == "*v":
                        j = i
                        while j < len(f) and f[j] == "*v":
                            j += 1
                        merged = dict(cols[i])
                        merged["end"] = max(c["end"] for c in cols[i:j])
                        new.append(merged)
                        i = j
                    else:
                        new.append(cols[i])
                        i += 1
                # pending graces follow their columns only when nothing was split or merged before them; drop them otherwise
                pend_grace = {}
                cols = new
                continue
            for i, x in enumerate(f):
                if i < len(cols):
                    m = re.match(r"\*staff(\d+)", x)
                    if m:
                        cols[i]["staff"] = int(m.group(1))
                    m = re.match(r"\*M(\d+)/(\d+)", x)
                    if m and bar_len is None:
                        bar_len = F(int(m.group(1))) * F(4, int(m.group(2)))
            continue
        if raw.startswith("="):
            bar_times.append(T)
            continue
        # a data line
        for i, tok in enumerate(f):
            if i >= len(cols):
                break
            c = cols[i]
            if tok == ".":
                continue
            if c["type"] == "**dynam":
                dyn.append((T, tok))
                continue
            if c["type"] != "**kern":
                continue
            staff = c["staff"] or i
            end = T
            last_d = None
            for sub in tok.split(" "):
                if not sub or sub == ".":
                    continue
                d = duration(sub)
                if d is None:
                    d = last_d  # chord notes may leave out the duration: it is the chord's first note's
                last_d = d
                grace = "q" in sub or "Q" in sub
                if d is None and not grace:
                    continue
                p = None if "r" in sub else pitch(sub)
                if grace:
                    if p:
                        pend_grace.setdefault(i, []).append(p[0])
                    continue
                end = max(end, T + d)
                if p is None:
                    continue
                midi, name = p
                key = (staff, midi)
                held = open_ties.get(key)
                if held is not None and "[" in sub and held["on"] + held["dur"] == T:
                    held["dur"] += d  # a second tie start on a note that is already tied: a tie middle
                    continue
                if ("]" in sub or "_" in sub) and key in open_ties:
                    nt = open_ties[key]
                    nt["dur"] += d
                    if "]" in sub:
                        del open_ties[key]
                    continue
                arts = ""
                if "'" in sub or "`" in sub:
                    arts += "^"
                if "^" in sub:
                    arts += "!"
                nt = {"on": T, "dur": d, "midi": midi, "name": name, "arts": arts, "grace": pend_grace.pop(i, []),
                      "trill": 1 if "t" in sub else 2 if "T" in sub else 0}
                notes.setdefault(staff, []).append(nt)
                if "[" in sub:
                    open_ties[key] = nt
            c["end"] = end
        nxt = min(c["end"] for c in cols if c["type"] == "**kern")
        if nxt > T:
            T = nxt
    pickup = F(0)
    if bar_times and bar_len:
        first = [t for t in bar_times if t > 0]
        if first and first[0] < bar_len:
            pickup = first[0]
    return notes, dyn, bar_len, pickup, order, T


def trill_notes(nt, step=F(1, 8)):
    """Write a trill out as alternating notes, starting on the upper note (classical practice)."""
    up = nt["midi"] + (1 if nt["trill"] == 1 else 2)
    out, t, k = [], nt["on"], 0
    n = max(2, int(nt["dur"] / step))
    for k in range(n):
        d = step if k < n - 1 else nt["dur"] - step * (n - 1)
        m = up if k % 2 == 0 else nt["midi"]
        out.append({**nt, "on": t, "dur": d, "midi": m, "name": None, "grace": nt["grace"] if k == 0 else [], "trill": 0})
        t += d
    return out
