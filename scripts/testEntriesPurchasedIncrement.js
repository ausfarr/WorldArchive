// scripts/testEntriesPurchasedIncrement.js
//
// Regression test for the lost-update race in lib/worldConfigRepo.js's
// addPurchasedEntries(): it used to be a plain JS read-modify-write
// (select entries_purchased, add amount, update), justified as safe
// because it's "only called once per Stripe webhook event" -- true for
// one event, but two DIFFERENT checkout.session.completed events for the
// same world (two quick entry-pack purchases, or a Stripe redelivery)
// can race each other and silently lose one purchase's +25 entries.
// migrations/026_atomic_entries_purchased_increment.sql moves the add
// into a single-round-trip Postgres UPDATE; this exercises the fixed
// function against scripts/lib/fakeSupabase.js's in-memory rpc fake
// (which models that same single-round-trip semantics) with two
// concurrent calls fired without awaiting in between, the same shape as
// two near-simultaneous webhook deliveries.
//
// Run with: node scripts/testEntriesPurchasedIncrement.js

const fakeSupabase = require("./lib/fakeSupabase");
fakeSupabase.install();

const { addPurchasedEntries, getEntriesPurchased } = require("../lib/worldConfigRepo");

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

(async () => {
  console.log("Testing lib/worldConfigRepo.js's addPurchasedEntries() atomic increment...");

  console.log("\nTwo concurrent purchases for the same world both land (no lost update):");
  const worldId = "world-purchase-race";

  // Fire both +25 purchases without awaiting in between -- same as two
  // checkout.session.completed webhook deliveries arriving close together.
  const pA = addPurchasedEntries(worldId, 25);
  const pB = addPurchasedEntries(worldId, 25);
  const [totalA, totalB] = await Promise.all([pA, pB]);

  check("both calls report a total (neither silently dropped the other's write)", totalA !== totalB, `totalA=${totalA} totalB=${totalB}`);
  check("the two reported totals are exactly 25 apart", Math.abs(totalA - totalB) === 25, `totalA=${totalA} totalB=${totalB}`);

  const finalTotal = await getEntriesPurchased(worldId);
  check("final entries_purchased reflects BOTH purchases (50), not just one (25)", finalTotal === 50, `finalTotal=${finalTotal}`);

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
