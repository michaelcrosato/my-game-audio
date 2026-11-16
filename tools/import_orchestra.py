"""import_orchestra.py: a full score in MusicXML -> a song file the engine plays with its synthesized orchestra.

Export a score from MuseScore, Sibelius, Finale or Dorico as MusicXML (.mxl or .musicxml) and run:
    python3 -I tools/import_orchestra.py SCORE.mxl songs/name.mjs [--tempo 200] [--bars 1-124] [--title "..."]

Every part gets an instrument preset (engine/orchestra-presets.json) from its MusicXML sound ID, its name in any of
several languages, or its General MIDI program. Transposing instruments are written at sounding pitch. Repeats are
written out. Tempo marks, tempo words (Allegro, Adagio, a tempo, rit.) and fermatas become a tempo line; meter
changes and pickup bars become sections of their own. Each part keeps its own dynamics, hairpins and sforzandi.
Slurs, staccato, accents, pizzicato and arco, mutes, tremolos (measured ones written out), trills and grace notes are
kept. Percussion without pitch becomes kit tokens.
"""
import json
import math
import os
import re
import sys
import unicodedata
from fractions import Fraction as F

import music21 as m21

HERE = os.path.dirname(os.path.abspath(__file__))
PRESETS = json.load(open(os.path.join(HERE, "..", "engine", "orchestra-presets.json"), encoding="utf-8"))
INST = PRESETS["instruments"]
LEVELS = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"]
LEVEL_MAP = {"pppp": "ppp", "ffff": "fff", "fp": "p", "sfp": "p", "sfpp": "pp"}
ACCENT_DYN = {"sf", "sfz", "fz", "sffz", "rfz", "rf", "sfp", "fp", "sfpp", "fzp"}
ABBR = {
    "violins": "vn", "violas": "va", "cellos": "vc", "basses": "cb", "violin_solo": "vns", "viola_solo": "vas", "cello_solo": "vcs",
    "contrabass_solo": "cbs", "flute": "fl", "piccolo": "picc", "recorder": "rec", "oboe": "ob", "english_horn": "eh",
    "clarinet": "cl", "bass_clarinet": "bcl", "bassoon": "bn", "contrabassoon": "cbn", "soprano_sax": "ssx", "alto_sax": "asx",
    "tenor_sax": "tsx", "baritone_sax": "bsx", "horn": "hn", "trumpet": "tp", "cornet": "cnt", "trombone": "tb", "bass_trombone": "btb",
    "tuba": "tu", "euphonium": "eu", "muted_trumpet": "mtp", "timpani": "timp", "glockenspiel": "glk", "xylophone": "xyl",
    "marimba": "mar", "vibraphone": "vib", "tubular_bells": "bells", "celesta": "cel", "crotales": "crt", "piano": "pno",
    "harp": "hp", "harpsichord": "hpd", "organ": "org", "soprano_choir": "sop", "alto_choir": "alt", "tenor_choir": "ten",
    "bass_choir": "bas", "soprano_voice": "sopsolo", "alto_voice": "altsolo", "tenor_voice": "tensolo", "bass_voice": "bassolo",
    "percussion": "perc", "acoustic_guitar": "gtr", "electric_guitar": "egtr", "distortion_guitar": "dgtr", "electric_bass": "bass",
    "electric_piano": "ep", "synth_lead": "lead", "synth_pluck": "arp", "synth_pad": "pad", "synth_bass": "sbass", "chip_pulse": "pulse",
    "chip_triangle": "tri",
}


def q(x):
    return F(x).limit_denominator(480)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z]+", " ", s)
    return f" {s.strip()} "


def best_alias(name, table):
    """The longest alias that appears as whole words in the name: (key, alias) or (None, None)."""
    n = norm(name)
    best = (None, None)
    for key, aliases in table.items():
        for a in aliases:
            na = norm(a)
            if na.strip() and na in n and (best[1] is None or len(na) > len(best[1])):
                best = (key, na)
    return best


