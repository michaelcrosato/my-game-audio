// node web/build.mjs (npm run page): writes web/index.html, the demo page. It runs on the player in
// dist/my-game-audio.js (inlined, so the page works from a file: no server, no network) and carries the songs as
// plain data (freeze(song)). Build dist first: npm run build.
import { readFileSync, writeFileSync } from 'node:fs';
import { freeze } from '../engine/loop.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const NAMES = ['chiptune', 'electronic', 'orchestral', 'rock', 'lantern_road', 'set_chiptune', 'set_synthwave', 'set_orchestral'];
const NOTES = {
  chiptune: 'NES 2A03: two pulses, a triangle and a noise channel. The noise channel is the drums layer; the tag is a stinger.',
  electronic: 'Supersaw pad, arpeggio through a ping-pong delay, octave bass; pad, bass and arp duck under the kick.',
  orchestral: 'Strings, horns, choir, harp and timpani. Two cues: the themes and the climax. The battery and the choir are layers.',
  rock: 'Double-tracked guitars through drive and a cabinet, a vibrato lead and a synthesized kit.',
  lantern_road: 'Written as sheet music: an ABC score of five tunes for chamber orchestra, imported as a cue each. The victory is a stinger.',
  set_chiptune: 'Ten cues a game needs (title, menu, exploration, town, dungeon, battle, boss, victory, defeat, ambience) for the NES.',
  set_synthwave: 'The same ten themes as synthwave: saw lead, supersaw pad, arpeggio, octave bass and a drum machine.',
  set_orchestral: 'The same ten themes for orchestra on a stage, with string techniques and a Latin choir over the boss.',
};
const songs = {};
for (const n of NAMES) {
  const s = freeze((await import(new URL(`songs/${n}.mjs`, root))).default);
  songs[n] = { ...s, note: NOTES[n] };
}
// </script> inside inlined code or data would end the tag early
const safe = (t) => t.replace(/<\/script/gi, '<\\/script');
const html = read('web/page.html')
  .replace('<script>/*DIST*/</script>', () => `<script>${safe(read('dist/my-game-audio.js'))}</script>`)
  .replace('/*SONGS*/', () => safe(JSON.stringify(songs)));
writeFileSync(new URL('web/index.html', root), html);
console.log(`web/index.html: ${(html.length / 1024).toFixed(0)} KB, ${NAMES.length} songs`);
