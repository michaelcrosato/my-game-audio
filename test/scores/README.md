# Test scores

MusicXML scores the importer tests read. Every file here is CC0 or in the public domain; its source, licence and the
commit it was taken from are recorded below. They are read only by the importers (`engine/musicxml.mjs`,
`tools/import_orchestra.py`), never run.

| File | Work | Source | Licence | Commit |
| --- | --- | --- | --- | --- |
| `Beethoven_Op.67_1.mxl` | Beethoven, Symphony No. 5 in C minor, Op. 67, I: Allegro con brio (1808) | OpenScore Orchestra corpus, [github.com/MarkGotham/Hauptstimme](https://github.com/MarkGotham/Hauptstimme), `data/Beethoven,_Ludwig_van/Symphony_No.5,_Op.67/1/` | CC0 1.0 (the score; the corpus's annotations, not used here, are CC BY-SA) | `8f677853c45b74ca0afcd79677e5379c06c82354` |
| `Beethoven_Op.125_4.mxl` | Beethoven, Symphony No. 9 in D minor, Op. 125, IV (1824) | the same corpus, `data/Beethoven,_Ludwig_van/Symphony_No.9,_Op.125/4/` | CC0 1.0 (as above) | `8f677853c45b74ca0afcd79677e5379c06c82354` |

`songs/beethoven5.mjs` and `songs/ode.mjs` were made from these files by `tools/import_orchestra.py`; the test
checks `engine/musicxml.mjs` writes the same songs.

Scores written for the tests, CC0 1.0 (they are part of this repository, so their commit is the one that adds them):

| File | What it holds | Written by |
| --- | --- | --- |
| `features.musicxml`, `features.expected.mjs` | endings, voices, grace notes, triplets, ties, slurs, trills, tremolos, pizz., lyrics, an overfull bar; the expected song is the Python importer's output | by hand (the score) and `tools/import_orchestra.py` (the song) |
| `notation/*.musicxml` | one notation each that music21 leaves out: percussion, harmonics, glissando, ornaments, a2, breath, cue, fermata, pedal | `tools/make_notation_scores.mjs` |
