// A pool of Node worker threads that render song parts (engine/parallel.mjs's partJob), for tools and tests:
//   const pool = createPool(4);
//   const r = await renderSongParallel(song, { run: pool.run });
//   pool.close();
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { partJob, partTransfer } from '../engine/parallel.mjs';

if (!isMainThread) {
  parentPort.on('message', ({ id, job }) => {
    try {
      const tracks = partJob(job);
      parentPort.postMessage({ id, tracks }, partTransfer(tracks));
    } catch (e) {
      parentPort.postMessage({ id, error: String(e?.stack ?? e) });
    }
  });
}

/** A pool of `size` worker threads (default: one per core); run(job) renders one part. */
export function createPool(size = availableParallelism()) {
  const idle = [], queue = [], waiting = new Map();
  let nextId = 0;
  const workers = Array.from({ length: size }, () => {
    const w = new Worker(new URL(import.meta.url));
    w.on('message', ({ id, tracks, error }) => {
      const p = waiting.get(id);
      waiting.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(tracks);
      idle.push(w);
      pump();
    });
    idle.push(w);
    return w;
  });
  const pump = () => {
    while (idle.length && queue.length) {
      const w = idle.pop(), { id, job } = queue.shift();
      w.postMessage({ id, job });
    }
  };
  return {
    size,
    run: (job) => new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      queue.push({ id, job });
      pump();
    }),
    close: () => Promise.all(workers.map((w) => w.terminate())),
  };
}
