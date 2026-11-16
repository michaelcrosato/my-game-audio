// The public API and its documentation stay in step: every export of engine/index.mjs has a heading in docs/API.md,
// and every heading names an export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as api from '../engine/index.mjs';

const doc = readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8');
const headings = [...doc.matchAll(/^### `([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);

test('every export is documented in docs/API.md', () => {
  const missing = Object.keys(api).filter((k) => !headings.includes(k));
  assert.deepEqual(missing, [], `exports missing from docs/API.md: ${missing.join(', ')}`);
});

test('every documented name is exported', () => {
  const extra = headings.filter((h) => !(h in api));
  assert.deepEqual(extra, [], `documented but not exported: ${extra.join(', ')}`);
});
