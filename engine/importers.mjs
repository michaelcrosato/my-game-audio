// importers.mjs: any score file to a song. MusicXML (.mxl, .musicxml), MIDI (.mid), ABC (.abc) or Humdrum **kern
// (.krn), told apart by their first bytes, all laid out the same way (engine/musicxml.mjs buildSong).
import { importMusicXML } from './musicxml.mjs';
import { importMidi } from './midi.mjs';
import { importABC, importABCBook } from './abc.mjs';
import { importKern } from './kern.mjs';

/** The format of a score file: 'midi', 'abc', 'kern' or 'musicxml'. */
export function scoreFormat(input) {
  if (typeof input !== 'string') {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (b[0] === 0x4d && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64) return 'midi'; // MThd
    if (b[0] === 0x50 && b[1] === 0x4b) return 'musicxml'; // a zip: .mxl
    input = new TextDecoder().decode(b.subarray(0, 4096));
  }
  const head = input.replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('<')) return 'musicxml';
  if (/^\*\*kern\b/m.test(input)) return 'kern';
  if (/^(X|T|%abc)/m.test(head) && /^K:/m.test(input)) return 'abc';
  return 'musicxml';
}

/**
 * Import a score of any of the four formats: { song, text, report, format }. Options as for importMusicXML,
 * importMidi, importABC and importKern.
 */
export async function importScore(input, opt = {}) {
  const format = scoreFormat(input);
  let r;
  if (format === 'midi') r = importMidi(input, opt);
  else if (format === 'kern') r = importKern(typeof input === 'string' ? input : new TextDecoder().decode(input), opt);
  else if (format === 'abc') {
    const text = typeof input === 'string' ? input : new TextDecoder().decode(input);
    // several tunes, or cue directives: a songbook of cues
    const book = (text.match(/^X:/gm) ?? []).length > 1 || /^%%\s*(cue|stinger)\b/m.test(text);
    r = book && opt.index == null ? importABCBook(text, opt) : importABC(text, opt);
  }
  else r = await importMusicXML(input, opt);
  return { ...r, format };
}
