// Seamless loops in the orchestra: long tails (harp, timpani, hall), legato strings, a second cue with no intro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFold, checkSeams, cueOf } from './loophelpers.mjs';

test('orchestral (climax): head and loop equal a continuous render of three passes (dry, unmastered)', () => checkFold('orchestral', 'climax'));
test('orchestral: no click at the head-to-loop seam or the loop seam', () => checkSeams('orchestral'));
test('orchestral (climax): a cue with no intro enters with its head', async () => {
  const r = await cueOf('orchestral', 'climax');
  assert.equal(r.intro, 0);
  assert.equal(r.entry, r.head);
  await checkSeams('orchestral', 'climax');
});
