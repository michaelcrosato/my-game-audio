// my-game-audio's public API: everything a game, a tool or an agent needs, from one module.
// docs/API.md describes each export; anything not exported here is internal and may change without notice.
export { VERSION } from './version.mjs';
export { SR, rng, hash, mtof, db } from './dsp.mjs';
export {
  parseLine, parseChord, parseChords, noteToMidi, midiToName,
  voiceLead, padLine, arpLine, bassLine, repeat, transposeLine,
  arrange, critic,
} from './score.mjs';
export { renderSong, renderStream, streamable, wav } from './render.mjs';
export { renderCue, renderOnce, cuesOf, layersOf, cueTiming, estimateNorm, freeze, cueKey } from './loop.mjs';
export { createPlayer } from './player.mjs';
export { renderSfx, sfxLoudness, SFX_TYPES } from './sfx.mjs';
export { SOUNDS, soundNames } from './sounds.mjs';
export { speak, syllables, VOICES, EMOTIONS } from './voice.mjs';
export { build, BUILDERS, RANGES } from './instruments.mjs';
export { presetSpec, PRESETS } from './orchestra.mjs';
export { lufs } from './fx.mjs';
