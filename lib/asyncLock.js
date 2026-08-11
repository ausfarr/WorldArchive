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

module.exports = { withLock };
