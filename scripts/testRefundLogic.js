// scripts/testRefundLogic.js
//
// Standalone test script for middleware/enforceGenerationCap.js's
// makeRefundOnce() -- the Phase 12 (Differential Billing) partial-refund
// bookkeeping. No DB/network needed: doRefund is a fake callback that
// just records what it was called with, so this exercises the pure
// remaining-balance math in isolation from the real
// refundGenerationCount/refundSubscriptionGeneration calls it wraps.
//
// Run with: node scripts/testRefundLogic.js

const { makeRefundOnce } = require("../middleware/enforceGenerationCap");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function makeFakeRefund(shouldThrow) {
  const calls = [];
  const fn = async (amt) => {
    calls.push(amt);
    if (shouldThrow) throw new Error("simulated refund failure");
  };
  fn.calls = calls;
  return fn;
}

async function testFullRefundNoArg() {
  console.log("\nExisting no-arg call sites (every route today) still get a full refund:");
  const doRefund = makeFakeRefund();
  const refundGeneration = makeRefundOnce(doRefund, 5);
  await refundGeneration();
  check("no-arg call refunds the full amount", JSON.stringify(doRefund.calls) === JSON.stringify([5]), JSON.stringify(doRefund.calls));

  await refundGeneration();
  check("idempotent -- a second no-arg call is a no-op", doRefund.calls.length === 1);
}

async function testPartialRefund() {
  console.log("\nPartial refund (Reflavor tier -- refund the gap down to field-assist cost):");
  const doRefund = makeFakeRefund();
  const refundGeneration = makeRefundOnce(doRefund, 5);
  await refundGeneration(4); // POINTS_PER_GENERATION(5) - POINTS_PER_FIELD_ASSIST(1)
  check("partial refund passes the requested amount through", JSON.stringify(doRefund.calls) === JSON.stringify([4]), JSON.stringify(doRefund.calls));

  console.log("\nA later no-arg call after a partial refund only takes what's left (never double-refunds):");
  await refundGeneration();
  check("second call refunds only the 1 point still outstanding", JSON.stringify(doRefund.calls) === JSON.stringify([4, 1]), JSON.stringify(doRefund.calls));

  await refundGeneration();
  check("fully drained -- a third call is a no-op", doRefund.calls.length === 2);
}

async function testOverRefundClamped() {
  console.log("\nRequesting more than what's outstanding is clamped, not an error:");
  const doRefund = makeFakeRefund();
  const refundGeneration = makeRefundOnce(doRefund, 5);
  await refundGeneration(100);
  check("clamped to the actual outstanding amount (5), not the requested 100", JSON.stringify(doRefund.calls) === JSON.stringify([5]), JSON.stringify(doRefund.calls));
}

async function testZeroAndNegativeAmounts() {
  console.log("\nZero/negative amounts are no-ops (never call doRefund, never touch remaining):");
  const doRefund = makeFakeRefund();
  const refundGeneration = makeRefundOnce(doRefund, 5);
  await refundGeneration(0);
  check("refundGeneration(0) never calls doRefund", doRefund.calls.length === 0);
  await refundGeneration(-3);
  check("refundGeneration(-3) never calls doRefund", doRefund.calls.length === 0);

  await refundGeneration();
  check("full 5 still available afterward -- zero/negative calls didn't burn any of the balance", JSON.stringify(doRefund.calls) === JSON.stringify([5]), JSON.stringify(doRefund.calls));
}

async function testFailedRefundRestoresBalance() {
  console.log("\nA failed doRefund() restores the attempted amount so a later call can retry:");
  const doRefund = makeFakeRefund(true /* shouldThrow -- every call fails */);
  const refundGeneration = makeRefundOnce(doRefund, 5);

  await refundGeneration(4); // attempts 4, throws, swallowed, remaining restored to 5
  check("swallows the doRefund error rather than throwing", true); // reaching this line at all proves it didn't throw
  check("first attempt requested 4", JSON.stringify(doRefund.calls) === JSON.stringify([4]), JSON.stringify(doRefund.calls));

  await refundGeneration(); // no-arg -- if remaining were left at 5-4=1, this would request 1; restoration means it requests the full 5
  check("second attempt requests the full 5 (not 1) -- proves the failed 4 was restored to `remaining`, not deducted", JSON.stringify(doRefund.calls) === JSON.stringify([4, 5]), JSON.stringify(doRefund.calls));
}

(async () => {
  console.log("Testing middleware/enforceGenerationCap.js's makeRefundOnce()...");
  await testFullRefundNoArg();
  await testPartialRefund();
  await testOverRefundClamped();
  await testZeroAndNegativeAmounts();
  await testFailedRefundRestoresBalance();

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