def map_part(names, sound, program, unpitched_frac, has_voices):
    """Choose a preset for one part from its names (any language), MusicXML sound ID and General MIDI program (0-based).
    Returns (preset, percussion token or None, how it was chosen)."""
    sound = (sound or "").lower()
    by_sound = None
    for key, p in INST.items():
        for sd in p["sounds"]:
            if sound.startswith(sd) and (by_sound is None or len(sd) > by_sound[1]):
                by_sound = (key, len(sd), sd)
    kit_sound = sound.split(".")[0] in ("drum", "metal", "wood") and (by_sound is None or INST[by_sound[0]]["family"] != "percussion")
    if unpitched_frac > 0.5 or (kit_sound and unpitched_frac > 0):
        tok, _ = best_alias(names, {k: v["aliases"] for k, v in PRESETS["percussion"].items()})
        how = "name"
        if not tok:
            best = None
            for k, v in PRESETS["percussion"].items():
                for sd in v["sounds"]:
                    if sound.startswith(sd) and (best is None or len(sd) > best[1]):
                        best = (k, len(sd))
            tok, how = (best[0], "sound") if best else ("sd", "default")
        return "percussion", tok, f"unpitched percussion, {how}"
    by_name, alias = best_alias(names, {key: p["aliases"] for key, p in INST.items()})
    if by_sound and by_name and INST[by_name]["family"] == INST[by_sound[0]]["family"] and by_name != by_sound[0]:
        key, how = by_name, f"name '{alias.strip()}' (sound {sound})"  # the name is more specific within the family
    elif by_sound:
        key, how = by_sound[0], f"sound {sound}"
    elif by_name:
        key, how = by_name, f"name '{alias.strip()}'"
    else:
        key = next((k for k, p in INST.items() if program is not None and program in p["gm"]), None)
        how = f"GM program {program}" if key else "no match: piano"
        key = key or "piano"
    bare = norm(names).strip()
    if key == "basses" and has_voices and bare in ("bass", "basses", "basso", "bassi"):
        key = "bass_choir"
    if key == "alto_choir" and not has_voices:
        key = "violas"
    if " solo " in norm(names):
        key = {"violins": "violin_solo", "violas": "viola_solo", "cellos": "cello_solo", "basses": "contrabass_solo",
               "soprano_choir": "soprano_voice", "alto_choir": "alto_voice", "tenor_choir": "tenor_voice", "bass_choir": "bass_voice"}.get(key, key)
    return key, None, how


def preset_for(part, has_voices):
    ins = part.getInstrument(returnDefault=False)
    names = " ".join(x for x in [part.partName, getattr(ins, "instrumentName", None), getattr(ins, "partName", None)] if x)
    notes = list(part.flatten().notes)
    unpitched = sum(1 for n in notes if "Unpitched" in type(n).__name__ or "Percussion" in type(n).__name__)
    return map_part(names, getattr(ins, "instrumentSound", None), getattr(ins, "midiProgram", None), unpitched / max(1, len(notes)), has_voices)


def tempo_word(text, words):
    t = norm(text).strip()
    best = None
    for w, bpm in words.items():
        if re.search(rf"\b{re.escape(w)}\b", t) and (best is None or len(w) > len(best[0])):
            best = (w, bpm)
    return best[1] if best else None


VOWEL_LETTERS = "aeiouyäöüéèêëàâáíîïóôúûœæ"
SINGLE_VOWEL = {"a": "a", "à": "a", "â": "a", "á": "a", "e": "e", "é": "e", "è": "e", "ê": "e", "ë": "e", "ä": "e", "æ": "e",
                "œ": "e", "ö": "e", "i": "i", "î": "i", "ï": "i", "í": "i", "y": "i", "ü": "i", "o": "o", "ô": "o", "ó": "o",
                "u": "u", "û": "u", "ú": "u"}
DIGRAPH_VOWEL = {"eu": "o", "äu": "o", "oi": "o", "oy": "o", "ei": "a", "ai": "a", "ay": "a", "au": "a", "ie": "i", "ee": "i",
                 "oo": "u", "ou": "u", "ae": "e", "oe": "e"}


