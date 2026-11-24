// my-game-audio's public API: everything a game, a tool or an agent needs, from one module.
// docs/API.md describes each export; anything not exported here is internal and may change without notice.
export { VERSION } from './version.mjs';
export { SR, rng, hash, mtof, db } from './dsp.mjs';
export {
  parseLine, parseChord, parseChords, noteToMidi, midiToName,
  voiceLead, padLine, arpLine, bassLine, repeat, transposeLine,
  arrange, critic, TECHNIQUES,
} from './score.mjs';
export { renderSong, renderStream, streamable, wav, renderPart } from './render.mjs';
export { renderCue, renderCueParallel, renderOnce, cuesOf, layersOf, cueTiming, estimateNorm, freeze, cueKey } from './loop.mjs';
export { renderSongParallel, partJob, partTransfer } from './parallel.mjs';
export { stageTaps, SEATS } from './stage.mjs';
export { createPlayer } from './player.mjs';
export { renderSfx, sfxLoudness, SFX_TYPES } from './sfx.mjs';
export { SOUNDS, SOUND_CATEGORIES, soundNames } from './sounds.mjs';
export { speak, syllables, voiceFor, VOICES, EMOTIONS } from './voice.mjs';
export { importMusicXML, readMusicXMLText, playOrder, mapPart } from './musicxml.mjs';
export { importMidi, exportMidi, parseMidi } from './midi.mjs';
export { importABC, importABCBook, partOrder, songText } from './abc.mjs';
export { importKern, readKern } from './kern.mjs';
export { importScore, scoreFormat } from './importers.mjs';
export { build, BUILDERS, RANGES } from './instruments.mjs';
export { presetSpec, PRESETS } from './orchestra.mjs';
export { lufs } from './fx.mjs';
export { ears, checkAudio } from './ears.mjs';
