# AGENTS.md

my-game-audio is music, sound effects and voices for games, written as code: the music as sheet music (ABC), the
effects and voices as data. One dependency-free file, `dist/my-game-audio.js`, renders them in the browser. There
are no audio files.

What are you here to do?

- **Build a game that uses it:** read [docs/GAMES.md](docs/GAMES.md). It covers the file to include, the code that
  plays music, effects and voices, a songbook template, the command that checks your music, and the library's 221
  sound effects.
- **Compose or check music:** [docs/AI_GUIDE.md](docs/AI_GUIDE.md) teaches it; [docs/API.md](docs/API.md) has every
  signature. `node tools/ears.mjs music.abc` checks a score or songbook and prints PASS or FAIL.
- **Change this repository:** [CLAUDE.md](CLAUDE.md) holds the rules (no audio files, deterministic renders, golden
  hashes, tests before a pull request), and [docs/HANDOFF.md](docs/HANDOFF.md) says what exists and what to build
  next.

Cloning this repository only to run its checks needs no install, and changes nothing here. The rules in CLAUDE.md are
for work on this repository, not for the game you are building.
