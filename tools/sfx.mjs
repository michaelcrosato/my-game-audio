// tools/sfx.mjs: the sound-effect library (engine/sounds.mjs) from a shell.
//
//   npm run sfx                                   every sound: category, length, loudness, description
//   npm run sfx -- list [CATEGORY]                the same, for one category
//   npm run sfx -- render [NAME...] [--seed N]    out/sfx/NAME.wav (never committed), every sound or those named
//   npm run sfx -- match [NAME...] [--try FILE]   does each sound sound like its description? Renders the library and
//       asks a CLAP model (tools/sfx_match.py), which ranks each sound's own description among all of them: rank 1
//       means the model picks it out of the whole library. --try FILE (an .mjs whose default export, or a .json, maps
//       names to specs with a desc) ranks new or changed sounds against the library the same way, before they join it.
//       The Python is MGA_CLAP_PYTHON (default python3), with torch and transformers; the numbers land in
//       out/sfx/match.json. A learned listener: use it to find sounds that miss, not as a gate.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderSfx } from '../engine/sfx.mjs';
import { SOUNDS, SOUND_CATEGORIES, soundNames } from '../engine/sounds.mjs';
import { wav } from '../engine/render.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = resolve(process.env.MGA_SFX_OUT ?? join(ROOT, 'out', 'sfx'));
const args = process.argv.slice(2);
const cmd = ['list', 'render', 'match'].includes(args[0]) ? args.shift() : 'list';
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const seed = +flag('--seed', 1);
const tryFile = flag('--try', null);
const named = args.filter((a) => !a.startsWith('--'));

function render(name, spec, dir = OUT) {
  const r = renderSfx(spec, { seed });
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.wav`);
  writeFileSync(path, wav(r.L, r.R));
  return { path, r };
}

if (cmd === 'list') {
  const cats = named.length ? named : SOUND_CATEGORIES;
  for (const c of cats) {
    if (!SOUND_CATEGORIES.includes(c)) throw new Error(`no category "${c}" (categories: ${SOUND_CATEGORIES.join(', ')})`);
    console.log(`\n${c} (${soundNames(c).length})`);
    for (const n of soundNames(c)) {
      const s = SOUNDS[n];
      const len = s.loop ? `loop ${s.loop} s` : `${renderSfx(s, { seed }).seconds.toFixed(2)} s`;
      console.log(`  ${n.padEnd(18)} ${len.padStart(9)}  ${String(s.level ?? -18).padStart(3)} LUFS  ${s.desc ?? ''}`);
    }
  }
  console.log(`\n${Object.keys(SOUNDS).length} sounds in ${SOUND_CATEGORIES.length} categories`);
} else if (cmd === 'render') {
  for (const n of named.length ? named : Object.keys(SOUNDS)) {
    if (!SOUNDS[n]) throw new Error(`no sound "${n}"`);
    const { path, r } = render(n, SOUNDS[n]);
    console.log(`${path}  ${r.seconds.toFixed(2)} s, ${r.loudness.toFixed(1)} LUFS, peak ${r.peakDb.toFixed(1)} dBFS`);
  }
} else {
  // the whole library is rendered every time: each description's scores are standardized over all of its sounds
  const library = Object.entries(SOUNDS).map(([name, s]) => ({ name, cat: s.cat, desc: s.desc ?? name.replace(/_/g, ' '), wav: render(name, s).path }));
  let tried = [];
  if (tryFile) {
    const file = resolve(tryFile);
    const specs = file.endsWith('.json') ? JSON.parse(readFileSync(file, 'utf8')) : (await import(pathToFileURL(file).href)).default;
    tried = Object.entries(specs).map(([name, s]) => {
      if (!s.desc) throw new Error(`${name}: a sound to try needs a desc`);
      return { name, desc: s.desc, wav: render(name, s, join(OUT, 'try')).path };
    });
  }
  const manifest = join(OUT, 'match-manifest.json'), out = join(OUT, 'match.json');
  writeFileSync(manifest, JSON.stringify({ library, try: tried }, null, 1));
  const py = process.env.MGA_CLAP_PYTHON ?? 'python3';
  const r = spawnSync(py, ['-I', join(ROOT, 'tools', 'sfx_match.py'), manifest, out], { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr.split('\n').filter((l) => !/Loading weights|warn/i.test(l)).slice(-12).join('\n'));
    console.error(`sfx_match.py failed: set MGA_CLAP_PYTHON to a Python with torch and transformers`);
    process.exit(1);
  }
  const res = JSON.parse(readFileSync(out, 'utf8'));
  const row = (x) => `${String(x.rank).padStart(4)}  ${x.name.padEnd(18)} ${x.desc.padEnd(52).slice(0, 52)} heard as: ${x.top.map((t) => t[0]).join(', ')}`;
  const show = named.length ? res.sounds.filter((x) => named.includes(x.name)) : res.sounds;
  const s = res.summary;
  console.log(`${s.sounds} sounds: their own description ranked first for ${s.top1}, in the top 5 for ${s.top5}; median rank ${s.median}`);
  for (const c of SOUND_CATEGORIES) {
    const rk = res.sounds.filter((x) => x.cat === c).map((x) => x.rank).sort((a, b) => a - b);
    console.log(`  ${c.padEnd(10)} ${String(rk.length).padStart(3)} sounds, top 5: ${String(rk.filter((x) => x <= 5).length).padStart(3)}, median rank ${rk[Math.floor((rk.length - 1) / 2)]}`);
  }
  console.log(named.length ? '' : '\nthe 25 furthest from their descriptions:');
  for (const x of (named.length ? show : [...show].sort((a, b) => b.rank - a.rank).slice(0, 25))) console.log(row(x));
  if (res.try.length) {
    console.log('\ntried:');
    for (const x of res.try) console.log(row(x));
  }
  console.log(`\n${out}`);
}
