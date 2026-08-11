// lib/asyncLock.js
//
// In-process async mutex keyed by an arbitrary string. Built for the
// "check-then-act" race on generate-once resources (world mood board,
// faction banners, the map backdrop): each of those routes checks
// Storage-truth existence, then generates+uploads if missing, with the
// two steps not atomic -- two near-simultaneous requests (a double-
// click, or the same page open in two tabs) can both see "doesn't exist
// yet" and both pay for a real Claude+Gemini call, with the second
// Storage write silently overwriting the first.
//
// withLock() serializes calls sharing the same key so the second caller
// only starts its own check-then-act section after the first one's has
// fully finished -- by which point the resource actually exists, so the
// second caller's own exists-check (run again, inside the lock) sees
// that and skips straight to returning the already-generated URL instead
// of spending anything.
//
// This only guards against races within THIS Node process. If the app
// ever runs as multiple instances behind a load balancer, this stops
// being sufficient and these routes would need a real DB-level lock
// instead (e.g. a Postgres advisory lock, or a unique-constraint claim
// row like migrations/017_stripe_webhook_idempotency.sql's event claim)
// -- not needed at current single-instance scale.
const chains = new Map(); // key -> tail Promise of the current queue

async function withLock(key, fn) {
  const prior = chains.get(key) || Promise.resolve();
  const run = prior.then(fn, fn);
  const tail = run.then(() => {}, () => {});
  chains.set(key, tail);
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key); // avoid unbounded growth once idle
  });
  return run;
}

// Counting semaphore -- caps how many callers can be inside `run(fn)`'s
// critical section at once, queueing the rest in call order. Built for
// lib/pdfExport.js and lib/dungeonMapCompositor.js, which both launch a
// full headless Chromium process per call with no cap at all -- a burst
// of export/map-compositing requests could otherwise spin up many
// simultaneous Chromium processes with no queue, competing for CPU/
// memory on a single Node process/dyno. Unlike withLock() above (one
// slot per key), this is a fixed number of slots shared across ALL
// callers regardless of key -- there's no per-resource identity here,
// just "how many Chromiums may exist right now."
function createSemaphore(maxConcurrent) {
  let active = 0;
  const queue = [];

  function drain() {
    while (active < maxConcurrent && queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      active++;
      Promise.resolve()
        .then(fn)
        .then(
          (result) => { active--; resolve(result); drain(); },
          (err) => { active--; reject(err); drain(); }
        );
    }
  }

  function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      drain();
    });
  }

  return { run };
}

// Shared across pdfExport.js and dungeonMapCompositor.js -- both draw
// from the same Chromium concurrency budget, since it's the same finite
// CPU/memory either one competes for. 2 is a conservative starting point
// for current single-instance beta scale; revisit if real usage shows
// exports/map-compositing queueing noticeably.
const chromiumSemaphore = createSemaphore(2);

module.exports = { withLock, createSemaphore, chromiumSemaphore };
