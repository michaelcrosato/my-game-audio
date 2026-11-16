// stage.mjs: where the players sit, and where the listener sits. With `song.stage` set, each part reaches the
// listener directly (quieter from further back) and by early reflections: image sources in a shoebox hall, mirrored
// in the side walls, the ceiling, the stage's back wall and the rear wall (first order) and in pairs of them (second
// order). The floor is left out: the audience absorbs its grazing reflection, which would only comb-filter. Each part's own reflections follow from its place on the stage (its pan and its depth), so
// the brass at the back sound further away than the violins at the front, and a seat in the balcony hears less
// direct sound and an earlier first reflection than a seat in the front row. The hall bus adds the late reverb.
import { SR, clamp } from './dsp.mjs';
import PRESETS from './orchestra-presets.json' with { type: 'json' };

/** Seats: distance from the stage's front edge and ear height, in metres. */
export const SEATS = { front: { d: 5, h: 1.2 }, stalls: { d: 14, h: 1.2 }, balcony: { d: 26, h: 9 } };
// how far into the stage each section sits (metres from the front edge), by preset name, family or synth type
const DEPTH_BY_NAME = {
  basses: 5, contrabass_solo: 1.5, violin_solo: 1, viola_solo: 1, cello_solo: 1.2, horn: 7.5, piano: 2, harp: 5,
  organ: 12, harpsichord: 3, soprano_voice: 1.5, alto_voice: 1.5, tenor_voice: 1.5, bass_voice: 1.5, celesta: 8,
  glockenspiel: 9,
};
const DEPTH_BY_FAMILY = { strings: 3, woodwinds: 6.5, brass: 8.5, percussion: 10, keyboards: 4, voices: 11 };
const DEPTH_BY_TYPE = { strings: 3, wind: 6.5, brass: 8.5, choir: 11, modal: 9.5, perc: 10, drums: 10, piano: 2, pluck: 4, organ: 12 };
const C = 343; // speed of sound, m/s

/** How deep in the stage a part sits (metres from the front edge): `part.depth`, or its section's usual place. */
export function stageDepth(song, part) {
  if (part.depth != null) return part.depth;
  const spec = song.instruments?.[part.inst] ?? {};
  const rn = spec.rangeName;
  if (rn && DEPTH_BY_NAME[rn] != null) return DEPTH_BY_NAME[rn];
  const fam = rn && PRESETS.instruments[rn]?.family;
  if (fam && DEPTH_BY_FAMILY[fam] != null) return DEPTH_BY_FAMILY[fam];
  return DEPTH_BY_TYPE[spec.type] ?? 5;
}

/**
 * A part's sound on the stage, heard from the song's seat: `{ direct, taps: [[delay samples, gain, pan], ...] }`,
 * gains relative to a player in the middle of the stage 4 m deep. null when the song has no `stage`.
 * song.stage: { seat: 'front' | 'stalls' | 'balcony' | { d, h }, width, height, depth (of the stage), length, early }.
 */
export function stageTaps(song, part) {
  const st = song.stage;
  if (!st) return null;
  const seat = typeof st.seat === 'object' ? st.seat : SEATS[st.seat ?? 'stalls'] ?? SEATS.stalls;
  const W = st.width ?? 26, H = st.height ?? 17, S = st.depth ?? 12, len = st.length ?? S + 34;
  const early = st.early ?? 0.5;
  const src = { x: clamp(part.pan ?? 0, -1, 1) * (W / 2 - 3), y: 1.3, z: S - clamp(stageDepth(song, part), 0.5, S - 0.5) };
  const lis = { x: 0, y: seat.h, z: S + seat.d };
  const dist = (p) => Math.hypot(p.x - lis.x, p.y - lis.y, p.z - lis.z);
  const d0 = dist(src);
  // the walls as mirrors: [mirror, reflection coefficient]; the rear wall, behind the seats, absorbs the most
  const walls = [
    [(p) => ({ ...p, x: -W - p.x }), 0.8], // left side wall, x = -W/2
    [(p) => ({ ...p, x: W - p.x }), 0.8], // right
    [(p) => ({ ...p, y: 2 * H - p.y }), 0.75], // ceiling
    [(p) => ({ ...p, z: -p.z }), 0.85], // the stage's back wall, z = 0
    [(p) => ({ ...p, z: 2 * len - p.z }), 0.45], // the rear wall behind the audience
  ];
  const images = walls.map(([m, g]) => [m(src), g]);
  for (const [a, b] of [[0, 1], [0, 2], [1, 2], [3, 0], [3, 1], [3, 2]]) {
    images.push([walls[b][0](walls[a][0](src)), walls[a][1] * walls[b][1]]);
  }
  const taps = [];
  for (const [p, g] of images) {
    const d = dist(p);
    const delay = Math.round(((d - d0) / C) * SR);
    if (delay < 1 || delay > 0.15 * SR) continue;
    const az = Math.atan2(p.x - lis.x, lis.z - p.z);
    taps.push([delay, early * g * (d0 / d), clamp(Math.sin(az), -1, 1)]);
  }
  const ref = Math.hypot(1.3 - lis.y, lis.z - (S - 4));
  return { direct: ref / d0, taps };
}

/** Apply a part's stage (from stageTaps) to its stereo sound, in place: the direct sound, then the reflections. */
export function stage(L, R, { direct, taps }) {
  const n = L.length;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = 0.5 * (L[i] + R[i]);
  const tg = taps.map(([d, g, pan]) => {
    const a = ((pan + 1) * Math.PI) / 4;
    return [d, g * Math.cos(a) * Math.SQRT2, g * Math.sin(a) * Math.SQRT2];
  });
  const maxD = Math.max(0, ...taps.map((t) => t[0]));
  let last = -Infinity; // the last sample with sound: past it plus the longest delay, the reflections have died
  for (let i = 0; i < n; i++) {
    if (m[i] !== 0 || L[i] !== 0) last = i;
    else if (i - last > maxD) continue;
    let yl = direct * L[i], yr = direct * R[i];
    for (let k = 0; k < tg.length; k++) {
      const j = i - tg[k][0];
      if (j < 0) continue;
      const x = m[j];
      yl += x * tg[k][1];
      yr += x * tg[k][2];
    }
    L[i] = yl;
    R[i] = yr;
  }
}
