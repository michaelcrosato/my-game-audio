# The /goal for Claude Code

Paste the block below into Claude Code, opened on this repository, in auto mode so it doesn't stop for permission
prompts. `/goal` keeps Claude working turn after turn until a separate model, reading the conversation, judges the
condition met (or impossible); the condition is limited to 4,000 characters. Run `/goal` alone to see its status and
`/goal clear` to stop it.

```text
/goal Grow this repo, my-game-audio, from its seed prototype into the library LLM agents use to give games music, sound effects and voices written entirely as code, with no audio files. If the seed pull request (#1) is still open, review it and merge it first. Read CLAUDE.md and docs/HANDOFF.md before anything else: HANDOFF.md lists what exists with its measured numbers, the known gaps, and milestones M0 to M6 with acceptance checks. Work through the milestones in order, one or more pull requests per milestone, merging each once its checks pass and ticking its boxes in docs/HANDOFF.md in the same pull request. Follow CLAUDE.md's rules throughout: no audio files, samples or reference recordings in the repo; no runtime dependencies in the engine; deterministic renders; only CC0 or public-domain scores committed, with source and licence recorded.

The goal is met when this conversation shows all of the following, with command output or links as evidence:
1. On main, `npm test` exits 0 and `npm run check` passes. The tests cover the score parser and critic, golden render hashes, loop seams, streamed against whole renders, the JavaScript MusicXML importer against tools/import_orchestra.py on both Beethoven scores, and sound-effect and voice generation. GitHub Actions runs them and is green on main.
2. dist/my-game-audio.js, one dependency-free file, gives a game a player: looping music with intro and loop sections, crossfades and section changes on the next bar, layers, stingers and beat callbacks, plus sound effects and Animalese-style gibberish voices, all through music, sfx and voice buses with volume, mute and ducking, with rendered music cached.
3. The demo page runs on that player. A headless-browser test shows music starting within 2 seconds, a loop seam with no gap or click, a MusicXML file dropped on the page playing without Python, and no console errors.
4. docs/AI_GUIDE.md teaches an agent to write and check game audio with the library, and songs/ holds original loopable cue sets (title, menu, exploration, town, dungeon, battle, boss, victory, defeat, ambience) in at least three styles, each passing the checks and the JavaScript ears.
5. Every acceptance box from M0 to M5 in docs/HANDOFF.md is ticked, or left unticked with a written reason under it; only the sound-quality targets in M4 may end that way.
6. Draft pull requests are open, not merged, in michaelcrosato/my-3d2dge (an adapter so game.audio plays my-game-audio songs, following that repo's CLAUDE.md) and michaelcrosato/my-game-matrix (an aud-code-v4 audio variant pointing agents at my-game-audio).

End each turn with progress against this list. If it isn't met after 300 turns, stop and report what remains.
```
