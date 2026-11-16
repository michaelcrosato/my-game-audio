// Compare two song files made from the same score (the JavaScript and Python MusicXML importers): every field,
// with note names compared by pitch (the importers may spell a transposed note differently).
// usage: node tools/compare_import.mjs a.mjs b.mjs
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { noteToMidi, midiToName } from '../engine/score.mjs';

export const byPitch = (line) => line.replace(/([A-G][#b]{0,2})(-?\d)(?![\w])/g, (m) => {
  const x = noteToMidi(m);
  return x == null ? m : midiToName(x);
});

/** The differences between two songs, as readable lines (none: they match). `ignore` lists top-level fields to skip. */
export function compareSongs(a, b, { ignore = ['source'] } = {}) {
  const out = [];
  const cmp = (x, y, path) => {
    if (out.length > 40) return;
    if (typeof x === 'string' && typeof y === 'string') {
      if (byPitch(x) !== byPitch(y)) out.push(`${path}:\n    ${byPitch(x)}\n    ${byPitch(y)}`);
      return;
    }
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      const ka = Object.keys(x), kb = Object.keys(y);
      if (Array.isArray(x) !== Array.isArray(y)) return out.push(`${path}: array against object`);
      const keys = [...new Set([...ka, ...kb])];
      if (!Array.isArray(x) && ka.join() !== kb.join() && ka.length === kb.length && keys.length === ka.length) out.push(`${path}: keys in another order`);
      for (const k of keys) {
        if (path === '' && ignore.includes(k)) continue;
        if (!(k in x)) out.push(`${path}.${k}: missing in the first`);
        else if (!(k in y)) out.push(`${path}.${k}: missing in the second`);
        else cmp(x[k], y[k], `${path}.${k}`);
      }
      return;
    }
    if (x !== y) out.push(`${path}: ${JSON.stringify(x)} against ${JSON.stringify(y)}`);
  };
  cmp(a, b, '');
  return out;
}

/** A song's fingerprint for comparing importers without keeping their output: SHA-256 of its JSON with every note
 *  name written by pitch and `source` left out. Two songs that compareSongs matches have the same digest. */
export function songDigest(song) {
  const canon = (x) => (typeof x === 'string' ? byPitch(x) : Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, canon(v)])) : x);
  const { source, ...rest } = song;
  return createHash('sha256').update(JSON.stringify(canon(rest))).digest('hex');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b] = await Promise.all(process.argv.slice(2, 4).map(async (p) => (await import(pathToFileURL(resolve(p)).href)).default));
  const d = compareSongs(a, b);
  console.log(d.length ? d.join('\n') : 'the songs match (note names compared by pitch; source ignored)');
  process.exit(d.length ? 1 : 0);
}
