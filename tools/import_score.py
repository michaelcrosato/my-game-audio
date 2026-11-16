"""import_score.py: sheet music in a machine-readable format -> a song file in the engine's text format.

Any format music21 reads works: Humdrum **kern, MusicXML, MIDI, ABC. Repeats in **kern expansion lists (*>[A,A,B])
are written out. The result is ordinary text: bars of tokens per voice, a dynamics line, a pedal line, and the
instrument and mix settings as data. Edit it like any other score.

usage: python3 -I tools/import_score.py imports/moonlight.json
The config names the source file, the tempo and the sound; see imports/*.json.
"""
import json
import math
import os
import sys
from fractions import Fraction as F

import music21 as m21

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # our own helpers (the tools folder), under -I too
import kern  # noqa: E402

LEVELS = ["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"]
ENGINE_LEVELS = {"pppp": "ppp", "sfp": "p", "fp": "p"}




def q(x):
    return F(x).limit_denominator(192)


def kern_groups(notes, shift):
    """kern.read notes -> chord groups like collect(): trills written out, simultaneous equal notes merged."""
    flat = []
    for nt in notes:
        flat += kern.trill_notes(nt) if nt["trill"] else [nt]
    merged = {}
    for nt in flat:
        k = (nt["on"], nt["dur"], nt["arts"])
        name = nt["name"] or m21.pitch.Pitch(midi=nt["midi"]).nameWithOctave.replace("-", "b")
        g = merged.setdefault(k, {"on": nt["on"] + shift, "dur": nt["dur"], "pitches": [], "names": [], "arts": nt["arts"], "grace": []})
        if nt["midi"] not in g["pitches"]:
            g["pitches"].append(nt["midi"])
            g["names"].append(name)
        g["grace"] += [x for x in nt["grace"] if x not in g["grace"]]
    groups = list(merged.values())
    for g in groups:
        order = sorted(range(len(g["pitches"])), key=lambda i: g["pitches"][i])
        g["pitches"] = [g["pitches"][i] for i in order]
        g["names"] = [g["names"][i] for i in order]
    return sorted(groups, key=lambda g: (g["on"], -g["dur"], -g["pitches"][-1]))


def pitch_name(p):
    return p.nameWithOctave.replace("-", "b")


def collect(part, shift):
    """A staff's notes as groups {on, dur, pitches, arts, grace}, ties merged, trills written out, graces attached."""
    flat = part.flatten()
    try:
        flat = flat.stripTies()
    except Exception as e:  # noqa: BLE001 - keep going with tied pieces as separate notes
        print("  stripTies failed:", e)
    out, pend = [], []
    for el in flat.notes:
        on = q(el.offset) + shift
        if el.duration.isGrace:
            pend += [p.midi for p in el.pitches]
            continue
        dur = q(el.quarterLength)
        if dur <= 0:
            continue
        arts = ""
        for a in el.articulations:
            if isinstance(a, m21.articulations.Staccato) or isinstance(a, m21.articulations.Staccatissimo):
                arts += "^"
            elif isinstance(a, (m21.articulations.Accent, m21.articulations.StrongAccent)):
                arts += "!"
        arts = "".join(sorted(set(arts)))
        trill = next((x for x in el.expressions if isinstance(x, m21.expressions.Trill)), None)
        grace, pend = pend, []
        if trill is not None and isinstance(el, m21.note.Note):
            try:
                trill.quarterLength = 0.125
                pre, main, post = trill.realize(el)
                t = on
                for k, nt in enumerate(list(pre) + list(main) + list(post)):
                    d = q(nt.quarterLength)
                    out.append({"on": t, "dur": d, "pitches": [nt.pitch.midi], "names": [pitch_name(nt.pitch)], "arts": "", "grace": grace if k == 0 else []})
                    t += d
                continue
            except Exception as e:  # noqa: BLE001
                print("  trill not realized:", e)
        ps = sorted(el.pitches, key=lambda p: p.midi)
        out.append({"on": on, "dur": dur, "pitches": [p.midi for p in ps], "names": [pitch_name(p) for p in ps], "arts": arts, "grace": grace})
    # merge simultaneous groups of the same length and articulation into chords
    merged = {}
    for g in out:
        k = (g["on"], g["dur"], g["arts"])
        if k in merged:
            m = merged[k]
            for p, n in zip(g["pitches"], g["names"]):
                if p not in m["pitches"]:
                    m["pitches"].append(p)
                    m["names"].append(n)
            m["grace"] += [x for x in g["grace"] if x not in m["grace"]]
        else:
            merged[k] = {**g, "pitches": list(g["pitches"]), "names": list(g["names"]), "grace": list(g["grace"])}
    groups = list(merged.values())
    for g in groups:
        order = sorted(range(len(g["pitches"])), key=lambda i: g["pitches"][i])
        g["pitches"] = [g["pitches"][i] for i in order]
        g["names"] = [g["names"][i] for i in order]
    return sorted(groups, key=lambda g: (g["on"], -g["dur"], -g["pitches"][-1]))