def vowel_of(text, prev):
    """The vowel a singer holds on a syllable (German, Latin, Italian, French, English spelling, roughly)."""
    t = (text or "").lower()
    m = re.search(f"[{VOWEL_LETTERS}]+", t)
    if not m:
        return prev
    run = m.group(0)
    if run[0] == "y" and len(run) > 1:
        run = run[1:]
    return DIGRAPH_VOWEL.get(run[:2]) or SINGLE_VOWEL.get(run[0], prev)


def off_in(el, score):
    try:
        return q(el.getOffsetInHierarchy(score))
    except Exception:  # noqa: BLE001
        return None


def collect_part(part, preset, family, tok, bar_of, fermata_bars, score):
    """Notes of one part (unexpanded score): {on, dur, pitches, names, arts, grace, cls}, and its dynamics marks."""
    flat = part.flatten()
    slurred = set()
    for el in flat.notes:
        for sp in el.getSpannerSites():
            if type(sp).__name__ == "Slur" and sp.getFirst() is not el:
                slurred.add(id(el))
    # technique changes from text: pizz./arco, mutes
    tech_marks = []
    for t in part.recurse().getElementsByClass("TextExpression"):
        c = norm(t.content)
        off = off_in(t, score)
        if off is None:
            continue
        if " pizz" in c:
            tech_marks.append((off, "pizz", True))
        if " arco " in c or " col arco" in c:
            tech_marks.append((off, "pizz", False))
        if re.search(r" (con sord|mit dampfer|avec sourdine|sord )", c) and "senza" not in c and "ohne" not in c:
            tech_marks.append((off, "sord", True))
        if re.search(r" (senza sord|ohne dampfer|sans sourdine|via sord)", c):
            tech_marks.append((off, "sord", False))
    tech_marks.sort(key=lambda x: x[0])

    def tech_at(off):
        st = {"pizz": False, "sord": False}
        for o, k, v in tech_marks:
            if o <= off + F(1, 64):
                st[k] = v
        return st

    accents = set()
    marks = []  # (offset, value) dynamics, and hairpin starts '<' '>'
    for d in part.recurse().getElementsByClass("Dynamic"):
        off = off_in(d, score)
        if off is None:
            continue
        v = str(d.value).lower()
        if v in ACCENT_DYN:
            accents.add(off)
        v2 = LEVEL_MAP.get(v, v)
        if v2 in LEVELS:
            marks.append((off, v2))
    for t in part.recurse().getElementsByClass("TextExpression"):
        c = norm(t.content)
        off = off_in(t, score)
        if off is None:
            continue
        if re.search(r" (cresc|crescendo|cr) ", c):
            marks.append((off, "<"))
        elif re.search(r" (dim|dimin|diminuendo|decresc|decrescendo|smorz|morendo|calando) ", c):
            marks.append((off, ">"))
    for sp in part.spannerBundle if hasattr(part, "spannerBundle") else []:
        if isinstance(sp, (m21.dynamics.Crescendo, m21.dynamics.Diminuendo)):
            a, b = sp.getFirst(), sp.getLast()
            if a is not None and b is not None:
                oa, ob = off_in(a, score), off_in(b, score)
                if oa is not None and ob is not None and ob > oa:
                    marks.append((oa, "<" if isinstance(sp, m21.dynamics.Crescendo) else ">"))
    marks.sort(key=lambda x: x[0])

    out, pend = [], []
    pitched = tok is None
    sung = family == "voices"
    vowel = "a" if sung else None
    open_ties = {}  # midi -> note record still tied forward
    for el in flat.notes:
        on = q(el.offset)
        if sung and getattr(el, "lyrics", None):
            vowel = vowel_of(el.lyrics[0].text, vowel)
        # ties: a note that continues a tied note extends it instead of sounding again
        if pitched and not el.duration.isGrace and len(el.pitches) == 1:
            tie = el.tie.type if el.tie is not None else None
            m = el.pitches[0].midi
            held = open_ties.get(m)
            if tie in ("stop", "continue") and held is not None and held["on"] + held["dur"] == on:
                held["dur"] += q(el.quarterLength)
                if any(type(e).__name__ == "Fermata" for e in el.expressions):
                    fermata_bars.add(bar_of(on))
                if tie == "stop":
                    del open_ties[m]
                continue
        if el.duration.isGrace:
            if pitched:
                pend += [p.midi for p in el.pitches]
            continue
        dur = q(el.quarterLength)
        if dur <= 0:
            continue
        arts = set()
        for a in el.articulations:
            n = type(a).__name__
            if n in ("Staccato", "Staccatissimo", "Spiccato"):
                arts.add("^")
            elif n in ("Accent", "StrongAccent"):
                arts.add("!")
        if on in accents:
            arts.add("!")
        if id(el) in slurred:
            arts.add("_")
        reps = None
        for e in el.expressions:
            n = type(e).__name__
            if n == "Fermata":
                fermata_bars.add(bar_of(on))
            elif n == "Tremolo":
                marksN = getattr(e, "numberOfMarks", 3) or 3
                if marksN >= 3:
                    arts.add("~")  # unmeasured: a bowed tremolo or a roll
                else:
                    unit = F(1, 2) / (2 ** (marksN - 1))
                    if dur > unit:
                        reps = unit
            elif "Trill" in n:
                arts.add("~" if family == "percussion" else "t")
        tech = tech_at(on)
        if family == "strings" and tech["pizz"]:
            cls = "pizz"
        elif tech["sord"] and family in ("strings", "brass"):
            cls = "sord"
        else:
            cls = ""
        if pitched:
            ps = sorted(el.pitches, key=lambda p: p.midi)
            pitches = [p.midi for p in ps]
            names = [p.nameWithOctave.replace("-", "b") for p in ps]
        else:
            pitches, names = [0], [tok]
        grace, pend = pend, []
        base = {"pitches": pitches, "names": names, "cls": cls, "vowel": vowel}
        if "t" in arts and pitched and len(pitches) == 1:
            arts.discard("t")
            # the upper note is the next note of the key (a semitone or a whole step up)
            up = el.pitches[0].transpose(2)
            try:
                ks = el.getContextByClass("KeySignature")
                if ks is not None:
                    sc = ks.getScale("major")
                    nxt = sc.nextPitch(el.pitches[0])
                    if nxt is not None and 1 <= nxt.midi - el.pitches[0].midi <= 2:
                        up = nxt
            except Exception:  # noqa: BLE001
                pass
            step = F(1, 8)
            n = max(2, int(dur / step))
            for k in range(n):
                d = step if k < n - 1 else dur - step * (n - 1)
                mid = pitches[0] if k % 2 else up.midi
                nm = names[0] if k % 2 else up.nameWithOctave.replace("-", "b")
                out.append({**base, "on": on + step * k, "dur": d, "pitches": [mid], "names": [nm], "arts": "".join(sorted(arts - {"_"})) + ("_" if k else ""), "grace": grace if k == 0 else []})
            continue
        arts.discard("t")
        if reps:
            n = int(dur / reps)
            for k in range(n):
                out.append({**base, "on": on + reps * k, "dur": reps, "arts": "".join(sorted(arts - {"_"} if k else arts)), "grace": grace if k == 0 else []})
            continue
        rec = {**base, "on": on, "dur": dur, "arts": "".join(sorted(arts)), "grace": grace}
        out.append(rec)
        if pitched and len(pitches) == 1 and el.tie is not None and el.tie.type in ("start", "continue"):
            open_ties[pitches[0]] = rec
    return out, marks


