// What a hand-written song may leave to the engine: an instrument named by its preset, a room in one word, and marks
// written before a note's length. The songs games write by hand did all three (52in1, 2026-11-24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { songOf, presetSpec, PRESETS, ROOMS } from '../engine/orchestra.mjs';
import { arrange, critic, parseLine } from '../engine/score.mjs';
import { renderSong } from '../engine/render.mjs';
import { renderCue } from '../engine/loop.mjs';
import { ears, checkAudio } from '../engine/ears.mjs';
import { cueAudio } from '../tools/ears.mjs';
import { sha256 } from './helpers.mjs';

const song = (instruments, extra = {}) => ({
  title: 'Court', bpm: 120, meter: [4, 4], grid: 16, seed: 3, tail: 1, instruments,
  parts: { lead: { inst: 'lead', role: 'melody' }, bass: { inst: 'bass', role: 'bass' }, kit: { inst: 'kit' } },
  sections: {
    A: {
      bars: 2, chords: '| C | G |',
      parts: { lead: '| C5:4 E5:4 G5:4 E5:4 | D5:8 B4:8 |', bass: '| C2:8 G2:8 | G2:8 D2:8 |', kit: '| k . h . s . h . k . h . s . h . |' },
    },
  },
  form: ['A'], loops: { main: { body: ['A'] } }, ...extra,
});

test('an instrument named by its preset renders as the preset\'s spec; { preset, ... } changes some of it', () => {
  const named = song({ lead: 'synth_lead', bass: { preset: 'electric_bass', gain: 0.9 }, kit: { type: 'drums' } });
  const spelled = song({ lead: presetSpec('synth_lead'), bass: { ...presetSpec('electric_bass'), gain: 0.9 }, kit: { type: 'drums' } });
  const a = renderSong(named), b = renderSong(spelled);
  assert.equal(sha256(a.L, a.R), sha256(b.L, b.R));
  assert.deepEqual(critic(named).warnings, critic(spelled).warnings, 'the critic knows the preset\'s range');
  assert.throws(() => renderSong(song({ lead: 'kazoo', bass: 'electric_bass', kit: { type: 'drums' } })), /no preset "kazoo" \(presets: .*synth_lead.*kits: drum_kit, chip_noise/);
});

test('the kits by name, and a drum spec with no kit of hits plays the band\'s kit instead of stopping the render', async () => {
  const { GM_KIT, CHIP_KIT } = await import('../engine/orchestra.mjs');
  const a = renderSong(song({ lead: 'synth_lead', bass: 'electric_bass', kit: 'drum_kit' }));
  const b = renderSong(song({ lead: 'synth_lead', bass: 'electric_bass', kit: GM_KIT }));
  const c = renderSong(song({ lead: 'synth_lead', bass: 'electric_bass', kit: { type: 'drums' } }));
  assert.equal(sha256(a.L, a.R), sha256(b.L, b.R));
  assert.ok(Number.isFinite(c.L[1000]) && c.stats.lufs > -40, 'the kitless drums play');
  assert.deepEqual(songOf(song({ lead: 'chip_pulse', bass: 'chip_triangle', kit: 'chip_noise' })).instruments.kit.kit, CHIP_KIT.kit);
});

test('a room in one word: its reverb, sends and master where the song sets none, and the song\'s own settings kept', () => {
  const s = songOf(song({ lead: 'synth_lead', bass: 'electric_bass', kit: { type: 'drums' } }, { room: 'band', master: { lufs: -16, ceiling: -2 } }));
  assert.deepEqual(s.buses.hall, ROOMS.band.hall);
  assert.deepEqual(s.master.eq, ROOMS.band.master.eq, 'the room\'s master voicing');
  assert.equal(s.master.ceiling, -2, 'the song\'s own master settings win');
  // a band or synth preset sends what it sends; a part on a raw spec a moderate amount
  assert.equal(s.parts.bass.sends.hall, PRESETS.instruments.electric_bass.send);
  assert.equal(s.parts.kit.sends.hall, -16);
  const own = songOf(song({ lead: 'synth_lead', bass: 'electric_bass', kit: { type: 'drums' } }, { room: 'synth', parts: { lead: { inst: 'lead', sends: { hall: -30 } }, bass: { inst: 'bass' }, kit: { inst: 'kit' } } }));
  assert.equal(own.parts.lead.sends.hall, -30, 'a part\'s own sends are kept');
  // an orchestral preset's send is for the concert hall: in a band's room it gets the moderate one
  const orch = songOf(song({ lead: 'trumpet', bass: 'electric_bass', kit: { type: 'drums' } }, { room: 'band' }));
  assert.equal(orch.parts.lead.sends.hall, -16);
  assert.equal(songOf(song({ lead: 'trumpet', bass: 'tuba', kit: { type: 'drums' } }, { room: 'hall' })).parts.lead.sends.hall, PRESETS.instruments.trumpet.send);
  assert.throws(() => songOf(song({ lead: 'synth_lead', bass: 'electric_bass', kit: { type: 'drums' } }, { room: 'stadium' })), /rooms are hall, band, synth and chip/);
});

test('songOf leaves a song with none of these as it is, and gives the same song the same result', async () => {
  const { GM_KIT } = await import('../engine/orchestra.mjs');
  const plain = song({ lead: { type: 'chip', ch: 'pulse' }, bass: { type: 'chip', ch: 'tri' }, kit: GM_KIT });
  assert.equal(songOf(plain), plain);
  const named = song({ lead: 'synth_lead', bass: 'electric_bass', kit: { type: 'drums' } }, { room: 'band' });
  assert.equal(songOf(named), songOf(named));
  assert.equal(songOf(songOf(named)), songOf(named));
  assert.equal(typeof named.instruments.lead, 'string', 'the song itself is not changed');
});

test('a song on presets in a band room arranges cleanly and its cue passes the ears', () => {
  const s = song({ lead: 'synth_lead', bass: 'electric_bass', kit: { type: 'drums' } }, { room: 'band' });
  assert.deepEqual(arrange(s).errors, []);
  const v = checkAudio(ears(...Object.values(cueAudio(renderCue(s, { cue: 'main' })))));
  assert.ok(v.pass, v.problems.join('; '));
});

test('marks written before a note\'s length mean what they mean after it', () => {
  const before = parseLine('| D4!:3 A2^:2 [C4 E4]~:4 {G4}A4_:2 .:5 |', { lenient: true });
  const after = parseLine('| D4:3! A2:2^ [C4 E4]:4~ {G4}A4:2_ .:5 |', { lenient: true });
  assert.deepEqual(before.repairs, []);
  assert.deepEqual(before.events, after.events);
  assert.equal(before.events.length, 4);
});
