// scripts/testEntryCapRefund.js
//
// Standalone regression test for two enforceEntryCapOnGenerate bugs:
//
// 1. The refund bug: every /generate-X route mounts enforceGenerationCap
//    BEFORE enforceEntryCapOnGenerate (see middleware/enforceEntryCap.js's
//    own comment on that ordering), so by the time the entry cap runs,
//    enforceGenerationCap has already deducted points/quota/a credit and
//    attached req.refundGeneration(). Before this fix, a 403 from the
//    entry cap never called it -- a world sitting at its entry cap burned
//    a full generation's spend on every single attempt for zero output.
//
// 2. The reservation race: two near-simultaneous /generate-X requests for
//    a world's last remaining entry slot could both pass the cap check
//    before either's save landed, since a real AI call sits between the
//    check and the eventual write. See middleware/enforceEntryCap.js's
//    reserveEntryCapSlot() for the in-process fix this exercises.
//
// This stubs billingRepo/entriesRepo/worldConfigRepo via require.cache
// (no DB needed) to exercise enforceEntryCapOnGenerate directly.
//
// Run with: node scripts/testEntryCapRefund.js

const path = require("path");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function stub(relPathFromLib, exportsObj) {
  const fullPath = path.join(__dirname, "..", "lib", relPathFromLib);
  require.cache[require.resolve(fullPath)] = { id: fullPath, filename: fullPath, loaded: true, exports: exportsObj };
}

function makeRes() {
  const res = { statusCode: null, body: null, _finishHandlers: [] };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  // Real Express res is an EventEmitter that fires "finish" once the
  // response is sent -- enforceEntryCapOnGenerate's reservation-release
  // hooks that event, so this fake needs it too (see fireFinish() below).
  res.on = (event, handler) => { if (event === "finish") res._finishHandlers.push(handler); };
  return res;
}

function fireFinish(res) {
  res._finishHandlers.forEach((h) => h());
}

async function testRefundsOnRejection() {
  console.log("\nEntry cap rejection refunds the already-spent generation points:");
  process.env.BILLING_ENABLED = "true";

  // Trial user (no active subscription), sitting AT the free cap (30/30).
  stub("billingRepo.js", { getSubscription: async () => null });
  stub("entriesRepo.js", { countEntries: async () => 30 });
  stub("worldConfigRepo.js", { getEntriesPurchased: async () => 0, FREE_ENTRY_CAP: 30 });

  delete require.cache[require.resolve("../middleware/enforceEntryCap")];
  const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");

  let refunded = false;
  const req = {
    worldId: "world-1",
    userId: "user-1",
    body: {},
    refundGeneration: async () => { refunded = true; }
  };
  const res = makeRes();
  let nextCalled = false;
  await enforceEntryCapOnGenerate(req, res, () => { nextCalled = true; });

  check("responds 403 entry_cap_reached", res.statusCode === 403 && res.body.error === "entry_cap_reached", JSON.stringify(res.body));
  check("calls req.refundGeneration() before rejecting", refunded === true);
  check("never calls next() on rejection", nextCalled === false);
}

async function testNoRefundWhenAllowed() {
  console.log("\nUnder the cap: no refund fired, next() is called normally:");
  process.env.BILLING_ENABLED = "true";

  stub("billingRepo.js", { getSubscription: async () => null });
  stub("entriesRepo.js", { countEntries: async () => 5 });
  stub("worldConfigRepo.js", { getEntriesPurchased: async () => 0, FREE_ENTRY_CAP: 30 });

  delete require.cache[require.resolve("../middleware/enforceEntryCap")];
  const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");

  let refunded = false;
  const req = {
    worldId: "world-1",
    userId: "user-1",
    body: {},
    refundGeneration: async () => { refunded = true; }
  };
  const res = makeRes();
  let nextCalled = false;
  await enforceEntryCapOnGenerate(req, res, () => { nextCalled = true; });

  check("calls next() when under the cap", nextCalled === true);
  check("does not refund when the entry is actually allowed through", refunded === false);
  check("res never gets a status set on the allowed path", res.statusCode === null);
}

async function testBillingDisabledSkipsEntirely() {
  console.log("\nBILLING_ENABLED off: legacy beta behavior, no cap, no refund call at all:");
  process.env.BILLING_ENABLED = "false";

  delete require.cache[require.resolve("../middleware/enforceEntryCap")];
  const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");

  let refunded = false;
  const req = { worldId: "world-1", userId: "user-1", body: {}, refundGeneration: async () => { refunded = true; } };
  const res = makeRes();
  let nextCalled = false;
  await enforceEntryCapOnGenerate(req, res, () => { nextCalled = true; });

  check("calls next() unconditionally with billing off", nextCalled === true);
  check("never touches refundGeneration when there's no cap to hit", refunded === false);
}

async function testReservationClosesRace() {
  console.log("\nConcurrent requests can't both slip through a world's last remaining entry slot:");
  process.env.BILLING_ENABLED = "true";

  // One slot left: 29 real entries against a 30-entry free cap.
  stub("billingRepo.js", { getSubscription: async () => null });
  stub("entriesRepo.js", { countEntries: async () => 29 });
  stub("worldConfigRepo.js", { getEntriesPurchased: async () => 0, FREE_ENTRY_CAP: 30 });

  delete require.cache[require.resolve("../middleware/enforceEntryCap")];
  const { enforceEntryCapOnGenerate } = require("../middleware/enforceEntryCap");

  const makeReq = () => ({ worldId: "world-race", userId: "user-1", body: {}, refundGeneration: async () => {} });

  const resA = makeRes();
  const resB = makeRes();
  let nextA = false;
  let nextB = false;

  // Fire both "requests" without awaiting in between -- same as two
  // near-simultaneous real HTTP requests hitting this middleware.
  const pA = enforceEntryCapOnGenerate(makeReq(), resA, () => { nextA = true; });
  const pB = enforceEntryCapOnGenerate(makeReq(), resB, () => { nextB = true; });
  await Promise.all([pA, pB]);

  const exactlyOneGotThrough = (nextA && !nextB && resB.statusCode === 403) || (nextB && !nextA && resA.statusCode === 403);
  check(
    "exactly one of two concurrent requests for the last slot gets through",
    exactlyOneGotThrough,
    `nextA=${nextA} nextB=${nextB} resA.status=${resA.statusCode} resB.status=${resB.statusCode}`
  );

  // Whichever request got through finishes (saved or errored downstream,
  // doesn't matter which) -- release its reservation the same way real
  // Express does when the response is sent.
  fireFinish(nextA ? resA : resB);

  const resC = makeRes();
  let nextC = false;
  await enforceEntryCapOnGenerate(makeReq(), resC, () => { nextC = true; });
  check("a third request is allowed again once the first reservation is released", nextC === true, `resC.status=${resC.statusCode}`);
}

(async () => {
  console.log("Testing middleware/enforceEntryCap.js's enforceEntryCapOnGenerate()...");
  await testRefundsOnRejection();
  await testNoRefundWhenAllowed();
  await testBillingDisabledSkipsEntirely();
  await testReservationClosesRace();

  console.log("\n" + "=".repeat(60));
  if (failures.length === 0) {
    console.log(`All checks passed.`);
    process.exit(0);
  } else {
    console.log(`${failures.length} check(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
})();