def merge_chords(notes):
    merged = {}
    for nt in notes:
        k = (nt["on"], nt["dur"], nt["arts"], nt["cls"], nt["vowel"])
        g = merged.setdefault(k, {**nt, "pitches": [], "names": [], "grace": []})
        for p, n in zip(nt["pitches"], nt["names"]):
            if p not in g["pitches"]:
                g["pitches"].append(p)
                g["names"].append(n)
        g["grace"] += [x for x in nt["grace"] if x not in g["grace"]]
    groups = list(merged.values())
    for g in groups:
        order = sorted(range(len(g["pitches"])), key=lambda i: g["pitches"][i])
        g["pitches"] = [g["pitches"][i] for i in order]
        g["names"] = [g["names"][i] for i in order]
    return sorted(groups, key=lambda g: (g["on"], -g["dur"], -g["pitches"][-1]))


def lanes(groups):
    out = []
    for g in groups:
        for L in out:
            if L["end"] <= g["on"]:
                L["items"].append(g)
                L["end"] = g["on"] + g["dur"]
                break
        else:
            out.append({"end": g["on"] + g["dur"], "items": [g]})
    return [L["items"] for L in out]


def section_tokens(items, q0, q1, bar_len, spq):
    """Bars of tokens for one lane between quarter offsets q0 and q1 (whole bars of bar_len)."""
    spb = int(bar_len * spq)
    nb = int((q1 - q0) / bar_len)
    bars = [[] for _ in range(nb)]
    used = [0] * nb

    def emit(start, length, tok, cont):
        s, left, first = start, length, True
        while left > 0:
            b = s // spb
            n = min(left, (b + 1) * spb - s)
            if first and not cont:
                bars[b].append(tok(n))
            else:
                bars[b].append(f"-:{n}" if n > 1 else "-")
            first = False
            used[b] += n
            s += n
            left -= n

    def rest(start, length):
        s, left = start, length
        while left > 0:
            b = s // spb
            n = min(left, (b + 1) * spb - s)
            bars[b].append(f".:{n}" if n > 1 else ".")
            used[b] += n
            s += n
            left -= n

    pos = 0
    total = nb * spb
    for g in items:
        a, e = g["on"], g["on"] + g["dur"]
        if e <= q0 or a >= q1:
            continue
        st = max(0, round((a - q0) * spq))
        en = min(total, round((min(e, q1) - q0) * spq))
        if st < pos:
            st = pos
        if en <= st:
            continue
        if st > pos:
            rest(pos, st - pos)
        cont = a < q0
        body = g["names"][0] if len(g["names"]) == 1 else "[" + " ".join(g["names"]) + "]"
        grace = "{" + " ".join(m21.pitch.Pitch(midi=x).nameWithOctave.replace("-", "b") for x in g["grace"]) + "}" if g["grace"] and not cont else ""
        arts = g["arts"] + (f"@{g['vowel']}" if g.get("vowel") else "")
        emit(st, en - st, lambda n, body=body, grace=grace, arts=arts: f"{grace}{body}{':' + str(n) if n > 1 else ''}{arts}", cont)
        pos = en
    if pos < total:
        rest(pos, total - pos)
    for b in range(nb):
        assert used[b] == spb, (b, used[b], spb)
    return bars


