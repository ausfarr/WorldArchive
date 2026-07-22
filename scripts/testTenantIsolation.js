// scripts/testTenantIsolation.js
//
// Phase 1, Section 6, step 3 (multi_tenant_pivot_scope.md): rebuilds the
// tenant-isolation test against the real Supabase project, replacing the
// earlier flat-file version (lib/tenant.js era) that was never deployed.
//
// What this proves, end to end against real Supabase Auth + Postgres:
//   1. Two distinct users get two distinct worlds (getOrCreateWorldId).
//   2. Calling getOrCreateWorldId again for the same user is idempotent
//      -- no duplicate world, same id returned.
//   3. Two NEAR-SIMULTANEOUS first-ever calls for the same brand-new user
//      (the real race condition the unique-constraint/23505 handling in
//      middleware/resolveTenant.js exists for) still resolve to exactly
//      one world, not two, and don't throw.
//   4. An entry written to World A is invisible to World B, both via
//      listEntries() (the manifest/grid view) AND getEntry() by exact id
//      (the sharper check -- confirms scoping isn't just a list filter
//      that a direct lookup could bypass).
//
// Does NOT exercise the actual /api/generate-* routes -- those cost real
// Claude API calls and aren't what's being tested here. This test only
// exercises the tenant-scoping mechanism itself (resolveTenant +
// entriesRepo), which is the part Section 6 step 3 asks to verify.
//
// Run with: node scripts/testTenantIsolation.js
// Requires SUPABASE_URL / SUPABASE_SECRET_KEY env vars, same as the
// server. Creates and fully cleans up its own throwaway test users --
// safe to run against the real project, including in CI.

const { supabase } = require("../lib/supabaseClient");
const { getOrCreateWorldId } = require("../middleware/resolveTenant");
const { listEntries, getEntry, upsertEntry } = require("../lib/entriesRepo");

const failures = [];
function check(label, condition) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}`);
    failures.push(label);
  }
}

async function createTestUser(label) {
  const email = `tenant-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@worldforge.test`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "throwaway-test-password-1",
    email_confirm: true // admin-created, so we can skip the confirmation flow for automated testing
  });
  if (error) throw new Error(`Failed to create test user ${label}: ${error.message}`);
  return data.user;
}

async function deleteWorldAndEntries(worldId) {
  if (!worldId) return;
  await supabase.from("entries").delete().eq("world_id", worldId);
  await supabase.from("worlds").delete().eq("id", worldId);
}

async function main() {
  console.log("== World Forge tenant isolation test ==\n");

  let userA, userB, userC;
  let worldIdA, worldIdB, worldIdC;

  try {
    console.log("Creating throwaway test users...");
    userA = await createTestUser("a");
    userB = await createTestUser("b");
    userC = await createTestUser("c");
    console.log(`  user A: ${userA.id}`);
    console.log(`  user B: ${userB.id}`);
    console.log(`  user C: ${userC.id}\n`);

    console.log("Test 1-2: distinct worlds + idempotency");
    worldIdA = await getOrCreateWorldId(userA.id);
    worldIdB = await getOrCreateWorldId(userB.id);
    const worldIdAAgain = await getOrCreateWorldId(userA.id);
    check("user A and user B get different worlds", worldIdA !== worldIdB);
    check("calling getOrCreateWorldId again for user A returns the same world (idempotent)", worldIdA === worldIdAAgain);
    console.log("");

    console.log("Test 3: race safety on a brand-new user's first-ever concurrent requests");
    const [raceResult1, raceResult2] = await Promise.all([
      getOrCreateWorldId(userC.id),
      getOrCreateWorldId(userC.id)
    ]);
    worldIdC = raceResult1;
    check("both concurrent first-time calls resolved without throwing", true); // if either threw, we wouldn't reach this line
    check("both concurrent calls agree on the same world id", raceResult1 === raceResult2);
    console.log("");

    console.log("Test 4: entry-level cross-tenant isolation");
    await upsertEntry(worldIdA, "npcs", {
      id: "test-isolation-npc-a",
      name: "Test NPC (World A)",
      subtitle: "Isolation test fixture",
      faction: null,
      tags: [],
      bodyHtml: "<p>World A test fixture.</p>"
    });
    await upsertEntry(worldIdB, "npcs", {
      id: "test-isolation-npc-b",
      name: "Test NPC (World B)",
      subtitle: "Isolation test fixture",
      faction: null,
      tags: [],
      bodyHtml: "<p>World B test fixture.</p>"
    });

    const listA = await listEntries(worldIdA, "npcs");
    const listB = await listEntries(worldIdB, "npcs");
    check("World A's list includes its own entry", listA.some((e) => e.id === "test-isolation-npc-a"));
    check("World A's list does NOT include World B's entry", !listA.some((e) => e.id === "test-isolation-npc-b"));
    check("World B's list includes its own entry", listB.some((e) => e.id === "test-isolation-npc-b"));
    check("World B's list does NOT include World A's entry", !listB.some((e) => e.id === "test-isolation-npc-a"));

    const crossLookup = await getEntry(worldIdA, "npcs", "test-isolation-npc-b");
    check("World A cannot fetch World B's entry by exact id (direct lookup, not just list-filtered)", crossLookup === null);
    console.log("");
  } finally {
    console.log("Cleaning up test fixtures...");
    await deleteWorldAndEntries(worldIdA);
    await deleteWorldAndEntries(worldIdB);
    await deleteWorldAndEntries(worldIdC);
    for (const user of [userA, userB, userC]) {
      if (user) {
        const { error } = await supabase.auth.admin.deleteUser(user.id);
        if (error) console.warn(`  Warning: failed to delete test user ${user.id}: ${error.message}`);
      }
    }
    console.log("  done.\n");
  }

  if (failures.length > 0) {
    console.log(`RESULT: ${failures.length} check(s) failed:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("RESULT: all checks passed.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
