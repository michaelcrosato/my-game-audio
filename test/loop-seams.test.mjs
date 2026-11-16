// Seamless loops in the band and synth styles: no click at either seam, with every effect and the master.
import { test } from 'node:test';
import { checkSeams } from './loophelpers.mjs';

for (const name of ['electronic', 'rock']) test(`${name}: no click at the head-to-loop seam or the loop seam`, () => checkSeams(name));
