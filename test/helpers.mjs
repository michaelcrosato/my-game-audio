// Shared by the tests and tools/golden.mjs: the song list, the short excerpt every song is checked on, and hashes.
import { readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const SONGS_DIR = new URL('../songs/', import.meta.url);
export const songNames = () => readdirSync(SONGS_DIR).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
export const loadSong = async (name) => (await import(new URL(`${name}.mjs`, SONGS_DIR))).default;

/** The first two sections of the form, with every effect, bus and the master chain: what the golden hashes cover. */
export const excerpt = (song) => ({ ...song, form: song.form.slice(0, 2), tail: 1.5 });
/** The same excerpt with no send buses (no reverb or delay), where streamed and whole renders should agree closely. */
export function dry(song) {
  const parts = Object.fromEntries(Object.entries(song.parts).map(([k, p]) => [k, { ...p, sends: {} }]));
  return { ...excerpt(song), parts, buses: {} };
}

/** SHA-256 of a render's samples (32-bit floats, left then right). */
export const sha256 = (L, R) => createHash('sha256').update(Buffer.from(L.buffer, L.byteOffset, L.byteLength)).update(Buffer.from(R.buffer, R.byteOffset, R.byteLength)).digest('hex');

/** Energy of a - b relative to a, in dB. */
export function diffDb(aL, aR, bL, bR) {
  let e = 0, d = 0;
  for (let i = 0; i < aL.length; i++) {
    e += aL[i] ** 2 + aR[i] ** 2;
    d += (aL[i] - bL[i]) ** 2 + (aR[i] - bR[i]) ** 2;
  }
  return 10 * Math.log10(d / (e || 1) + 1e-30);
}
