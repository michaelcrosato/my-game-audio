# The goal

## The north star

An LLM agent writes music the way people always have, as sheet music, and gets good music from it.

- **Sheet music.** The agent writes a score: one staff per instrument, notes between bar lines, dynamics,
  articulations and chord symbols on them. ABC is the way in (`docs/AI_GUIDE.md`). MusicXML, Humdrum **kern, MIDI
  and the text score format work too.
- **Good music.** The score plays as written: every voice on an instrument that suits it, in a room that suits the
  song, at a sound measured against recordings of real instruments.
- **Checked without ears.** One command reports:
  - what the import made of the score;
  - every mistake in it, with its voice, part and bar;
  - the critic's notes;
  - how the music sounds, PASS or FAIL.

  A second command renders it to a WAV:

  ```sh
  npm run ears -- quartet.abc
  node tools/render.mjs quartet.abc
  ```

Games are one place this music plays (`dist/my-game-audio.js`, the player). The sound effects and voices are extras
for them.

## The scope (the owner's word, 2026-11-17)

- All work stays in this repository. It writes to no other repository unless the owner has said so, explicitly, for
  that change. Reading other repositories is fine.
- Other projects may read from this one (`dist/`, the docs, the songs), and keep their own adapters for it.
- Everything the north star needs is here: the engine, the importers, the tools, the guide and the examples.

## History

The first `/goal` (2026-11-15) grew the seed prototype into the library through milestones M0 to M6 of
`docs/HANDOFF.md`. Its last item opened pull requests in two other repositories, a game engine's adapter and a game
brief's audio rule, which the owner merged. It was met on 2026-11-16. Its text is in git history:

```sh
git show 961235b:docs/GOAL.md
```

The work since then, M7 and after, follows the north star above.