def lanes(groups):
    """Greedy voice lanes: each lane is a line of non-overlapping notes and chords."""
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


def classify(g, rules):
    for name, rule in rules:
        if "dur" in rule and g["dur"] != F(rule["dur"]):
            continue
        return name
    return rules[-1][0]


def bar_tokens(items, spq, spb, nbars, midi_names):
    """One lane -> a list of bar strings."""
    bars = [[] for _ in range(nbars)]
    used = [0] * nbars

    def put(tok_body, arts, start, length, first_tok_prefix=""):
        s, left, first = start, length, True
        while left > 0:
            b = s // spb
            room = (b + 1) * spb - s
            n = min(left, room)
            if first:
                body = first_tok_prefix + tok_body
                bars[b].append((f"{body}:{n}" if n != 1 else body) + arts)
                first = False
            else:
                bars[b].append(f"-:{n}" if n != 1 else "-")
            used[b] += n
            s += n
            left -= n

    def rest(start, length):
        s, left = start, length
        while left > 0:
            b = s // spb
            room = (b + 1) * spb - s
            n = min(left, room)
            bars[b].append(f".:{n}" if n != 1 else ".")
            used[b] += n
            s += n
            left -= n

    pos = 0
    for g in items:
        st = int(g["on"] * spq)
        ln = max(1, int(g["dur"] * spq))
        if st > pos:
            rest(pos, st - pos)
        names = g["names"] if midi_names is None else [midi_names(p) for p in g["pitches"]]
        body = names[0] if len(names) == 1 else "[" + " ".join(names) + "]"
        prefix = "{" + " ".join(m21.pitch.Pitch(midi=x).nameWithOctave.replace("-", "b") for x in g["grace"]) + "}" if g["grace"] else ""
        put(body, g["arts"], st, ln, prefix)
        pos = st + ln
    if pos < nbars * spb:
        rest(pos, nbars * spb - pos)
    for b in range(nbars):
        assert used[b] == spb, (b, used[b], bars[b])
    return [" ".join(x) for x in bars]


