"""Mapping report: which preset every part of every MusicXML score would get, read fast from the part list.
usage: python3 -I tools/mxl_parts.py FILE.mxl [FILE.mxl ...]"""
import os
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_orchestra import map_part, norm  # noqa: E402


def read_xml(path):
    if path.endswith(".mxl"):
        z = zipfile.ZipFile(path)
        name = None
        if "META-INF/container.xml" in z.namelist():
            c = ET.fromstring(z.read("META-INF/container.xml"))
            rf = c.find(".//rootfile")
            name = rf.get("full-path") if rf is not None else None
        name = name or next(n for n in z.namelist() if n.endswith((".xml", ".musicxml")) and not n.startswith("META-INF"))
        return ET.fromstring(z.read(name))
    return ET.parse(path).getroot()


def parts_of(root):
    out = []
    for sp in root.iter("score-part"):
        pid = sp.get("id")
        names = " ".join(x.text or "" for x in [sp.find("part-name"), sp.find("part-abbreviation"), sp.find(".//instrument-name")] if x is not None)
        snd = sp.find(".//instrument-sound")
        prog = sp.find(".//midi-program")
        out.append({"id": pid, "name": (sp.findtext("part-name") or "").strip(), "names": names, "sound": snd.text if snd is not None else None,
                    "program": int(prog.text) - 1 if prog is not None and prog.text else None})
    counts = {}
    for part in root.iter("part"):
        pitched = unp = 0
        for n in part.iter("note"):
            if n.find("pitch") is not None:
                pitched += 1
            elif n.find("unpitched") is not None:
                unp += 1
        counts[part.get("id")] = (pitched, unp)
    for p in out:
        pi, un = counts.get(p["id"], (0, 0))
        p["unpitched"] = un / max(1, pi + un)
        p["notes"] = pi + un
    return out


tally = Counter()
rows = []
for path in sys.argv[1:]:
    root = read_xml(path)
    ps = parts_of(root)
    has_voices = any((p["sound"] or "").startswith("voice") for p in ps)
    for p in ps:
        key, tok, how = map_part(p["names"], p["sound"], p["program"], p["unpitched"], has_voices)
        label = f"{key}{'.' + tok if tok else ''}"
        tally[label] += 1
        rows.append((os.path.basename(path), p["name"], p["sound"], label, how, p["notes"]))
w = max(len(r[1]) for r in rows)
seen = set()
for f, name, snd, label, how, n in rows:
    k = (name, snd, label)
    if k in seen:
        continue
    seen.add(k)
    print(f"{name:{w}}  {str(snd):34} -> {label:22} {how}")
print()
print(len(sys.argv) - 1, "scores,", len(rows), "parts,", len(tally), "presets used")
print(", ".join(f"{k} {v}" for k, v in tally.most_common()))
