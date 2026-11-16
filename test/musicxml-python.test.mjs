// The two importers side by side: tools/import_orchestra.py and engine/musicxml.mjs read the same scores and must
// write the same songs (note names compared by pitch). Runs with MGA_PYTHON=1 where python3 has music21 (CI's
// importers job): MGA_PYTHON=1 node --test test/musicxml-python.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { importMusicXML } from '../engine/musicxml.mjs';
import { compareSongs } from '../tools/compare_import.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// opt-in (MGA_PYTHON=1; CI's importers job sets it): the Python importer takes minutes
const wanted = process.env.MGA_PYTHON === '1';
const hasMusic21 = wanted && spawnSync('python3', ['-I', '-c', 'import music21'], { stdio: 'ignore' }).status === 0;
const dir = mkdtempSync(join(tmpdir(), 'mga-import-'));

const CASES = [
  ['Beethoven_Op.67_1.mxl', { title: 'Symphony No. 5, I', key: 'C minor' }],
  ['Beethoven_Op.125_4.mxl', { title: 'Symphony No. 9, IV: Ode to Joy', key: 'D major', bars: '93-331' }],
  ['features.musicxml', { title: 'Feature test' }],
];
for (const [file, opt] of CASES) {
  test(`${file}: tools/import_orchestra.py and engine/musicxml.mjs write the same song`, { skip: hasMusic21 ? false : wanted ? 'python3 has no music21 here (pip install music21)' : 'set MGA_PYTHON=1 to run the Python importer too', timeout: 900000 }, async () => {
    const src = join(root, 'test/scores', file), out = join(dir, file + '.mjs');
    const args = ['-I', join(root, 'tools/import_orchestra.py'), src, out];
    for (const [k, v] of Object.entries(opt)) args.push(`--${k}`, v);
    execFileSync('python3', args, { stdio: 'ignore' });
    const py = (await import(pathToFileURL(out).href)).default;
    const js = (await importMusicXML(readFileSync(src), { ...opt, compat: true })).song;
    const d = compareSongs(js, py);
    assert.deepEqual(d, [], d.slice(0, 10).join('\n'));
  });
}