def main(cfg_path):
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    staff_names = cfg.get("staves", ["rh", "lh"])
    staff_groups = []
    if cfg["source"].endswith(".krn"):
        notes, dyn, bar_q, pickup, order, end_t = kern.read(open(cfg["source"], encoding="utf-8").read(), cfg.get("list", ""))
        shift = bar_q - pickup if pickup else F(0)
        print(f"order {order}; bar {bar_q} q; pickup {pickup} q, shift {shift} q; music ends at {end_t} q")
        for staff in sorted(notes):  # staff 1 is the top staff
            staff_groups.append(kern_groups(notes[staff], shift))
        marks = sorted((t + shift, v) for t, v in dyn)
    else:
        score = m21.converter.parse(cfg["source"])
        ts = score.recurse().getElementsByClass("TimeSignature").first()
        bar_q = q(ts.barDuration.quarterLength)
        parts = list(score.parts)
        avg = [sum(p.midi for n in pt.flatten().notes for p in n.pitches) / max(1, sum(len(n.pitches) for n in pt.flatten().notes)) for pt in parts]
        first_q = q(parts[0].getElementsByClass("Measure")[0].duration.quarterLength)
        shift = bar_q - first_q if 0 < first_q < bar_q else F(0)
        for pi in sorted(range(len(parts)), key=lambda i: -avg[i]):  # highest first
            staff_groups.append(collect(parts[pi], shift))
        marks = sorted((q(d.getOffsetInHierarchy(score)) + shift, str(d.value)) for d in score.recurse().getElementsByClass("Dynamic"))
        print(f"time {ts.ratioString}, bar {bar_q} q; pickup shift {shift} q")

    all_groups = {}
    for si, gs in enumerate(staff_groups):
        name = staff_names[si]
        rules = cfg.get("classes", {}).get(name, [[name, {}]])
        by = {}
        for g in gs:
            by.setdefault(classify(g, rules), []).append(g)
        for cls, items in by.items():
            for li, lane in enumerate(lanes(items)):
                all_groups[cls if li == 0 else f"{cls}{li + 1}"] = lane
        print(f"  {name}: {len(gs)} groups -> {', '.join(f'{c}: {len(v)}' for c, v in by.items())}")

    # grid: steps per quarter from every onset and length
    den = 1
    for items in all_groups.values():
        for g in items:
            for x in (g["on"], g["dur"]):
                den = den * x.denominator // math.gcd(den, x.denominator)
    spq = den
    spb = int(bar_q * spq)
    end_q = max(g["on"] + g["dur"] for items in all_groups.values() for g in items)
    nbars = math.ceil(end_q / bar_q)
    print(f"grid {spq}/quarter, {spb}/bar, {nbars} bars, lanes {list(all_groups)}")

    lines = {k: bar_tokens(v, spq, spb, nbars, None) for k, v in all_groups.items()}

    # dynamics: explicit marks per bar, hairpins to the next mark
    dyn_cells, cur = [], cfg.get("dynamic", "mf")
    for b in range(nbars):
        b0, b1 = b * bar_q, (b + 1) * bar_q
        hair = ""
        for t, v in marks:
            vv = ENGINE_LEVELS.get(v, v)
            if t < b0 + bar_q / 2 and vv in LEVELS:
                cur = ENGINE_LEVELS.get(vv, vv)
            if b0 <= t < b1 and ("<" in v or ">" in v):
                hair = "<" if "<" in v else ">"
        dyn_cells.append((cur, hair))

    # pedal
    pedal_steps = set()
    if cfg.get("pedal") == "bass":
        lh = sorted((g for k, items in all_groups.items() if k.startswith(tuple(cfg.get("pedalFrom", ["lh", "bass"]))) for g in items), key=lambda g: g["on"])
        for g in lh:
            if g["dur"] >= 1 or g["on"] == int(g["on"]):
                pedal_steps.add(int(g["on"] * spq))
    pedal_bars = None
    if pedal_steps:
        pedal_bars = []
        for b in range(nbars):
            toks, pos = [], b * spb
            for s in sorted(x for x in pedal_steps if b * spb <= x < (b + 1) * spb):
                if s > pos:
                    toks.append(f".:{s - pos}" if s - pos > 1 else ".")
                toks.append("P")
                pos = s + 1
            if pos < (b + 1) * spb:
                n = (b + 1) * spb - pos
                toks.append(f".:{n}" if n > 1 else ".")
            pedal_bars.append(" ".join(toks))

    # sections of `chunk` bars; identical chunks share one section; the last chunk is its own (it carries the rit.)
    chunk = cfg.get("chunk", 4)
    sections, form, seen = {}, [], {}
    starts = list(range(0, nbars, chunk))
    for ci, b0 in enumerate(starts):
        b1 = min(nbars, b0 + chunk)
        sec = {"bars": b1 - b0, "parts": {}}
        for lane, bl in lines.items():
            seg = bl[b0:b1]
            if any(x.strip("|. :0123456789") for x in seg):
                sec["parts"][lane] = "| " + " | ".join(seg) + " |"
        cells = []
        prev = None
        for i, b in enumerate(range(b0, b1)):
            lv, hair = dyn_cells[b]
            cells.append(f"{lv}{hair}" if (i == 0 or lv != prev or hair) else "-")
            prev = lv
        sec["dyn"] = {"*": "| " + " | ".join(cells) + " |"}
        if pedal_bars:
            sec["pedal"] = "| " + " | ".join(pedal_bars[b0:b1]) + " |"
        last = ci == len(starts) - 1
        key = json.dumps(sec, sort_keys=True)
        if last:
            name = "end"
            sec["rit"] = cfg.get("rit")
            if not sec["rit"]:
                del sec["rit"]
        elif key in seen:
            name = seen[key]
        else:
            name = f"m{b0 + 1}"
            seen[key] = name
        sections.setdefault(name, sec)
        form.append(name)

    # the song file
    meta = cfg["song"]
    hdr = cfg.get("header", [])
    out = []
    out += [f"// {line}" for line in hdr]
    out.append(f"// Imported by tools/import_score.py from {os.path.basename(cfg['source'])}: {nbars} bars, {sum(len(v) for v in all_groups.values())} notes and chords;")
    out.append(f"// {len(form)} sections of up to {chunk} bars, {len(sections)} of them distinct. Steps: {spb} per bar ({spq} per quarter note).")
    out.append("export default {")
    for k in ["title", "style"]:
        out.append(f"  {k}: {json.dumps(meta[k])},")
    out.append(f"  bpm: {cfg['bpm']}, meter: [{int(bar_q)}, 4], grid: {spb}, key: {json.dumps(meta['key'])}, seed: {meta.get('seed', 7)}, tail: {meta.get('tail', 5)},")
    out.append(f"  source: {json.dumps(meta['source'])},")
    for k in ["instruments", "parts", "buses", "master"]:
        out.append(f"  {k}: {json.dumps(meta[k])},")
    out.append("  sections: {")
    for name, sec in sections.items():
        out.append(f"    {name}: {{")
        out.append(f"      bars: {sec['bars']},")
        if "rit" in sec:
            out.append(f"      rit: {json.dumps(sec['rit'])},")
        out.append("      parts: {")
        for lane, txt in sec["parts"].items():
            out.append(f"        {lane}: '{txt}',")
        out.append("      },")
        out.append(f"      dyn: {{ '*': '{sec['dyn']['*']}' }},")
        if "pedal" in sec:
            out.append(f"      pedal: '{sec['pedal']}',")
        out.append("    },")
    out.append("  },")
    out.append(f"  form: {json.dumps(form)},")
    out.append("};")
    missing = [lane for lane in lines if lane not in meta["parts"]]
    if missing:
        raise SystemExit(f"config has no part settings for lanes {missing}")
    open(cfg["out"], "w", encoding="utf-8").write("\n".join(out) + "\n")
    print("wrote", cfg["out"], os.path.getsize(cfg["out"]), "bytes")


if __name__ == "__main__":
    main(sys.argv[1])
