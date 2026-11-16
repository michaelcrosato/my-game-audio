// The render worker as a module worker, for pages that load the engine as ES modules (the bundle in dist/ makes
// its worker from its own code instead).
import { startWorker } from './worker.mjs';
startWorker();
