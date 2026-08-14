// scripts/testEntryCapRefund.js
//
// Standalone regression test for the entry-cap refund bug: every
// /generate-X route mounts enforceGenerationCap BEFORE
// enforceEntryCapOnGenerate (see middleware/enforceEntryCap.js's own
// comment on that ordering), so by the time the entry cap runs,
// enforceGenerationCap has already deducted points/quota/a credit and
// attached req.refundGeneration(). Before this fix, a 403 from the entry
// cap never called it -- a world sitting at its entry cap burned a full
// generation's spend on every single attempt for zero output. This
// stubs billingRepo/entriesRepo/worldConfigRepo via require.cache (no DB
// needed) to exercise enforceEntryCapOnGenerate's two branches directly.
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
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
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

(async () => {
  console.log("Testing middleware/enforceEntryCap.js's enforceEntryCapOnGenerate() refund-on-reject fix...");
  await testRefundsOnRejection();
  await testNoRefundWhenAllowed();
  await testBillingDisabledSkipsEntirely();

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