def main():
    args = sys.argv[1:]
    src, out_path = args[0], args[1]
    opt = {}
    i = 2
    while i < len(args):
        opt[args[i].lstrip("-")] = args[i + 1]
        i += 2
    print("reading", os.path.basename(src))
    score = m21.converter.parse(src)
    title = opt.get("title") or (score.metadata.title if score.metadata and score.metadata.title else os.path.basename(src))
    composer = score.metadata.composer if score.metadata and score.metadata.composer else ""
    try:
        score = score.toSoundingPitch()
    except Exception as e:  # noqa: BLE001
        print("  sounding pitch failed:", e)
    # measures as written, then the order a performance plays them in (repeats and endings written out)
    orig = list(score.parts[0].getElementsByClass("Measure"))
    o_off = [q(m.getOffsetInHierarchy(score)) for m in orig]
    o_len = [q(m.duration.quarterLength) for m in orig]
    order = list(range(len(orig)))
    try:
        exp = score.expandRepeats().parts[0]
        idx_of = {}
        for i, m in enumerate(orig):
            idx_of.setdefault((m.number, m.numberSuffix), i)
        by_number = {}
        for i, m in enumerate(orig):
            by_number.setdefault(m.number, i)
        keys = [(m.number, m.numberSuffix) for m in exp.getElementsByClass("Measure")]
        # a repeated pass is numbered 1a, 2a ...: match the exact number and suffix first, then the number alone
        order = [idx_of.get(k, by_number.get(k[0])) for k in keys]
        order = [x for x in order if x is not None]
        if len(order) != len(orig):
            print(f"  repeats written out: {len(orig)} -> {len(order)} bars")
    except Exception as e:  # noqa: BLE001
        print("  repeats not expanded:", e)
    bars, t, occ = [], F(0), {}
    for oi in order:
        if o_len[oi] > 0:
            occ.setdefault(oi, []).append(len(bars))
            bars.append([t, o_len[oi], oi])
            t += o_len[oi]
    if "bars" in opt:
        a, b = (int(x) for x in opt["bars"].split("-"))
        keep = set(range(a - 1, b))
        occ = {oi: [k for k in ks if k in keep] for oi, ks in occ.items()}
        bars = bars[a - 1 : b]
        shift0 = bars[0][0]
    else:
        shift0 = F(0)

    def bar_of(off):
        """The written measure an offset of the unexpanded score falls in."""
        lo, hi = 0, len(o_off) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if o_off[mid] <= off:
                lo = mid
            else:
                hi = mid - 1
        return lo

    def unfold(off):
        """Every performed time of a written offset."""
        mi = bar_of(off)
        return [first_bar_start[k] + (off - o_off[mi]) for k in occ.get(mi, [])]

    first_bar_start = {}
    for k, (b0, ln, oi) in enumerate(bars):
        first_bar_start[k + (int(opt["bars"].split("-")[0]) - 1 if "bars" in opt else 0)] = b0

    # parts -> presets
    has_voices = any(" voice " in norm(str(getattr(p.getInstrument(returnDefault=False), "instrumentSound", "")).replace(".", " ")) for p in score.parts)
    fermata_bars = set()
    plan = []
    used_keys = {}
    for p in score.parts:
        key, tok, how = preset_for(p, has_voices)
        fam = INST[key]["family"]
        idx = used_keys.get(key, 0) + 1
        used_keys[key] = idx
        notes, marks = collect_part(p, key, fam, tok, bar_of, fermata_bars, score)
        notes = [{**nt, "on": t2} for nt in notes for t2 in unfold(nt["on"])]
        marks = sorted(((t2, v) for o, v in marks for t2 in unfold(o)), key=lambda x: x[0])
        plan.append({"part": p, "key": key, "tok": tok, "fam": fam, "idx": idx, "notes": notes, "marks": marks})
        print(f"  {p.partName!s:28} -> {key}{' ' + tok if tok else ''} ({how}); {len(notes)} notes")

    # tempo: metronome marks, tempo words, fermatas
    words = PRESETS["tempoWords"]
    events = []
    for mm in score.recurse().getElementsByClass("MetronomeMark"):
        off = off_in(mm, score)
        if off is None:
            continue
        if mm.number and not mm.numberImplicit:
            events.append((off, "set", float(mm.number) * float(mm.referent.quarterLength if mm.referent else 1)))
        elif mm.text:
            b = tempo_word(mm.text, words)
            if b:
                events.append((off, "set", float(b)))
    for p in score.parts[:1] + score.parts[1:]:
        for t in p.recurse().getElementsByClass("TextExpression"):
            c = norm(t.content)
            off = off_in(t, score)
            if off is None:
                continue
            if re.search(r" (tempo i|tempo primo|tempo 1|1 tempo) ", c):
                events.append((off, "primo", 0))
            elif " a tempo " in c:
                events.append((off, "atempo", 0))
            elif re.search(r" (rit|ritard|ritardando|rall|rallentando|allargando) ", c):
                events.append((off, "rit", 0))
            elif re.search(r" (accel|accelerando|stringendo|piu mosso|piu animato) ", c):
                events.append((off, "accel", 0))
            elif re.search(r" (recit|recitativo|recitative|recitatif|recitativ) ", c) and " in tempo " not in c:
                events.append((off, "recit", 0))  # sung recitative: free, at about speaking pace
            else:
                b = tempo_word(t.content, words)
                if b and len(c.split()) <= 4:
                    events.append((off, "word", float(b)))
    # a tempo word printed with a metronome mark (Allegro con brio, half note = 108) is the same instruction
    set_at = {o for o, k, v in events if k == "set"}
    events = [(o, k, v) for o, k, v in events if not (k == "word" and any(abs(o - x) <= 1 for x in set_at))]
    events = sorted(((t2, k, v) for o, k, v in events for t2 in unfold(o)), key=lambda x: x[0])
    first_set = next((v for o, k, v in events if k == "set"), None)
    base = float(opt.get("tempo") or first_set or next((v for o, k, v in events if k == "word"), 120))
    if opt.get("tempo"):
        events = [e for e in events if not (e[1] == "set" and e[0] == 0)]
    scale = base / (first_set or base)
    primo, cur, ramp = base, base, None
    bar_bpm = []
    ev_i = 0
    for bi, (b0, ln, oi) in enumerate(bars):
        while ev_i < len(events) and events[ev_i][0] < b0 + ln / 2:
            o, kind, v = events[ev_i]
            if kind == "set":
                cur = v * scale if o > 0 else base
                ramp = None
            elif kind == "word":
                cur = v * scale if first_set else v
                ramp = None
            elif kind == "primo":
                cur, ramp = primo, None
            elif kind == "atempo":
                cur = ramp[2] if ramp else cur
                ramp = None
            elif kind == "rit":
                ramp = (bi, -0.1, cur)
            elif kind == "accel":
                ramp = (bi, 0.07, cur)
            elif kind == "recit":
                cur, ramp = min(cur, 100.0), None
            ev_i += 1
        bpm = cur
        if ramp:
            k = min(3, bi - ramp[0] + 1)
            bpm = ramp[2] * (1 + ramp[1] * k)
        if oi in fermata_bars:
            bpm *= 0.5
        bar_bpm.append(round(bpm, 2))
    print(f"tempo: base {base:.0f} quarter notes per minute; {len(fermata_bars)} bars with fermatas")

    # lanes per part and technique
    lane_items, lane_info = {}, {}
    for pl in plan:
        abbr = ABBR.get(pl["key"], pl["key"][:4])
        name0 = f"{abbr}{pl['idx']}" if used_keys[pl["key"]] > 1 else abbr
        by = {}
        for nt in pl["notes"]:
            by.setdefault(nt["cls"], []).append(nt)
        for cls, notes in by.items():
            groups = merge_chords(notes)
            for li, items in enumerate(lanes(groups)):
                nm = name0 + ("_" + cls if cls else "") + ("" if li == 0 else "abcdefghij"[li])
                lane_items[nm] = items
                lane_info[nm] = (pl, cls)
    print(f"{len(lane_items)} lanes")

    # per-part dynamics per bar
    def dyn_cells(marks):
        cells, cur = [], "mf"
        for b0, ln, _oi in bars:
            hair = ""
            for o, v in marks:
                if o < b0 + ln / 2 and v in LEVELS:
                    cur = v
                if b0 <= o < b0 + ln and v in "<>":
                    hair = v
            cells.append((cur, hair))
        return cells

    part_dyn = {id(pl["part"]): dyn_cells(pl["marks"]) for pl in plan}

    # sections: runs of up to 4 bars with the same length
    secs, i = [], 0
    while i < len(bars):
        j = i + 1
        while j < len(bars) and j - i < 4 and bars[j][1] == bars[i][1]:
            j += 1
        secs.append((i, j))
        i = j
    sections, form, seen = {}, [], {}
    for si, (a, b) in enumerate(secs):
        q0, ln = bars[a][0], bars[a][1]
        q1 = bars[b - 1][0] + bars[b - 1][1]
        den = ln.denominator
        for items in lane_items.values():
            for g in items:
                if g["on"] + g["dur"] > q0 and g["on"] < q1:
                    for x in (max(g["on"], q0) - q0, min(g["on"] + g["dur"], q1) - q0):
                        den = den * x.denominator // math.gcd(den, x.denominator)
        spq = den if den <= 48 else 48
        sec = {"bars": b - a, "meter": [float(ln) if ln.denominator != 1 else int(ln), 4], "grid": int(ln * spq), "parts": {}, "dyn": {}}
        tempos = bar_bpm[a:b]
        sec["tempo"] = "| " + " | ".join(f"{x:g}" for x in tempos) + " |"
        for nm, items in lane_items.items():
            toks = section_tokens(items, q0, q1, ln, spq)
            if any(re.search(r"[^.\s:\d|]", " ".join(t)) for t in toks) and any(any(not x.startswith(".") for x in t) for t in toks):
                sec["parts"][nm] = "| " + " | ".join(" ".join(t) for t in toks) + " |"
                cells = part_dyn[id(lane_info[nm][0]["part"])][a:b]
                prev, out = None, []
                for k, (lv, hair) in enumerate(cells):
                    out.append(f"{lv}{hair}" if (k == 0 or lv != prev or hair) else "-")
                    prev = lv
                sec["dyn"][nm] = "| " + " | ".join(out) + " |"
        key = json.dumps(sec, sort_keys=True)
        if si == len(secs) - 1:
            name = "end"
        elif key in seen:
            name = seen[key]
        else:
            name = f"m{a + 1}"
            seen[key] = name
        sections.setdefault(name, sec)
        form.append(name)

    # parts and instruments
    instruments, parts = {}, {}
    count_by_key = {}
    for nm, (pl, cls) in lane_info.items():
        key = pl["key"]
        if cls == "pizz" and key + "_pizz" in INST:
            key = key + "_pizz"
        if cls == "sord" and key == "trumpet":
            key = "muted_trumpet"
        p = INST[key]
        spec = dict(p["spec"], rangeName=key)
        instruments[key] = spec
        n_same = used_keys[pl["key"]]
        pan = p["pan"]
        if n_same > 1:
            if p["family"] == "strings":
                pan = p["pan"] + (pl["idx"] - 1) * 0.28 * (1 if p["pan"] < 0 else -1)
            else:
                pan = p["pan"] + (pl["idx"] - (n_same + 1) / 2) * 0.12
        fx = list(p["fx"])
        if cls == "sord" and pl["fam"] == "strings":
            fx.append(["eq", [["lp", 3200, 0.7], ["peak", 1500, 1.0, -3]]])
        if cls == "sord" and key == "horn":
            fx.append(["eq", [["hp", 400, 0.7], ["peak", 1800, 1.2, 5], ["lp", 4500, 0.7]]])
        parts[nm] = {"inst": key, "gain": p["gain"], "pan": round(max(-0.9, min(0.9, pan)), 2), "sends": {"hall": p["send"]}, "fx": fx,
                     "humanize": 0.006, "velVar": 0.05}

    first = bars[0][1]
    out = [
        f"// {title}{' - ' + composer if composer else ''}.",
        f"// Imported by tools/import_orchestra.py from {os.path.basename(src)}: {len(bars)} bars, {len(score.parts)} parts, {len(lane_items)} lanes,",
        f"// {sum(len(v) for v in lane_items.values())} notes and chords; {len(form)} sections of up to 4 bars, {len(sections)} of them distinct.",
        "export default {",
        f"  title: {json.dumps(title)},",
        f"  style: {json.dumps('Orchestra: ' + (composer or 'imported score'))},",
        f"  bpm: {bar_bpm[0]:g}, meter: [{float(first) if first.denominator != 1 else int(first)}, 4], grid: 16, key: {json.dumps(opt.get('key', ''))}, seed: 5, tail: 4,",
        f"  source: {json.dumps(opt.get('source', os.path.basename(src)))},",
        f"  instruments: {json.dumps(instruments)},",
        f"  parts: {json.dumps(parts)},",
        f"  buses: {json.dumps({'hall': PRESETS['hall']})},",
        f"  master: {json.dumps(PRESETS['master'])},",
        f"  stage: {json.dumps(PRESETS['stage'])},",
        "  sections: {",
    ]
    for name, sec in sections.items():
        out.append(f"    {name}: {{ bars: {sec['bars']}, meter: {json.dumps(sec['meter'])}, grid: {sec['grid']}, tempo: '{sec['tempo']}',")
        out.append("      parts: {")
        for lane, txt in sec["parts"].items():
            out.append(f"        {lane}: '{txt}',")
        out.append("      },")
        out.append("      dyn: { " + ", ".join(f"{lane}: '{txt}'" for lane, txt in sec["dyn"].items()) + " },")
        out.append("    },")
    out.append("  },")
    out.append(f"  form: {json.dumps(form)},")
    out.append("};")
    open(out_path, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print("wrote", out_path, os.path.getsize(out_path), "bytes")


if __name__ == "__main__":
    main()
