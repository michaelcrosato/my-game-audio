// sounds.mjs: the library of named game sounds. Each is a spec for renderSfx (see sfx.mjs): layers of small
// models, a loudness `level`, and how much each play may vary. `cat` groups them; `loop` marks ambient beds.
// player.sfx('coin') plays one; copy a spec and change it to make a sound of your own.

// interface sounds sit low in the mix, short and dry; combat and pickups are the loudest one-shots; ambient beds sit
// under everything
const UI = -22, MOVE = -21, HIT = -16, MAGIC = -17, PICK = -17, DOOR = -19, AMB = -26;

export const SOUNDS = {
  // ---- interface ---------------------------------------------------------------------------------------------
  ui_click: { cat: 'interface', level: UI, vary: { pitch: 0.03 }, layers: [{ type: 'modal', material: 'plastic', freq: 2200, hardness: 0.8, d: 0.4 }, { type: 'tone', wave: 'sine', freq: 2600, a: 0.001, d: 0.025 }] },
  ui_hover: { cat: 'interface', level: UI - 4, vary: { pitch: 0.02 }, layers: [{ type: 'tone', wave: 'sine', freq: 1800, slide: 0.6, a: 0.003, d: 0.05 }] },
  ui_confirm: { cat: 'interface', level: UI, layers: [{ type: 'tone', wave: 'square', duty: 0.25, freq: 'E6', arp: [[0.06, 7]], s: 0.04, d: 0.12, lp: { f: 6000 } }] },
  ui_back: { cat: 'interface', level: UI, layers: [{ type: 'tone', wave: 'square', duty: 0.25, freq: 'B5', arp: [[0.06, -5]], s: 0.04, d: 0.1, lp: { f: 5000 } }] },
  ui_error: { cat: 'interface', level: UI + 1, layers: [{ type: 'tone', wave: 'saw', freq: 'A3', s: 0.08, d: 0.12, repeat: 0.11, lp: { f: 1800, res: 0.3 } }, { type: 'tone', wave: 'saw', freq: 'Bb3', s: 0.08, d: 0.12, gain: -3, lp: { f: 1800 } }] },
  ui_open: { cat: 'interface', level: UI, layers: [{ type: 'whoosh', from: 600, to: 3500, d: 0.18, q: 1.5 }, { type: 'tone', wave: 'triangle', freq: 'C5', slide: 1.5, d: 0.14, gain: -4 }] },
  ui_close: { cat: 'interface', level: UI, layers: [{ type: 'whoosh', from: 3500, to: 600, d: 0.16, q: 1.5 }, { type: 'tone', wave: 'triangle', freq: 'G5', slide: -1.5, d: 0.12, gain: -4 }] },
  ui_type: { cat: 'interface', level: UI - 3, vary: { pitch: 0.08, gain: 2 }, layers: [{ type: 'modal', material: 'plastic', freq: 1600, hardness: 0.9, d: 0.25 }] },
  ui_notify: { cat: 'interface', level: UI + 2, layers: [{ type: 'modal', material: 'glass', freq: 'E6', hardness: 0.5, d: 0.4 }, { type: 'modal', material: 'glass', freq: 'B6', hardness: 0.5, d: 0.4, at: 0.09 }] },

  // ---- movement ----------------------------------------------------------------------------------------------
  jump: { cat: 'movement', level: MOVE + 2, vary: { pitch: 0.04 }, layers: [{ type: 'tone', wave: 'square', duty: 0.25, freq: 240, slide: 2.4, d: 0.18, lp: { f: 5000 } }] },
  double_jump: { cat: 'movement', level: MOVE + 2, vary: { pitch: 0.04 }, layers: [{ type: 'tone', wave: 'square', duty: 0.25, freq: 360, slide: 2.8, d: 0.16, lp: { f: 6000 } }, { type: 'whoosh', from: 800, to: 4000, d: 0.2, gain: -6 }] },
  land: { cat: 'movement', level: MOVE, vary: { pitch: 0.06 }, layers: [{ type: 'step', surface: 'dirt', weight: 1 }, { type: 'noise', lp: [900, 200], d: 0.12, gain: -4 }] },
  step_grass: { cat: 'movement', level: MOVE - 2, vary: { pitch: 0.08, gain: 2 }, layers: [{ type: 'step', surface: 'grass' }] },
  step_gravel: { cat: 'movement', level: MOVE - 2, vary: { pitch: 0.08, gain: 2 }, layers: [{ type: 'step', surface: 'gravel' }] },
  step_wood: { cat: 'movement', level: MOVE - 2, vary: { pitch: 0.06, gain: 2 }, layers: [{ type: 'step', surface: 'wood' }] },
  step_stone: { cat: 'movement', level: MOVE - 2, vary: { pitch: 0.06, gain: 2 }, layers: [{ type: 'step', surface: 'stone' }] },
  step_metal: { cat: 'movement', level: MOVE - 2, vary: { pitch: 0.05, gain: 2 }, layers: [{ type: 'step', surface: 'metal' }] },
  step_water: { cat: 'movement', level: MOVE - 2, vary: { pitch: 0.08, gain: 2 }, layers: [{ type: 'step', surface: 'water' }] },
  step_snow: { cat: 'movement', level: MOVE - 2, vary: { pitch: 0.08, gain: 2 }, layers: [{ type: 'step', surface: 'snow' }] },
  dash: { cat: 'movement', level: MOVE + 2, vary: { pitch: 0.05 }, layers: [{ type: 'whoosh', from: 400, to: 5000, d: 0.25, q: 1.2 }, { type: 'tone', wave: 'saw', freq: 180, slide: 1.2, d: 0.2, gain: -9, lp: { f: 2000 } }] },
  splash: { cat: 'movement', level: MOVE + 2, vary: { pitch: 0.06 }, layers: [{ type: 'noise', color: 'pink', bp: [3000, 900], q: 0.8, a: 0.004, d: 0.5, curve: 2 }, { type: 'drip', count: 8, freq: 900, spread: 0.8, span: 0.35, d: 0.12, gain: -2 }] },

  // ---- combat -----------------------------------------------------------------------------------------------
  sword_swing: { cat: 'combat', level: HIT - 2, vary: { pitch: 0.06 }, layers: [{ type: 'whoosh', from: 500, to: 3200, d: 0.28, q: 3 }] },
  sword_hit: { cat: 'combat', level: HIT, vary: { pitch: 0.04 }, layers: [{ type: 'modal', material: 'metal', freq: 780, hardness: 0.9, d: 0.35 }, { type: 'noise', hp: [3000, 3000], d: 0.05, gain: -2 }] },
  punch: { cat: 'combat', level: HIT - 4, vary: { pitch: 0.08 }, layers: [{ type: 'modal', material: 'flesh', freq: 95, hardness: 0.8 }, { type: 'noise', lp: [2500, 500], a: 0.001, d: 0.08, gain: -1 }] },
  hurt: { cat: 'combat', level: HIT - 1, vary: { pitch: 0.05 }, layers: [{ type: 'tone', wave: 'square', duty: 0.5, freq: 520, slide: -2.5, vib: [32, 1.2], d: 0.22, lp: { f: 3500 } }, { type: 'noise', lp: [2000, 400], d: 0.07, gain: -6 }] },
  block: { cat: 'combat', level: HIT - 5, vary: { pitch: 0.05 }, layers: [{ type: 'modal', material: 'wood', freq: 260, hardness: 0.9, d: 1.2 }, { type: 'modal', material: 'metal', freq: 1100, hardness: 0.7, d: 0.12, gain: -8 }] },
  bow_shoot: { cat: 'combat', level: HIT - 2, vary: { pitch: 0.05 }, layers: [{ type: 'tone', wave: 'triangle', freq: 165, vib: [55, 0.6], d: 0.25, curve: 2 }, { type: 'whoosh', from: 1500, to: 5000, d: 0.18, q: 2, at: 0.02, gain: -3 }] },
  arrow_hit: { cat: 'combat', level: HIT - 1, vary: { pitch: 0.06 }, layers: [{ type: 'modal', material: 'wood', freq: 320, hardness: 0.7 }, { type: 'tone', wave: 'triangle', freq: 140, vib: [70, 1.5], d: 0.3, curve: 2, gain: -8 }] },
  explosion: { cat: 'combat', level: HIT + 1, vary: { pitch: 0.08 }, layers: [{ type: 'boom', size: 0.85 }] },
  explosion_small: { cat: 'combat', level: HIT, vary: { pitch: 0.1 }, layers: [{ type: 'boom', size: 0.25 }] },
  laser: { cat: 'combat', level: HIT - 2, vary: { pitch: 0.05 }, layers: [{ type: 'tone', wave: 'square', duty: 0.15, freq: 1800, slide: -4.5, d: 0.18, lp: { f: 7000 } }] },
  enemy_die: { cat: 'combat', level: HIT - 1, vary: { pitch: 0.04 }, layers: [{ type: 'tone', wave: 'square', freq: 440, slide: -3, arp: [[0.08, -3], [0.16, -7]], d: 0.4, lp: { f: 4000 } }, { type: 'noise', lp: [3000, 300], d: 0.35, gain: -6 }] },

  // ---- magic ------------------------------------------------------------------------------------------------
  spell_cast: { cat: 'magic', level: MAGIC, vary: { pitch: 0.03 }, layers: [{ type: 'tone', wave: 'sine', freq: 'A5', slide: 1.8, vib: [9, 0.5], a: 0.05, d: 0.45 }, { type: 'tone', wave: 'sine', freq: 'E6', slide: 1.8, vib: [11, 0.5], a: 0.05, d: 0.45, gain: -5, pan: 0.3 }, { type: 'noise', color: 'pink', bp: [2000, 9000], q: 2, a: 0.1, d: 0.4, gain: -8 }] },
  fireball: { cat: 'magic', level: MAGIC + 1, vary: { pitch: 0.05 }, layers: [{ type: 'whoosh', from: 200, to: 1800, d: 0.55, q: 1 }, { type: 'crackle', density: 90, bp: [1500, 6000], d: 0.55, gain: -4 }, { type: 'noise', color: 'brown', lp: [700, 200], a: 0.02, d: 0.5, gain: -2 }] },
  ice: { cat: 'magic', level: MAGIC, vary: { pitch: 0.04 }, layers: [{ type: 'modal', material: 'glass', freq: 2100, hardness: 0.9, d: 0.8 }, { type: 'modal', material: 'glass', freq: 2780, hardness: 0.9, d: 0.7, at: 0.05 }, { type: 'noise', hp: [6000, 9000], d: 0.3, gain: -10 }] },
  heal: { cat: 'magic', level: MAGIC, layers: [{ type: 'tone', wave: 'sine', freq: 'C5', arp: [[0.08, 4], [0.16, 7], [0.24, 12]], vib: [6, 0.15], s: 0.25, d: 0.5 }, { type: 'tone', wave: 'triangle', freq: 'C6', arp: [[0.08, 4], [0.16, 7], [0.24, 12]], s: 0.25, d: 0.5, gain: -9, pan: -0.3 }] },
  teleport: { cat: 'magic', level: MAGIC, vary: { pitch: 0.03 }, layers: [{ type: 'tone', wave: 'square', duty: 0.3, freq: 300, slide: 4, vib: [18, 2], d: 0.4, lp: { f: 4000, sweep: 1 } }, { type: 'whoosh', from: 3000, to: 200, d: 0.4, gain: -6 }] },
  charge: { cat: 'magic', level: MAGIC - 1, layers: [{ type: 'tone', wave: 'saw', freq: 110, slide: 1.4, vib: [14, 0.3], a: 0.8, d: 0.08, lp: { f: 600, sweep: 2.2, res: 0.4 } }, { type: 'noise', color: 'pink', bp: [400, 4000], q: 3, a: 0.8, d: 0.08, gain: -10 }] },
  power_up: { cat: 'magic', level: MAGIC + 1, layers: [{ type: 'tone', wave: 'square', duty: 0.25, freq: 'C5', arp: [[0.05, 4], [0.1, 7], [0.15, 12], [0.2, 16], [0.25, 19], [0.3, 24]], s: 0.32, d: 0.2, lp: { f: 7000 } }] },

  // ---- pickups ----------------------------------------------------------------------------------------------
  coin: { cat: 'pickups', level: PICK, vary: { pitch: 0.01 }, layers: [{ type: 'tone', wave: 'square', duty: 0.5, freq: 'B5', arp: [[0.075, 5]], s: 0.05, d: 0.28, lp: { f: 8000 } }] },
  gem: { cat: 'pickups', level: PICK, vary: { pitch: 0.02 }, layers: [{ type: 'modal', material: 'glass', freq: 'E6', hardness: 0.6 }, { type: 'modal', material: 'glass', freq: 'B6', hardness: 0.6, at: 0.06, gain: -2 }, { type: 'modal', material: 'glass', freq: 'E7', hardness: 0.6, at: 0.12, gain: -4 }] },
  heart: { cat: 'pickups', level: PICK, layers: [{ type: 'tone', wave: 'triangle', freq: 'G5', arp: [[0.07, 5], [0.14, 9]], s: 0.18, d: 0.25 }, { type: 'tone', wave: 'sine', freq: 'G4', arp: [[0.07, 5], [0.14, 9]], s: 0.18, d: 0.25, gain: -6 }] },
  key: { cat: 'pickups', level: PICK, vary: { pitch: 0.02 }, layers: [{ type: 'modal', material: 'metal', freq: 1900, hardness: 0.5, d: 0.25 }, { type: 'modal', material: 'metal', freq: 2400, hardness: 0.5, d: 0.25, at: 0.07 }] },
  item: { cat: 'pickups', level: PICK, layers: [{ type: 'tone', wave: 'square', duty: 0.5, freq: 'G5', arp: [[0.09, 4], [0.18, 7], [0.27, 12]], s: 0.3, d: 0.3, lp: { f: 6000 } }, { type: 'tone', wave: 'triangle', freq: 'G4', arp: [[0.09, 4], [0.18, 7], [0.27, 12]], s: 0.3, d: 0.3, gain: -4 }] },
  extra_life: { cat: 'pickups', level: PICK, layers: [{ type: 'tone', wave: 'square', duty: 0.25, freq: 'E5', arp: [[0.1, 3], [0.2, 7], [0.3, 12], [0.4, 15], [0.5, 19]], s: 0.55, d: 0.2, lp: { f: 7000 } }] },

  // ---- doors and the world ----------------------------------------------------------------------------------
  door_open: { cat: 'doors', level: DOOR, vary: { pitch: 0.05 }, layers: [{ type: 'creak', rate: [18, 55], res: [330, 760, 1500], d: 0.75 }, { type: 'modal', material: 'metal', freq: 1400, hardness: 0.3, d: 0.15, gain: -12 }] },
  door_close: { cat: 'doors', level: DOOR + 2, vary: { pitch: 0.05 }, layers: [{ type: 'creak', rate: [50, 25], res: [330, 760, 1500], d: 0.3 }, { type: 'modal', material: 'wood', freq: 120, hardness: 0.9, d: 2.5, at: 0.28 }, { type: 'noise', lp: [1500, 200], d: 0.15, at: 0.28, gain: -3 }] },
  door_locked: { cat: 'doors', level: DOOR, vary: { pitch: 0.04 }, layers: [{ type: 'modal', material: 'metal', freq: 900, hardness: 0.8, d: 0.15 }, { type: 'modal', material: 'metal', freq: 950, hardness: 0.8, d: 0.15, at: 0.09 }, { type: 'modal', material: 'wood', freq: 180, hardness: 0.6, d: 0.8, at: 0.09, gain: -4 }] },
  gate_metal: { cat: 'doors', level: DOOR, vary: { pitch: 0.04 }, layers: [{ type: 'creak', rate: [12, 30], res: [600, 1500, 2900], q: 25, d: 1.1 }, { type: 'modal', material: 'metal', freq: 300, hardness: 0.7, d: 0.9, at: 1.05 }] },
  lever: { cat: 'doors', level: DOOR, vary: { pitch: 0.04 }, layers: [{ type: 'modal', material: 'metal', freq: 650, hardness: 0.7, d: 0.25 }, { type: 'creak', rate: [40, 70], res: [500, 1200], d: 0.15, gain: -6 }, { type: 'modal', material: 'metal', freq: 480, hardness: 0.9, d: 0.3, at: 0.17 }] },
  chest_open: { cat: 'doors', level: DOOR + 1, layers: [{ type: 'creak', rate: [20, 45], res: [280, 650, 1300], d: 0.5 }, { type: 'modal', material: 'wood', freq: 160, hardness: 0.6, d: 1.5, at: 0.45 }, { type: 'modal', material: 'glass', freq: 'C7', hardness: 0.4, at: 0.55, gain: -8 }] },
  stone_door: { cat: 'doors', level: DOOR + 1, layers: [{ type: 'noise', color: 'brown', lp: [500, 300], a: 0.15, s: 1, d: 0.3, gain: 2 }, { type: 'crackle', density: 60, bp: [300, 1500], decay: 0.008, d: 1.4, gain: -6 }, { type: 'modal', material: 'stone', freq: 70, hardness: 0.9, d: 4, at: 1.4 }] },

  // ---- ambient loops ----------------------------------------------------------------------------------------
  amb_rain: { cat: 'ambient', level: AMB, loop: 6, layers: [{ type: 'noise', color: 'pink', hp: [900, 900], gain: 0 }, { type: 'noise', color: 'white', bp: [5000, 5000], q: 0.7, gain: -10 }, { type: 'drip', count: 220, freq: 2600, spread: 0.7, d: 0.04, gain: -6 }] },
  amb_wind: { cat: 'ambient', level: AMB, loop: 8, layers: [{ type: 'noise', color: 'brown', bp: [350, 350], q: 1.2, gain: 0 }, { type: 'noise', color: 'pink', bp: [900, 900], q: 3, gain: -8 }, { type: 'whoosh', from: 300, to: 1100, d: 3.5, q: 2.5, at: 1, gain: -4 }, { type: 'whoosh', from: 250, to: 900, d: 3, q: 2.5, at: 5.2, gain: -6 }] },
  amb_fire: { cat: 'ambient', level: AMB, loop: 6, layers: [{ type: 'noise', color: 'brown', lp: [600, 600], gain: 0 }, { type: 'crackle', density: 22, bp: [1200, 7000], decay: 0.002, gain: 4 }, { type: 'crackle', density: 6, bp: [400, 1600], decay: 0.01, gain: 2 }] },
  amb_stream: { cat: 'ambient', level: AMB, loop: 6, layers: [{ type: 'noise', color: 'pink', bp: [1400, 1400], q: 0.6, gain: 0 }, { type: 'drip', count: 160, freq: 700, spread: 0.9, d: 0.06, gain: -3 }] },
  amb_cave: { cat: 'ambient', level: AMB, loop: 8, layers: [{ type: 'noise', color: 'brown', lp: [180, 180], gain: 0 }, { type: 'drip', count: 7, freq: 1300, spread: 0.5, d: 0.35, gain: 6 }] },
  amb_machine: { cat: 'ambient', level: AMB, loop: 4, layers: [{ type: 'tone', wave: 'saw', freq: 55, vib: [0.5, 0.05], lp: { f: 400 } }, { type: 'tone', wave: 'square', freq: 110, duty: 0.3, lp: { f: 900 }, gain: -10 }, { type: 'noise', color: 'pink', bp: [2500, 2500], q: 2, gain: -14 }] },
};

/** The names of the sounds in a category ('interface', 'movement', 'combat', 'magic', 'pickups', 'doors', 'ambient'), or all. */
export const soundNames = (cat) => Object.keys(SOUNDS).filter((n) => !cat || SOUNDS[n].cat === cat);
