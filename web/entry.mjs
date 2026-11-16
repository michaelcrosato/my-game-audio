import { renderSong, renderStream, streamable } from '../engine/render.mjs';
import chiptune from '../songs/chiptune.mjs';
import electronic from '../songs/electronic.mjs';
import orchestral from '../songs/orchestral.mjs';
import rock from '../songs/rock.mjs';
import beethoven5 from '../songs/beethoven5.mjs';
import ode from '../songs/ode.mjs';
import rollcall from '../songs/rollcall.mjs';

// The three piano pieces (moonlight, entertainer, alla_turca) are generated locally from imports/*.json and are not
// committed (see docs/HANDOFF.md, licences); import them here too after generating them.
export const songs = { chiptune, electronic, orchestral, rock, beethoven5, ode, rollcall };
export function render(name, log) {
  const r = renderSong(songs[name], { log });
  return { L: r.L, R: r.R, sr: r.sr, stats: r.stats };
}
// streamed: onChunk gets { L, R, start, total, sr } in order; normDb is the loudness gain of an offline render
export function stream(name, normDb, onChunk, log) {
  return renderStream(songs[name], { normDb, onChunk, log });
}
export const canStream = (name) => streamable(songs[name]);
