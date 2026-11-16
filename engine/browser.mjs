// The bundle's entry (dist/my-game-audio.js and .mjs): the public API, plus what the bundle needs to run its own
// code as the render worker.
export * from './index.mjs';
export { startWorker } from './worker.mjs';
export { setWorkerSource } from './player.mjs';
