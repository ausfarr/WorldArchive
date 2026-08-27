// scripts/lib/fakeSupabase.js
//
// In-memory fake for the @supabase/supabase-js query-builder + rpc surface
// (from/select/eq/order/maybeSingle/single/insert/update/upsert, plus the
// two RPCs the legacy generation-cap path calls), covering exactly the
// subset lib/entriesRepo.js, lib/worldConfigRepo.js, lib/userSettingsRepo.js
// and middleware/enforceGenerationCap.js actually use. Same approach
// scripts/testProceduralRulesetGenerators.js pioneered -- factored out here
// because scripts/testPipeline.js and scripts/testEnemyPipeline.js both need
// it verbatim (an HTTP-route pipeline test, unlike
// testProceduralRulesetGenerators.js's direct-function-call style, has to go
// through the requireAiEnabled/enforceGenerationCap middleware chain too,
// which needs user_settings + the generation-count RPCs on top of the plain
// table fake). Every other scripts/*.js file stays intentionally standalone
// per repo convention (CLAUDE.md's "read individually" note) -- this one
// module is the one exception, since duplicating a ~90-line fake verbatim
// across two files would just be a bug waiting to drift between copies.
//
// install() must run before any real app module is required (it patches
// require.cache for "../lib/supabaseClient" relative to itself, i.e.
// ../../lib/supabaseClient from here) -- see each call site.

const db = { entries: [], world_config: [], user_settings: [], subscriptions: [] };

function matches(row, filters) {
  return filters.every(([col, val]) => row[col] === val);
}

class FakeQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.op = { type: "select" };
  }
  select() { return this; }
  eq(col, val) { this.filters.push([col, val]); return this; }
  // Only the one real caller's shape is supported --
  // lib/srdLibraryRepo.js's findNearestCrMonsters() calls
  // .not("cr", "is", null) to exclude monsters with no parsed CR. Any
  // other op fails loudly rather than silently mis-filtering.
  not(col, op, val) {
    if (op !== "is" || val !== null) throw new Error(`fakeSupabase: unhandled not(${col}, ${op}, ${val})`);
    this.notNullFilters = this.notNullFilters || [];
    this.notNullFilters.push(col);
    return this;
  }
  // Accumulates every .order() call (chained multi-column order, same as
  // PostgREST -- lib/calendarNotableDatesRepo.js's listNotableDates()
  // chains .order("month_index").order("day") and expects both to
  // apply) instead of the previous no-op, which happened to look correct
  // only because every earlier caller's single .order("created_at")
  // coincided with insertion order anyway.
  order(col, opts) {
    this.orderBy = this.orderBy || [];
    this.orderBy.push({ col, ascending: !opts || opts.ascending !== false });
    return this;
  }
  insert(row) { this.op = { type: "insert", row }; return this; }
  update(patch) { this.op = { type: "update", patch }; return this; }
  upsert(row, opts) { this.op = { type: "upsert", row, onConflict: (opts && opts.onConflict) || "" }; return this; }
  delete() { this.op = { type: "delete" }; return this; }
  maybeSingle() { this._single = "maybe"; return this; }
  single() { this._single = "required"; return this; }

  _run() {
    const rows = db[this.table];
    if (this.op.type === "insert") {
      // Every real table this fake backs has a `uuid` primary key (see
      // migrations/*.sql) -- callers that compare an inserted row's id
      // against a route param (a string, e.g. req.params.id) rely on
      // that id being a string too. A bare numeric counter broke
      // strict === comparisons in matches() the moment a test round-
      // tripped an id through an HTTP route (scripts/testEntryDrift
      // Suggestions.js's dismiss/apply calls) -- caught there, fixed
      // here since every insert() caller shares this one fake.
      const row = { ...this.op.row, id: `fake-${rows.length + 1}` };
      rows.push(row);
      return { data: this._single ? row : [row], error: null };
    }
    if (this.op.type === "update") {
      const targets = rows.filter((r) => matches(r, this.filters));
      targets.forEach((r) => Object.assign(r, this.op.patch));
      return { data: this._single ? targets[0] : targets, error: null };
    }
    if (this.op.type === "delete") {
      const targets = rows.filter((r) => matches(r, this.filters));
      db[this.table] = rows.filter((r) => !matches(r, this.filters));
      // Same _single handling as insert/update above -- lib/calendar
      // NotableDatesRepo.js's deleteNotableDate() chains
      // .delete()...select().maybeSingle() and needs `data` to come back
      // as one object-or-null (so "not found" reads as a falsy null),
      // not an array that's truthy even when empty.
      if (this._single === "maybe") return { data: targets[0] || null, error: null };
      if (this._single === "required") return { data: targets[0], error: targets[0] ? null : { message: "not found" } };
      return { data: targets, error: null };
    }
    if (this.op.type === "upsert") {
      const onConflictCols = this.op.onConflict.split(",").map((s) => s.trim()).filter(Boolean);
      const existing = onConflictCols.length
        ? rows.find((r) => onConflictCols.every((c) => r[c] === this.op.row[c]))
        : null;
      let row;
      if (existing) {
        Object.assign(existing, this.op.row);
        row = existing;
      } else {
        row = { ...this.op.row };
        rows.push(row);
      }
      return { data: this._single ? row : [row], error: null };
    }
    // select
    let filtered = rows.filter((r) => matches(r, this.filters));
    if (this.notNullFilters) filtered = filtered.filter((r) => this.notNullFilters.every((col) => r[col] != null));
    if (this.orderBy && this.orderBy.length) {
      filtered = filtered.slice().sort((a, b) => {
        for (const { col, ascending } of this.orderBy) {
          if (a[col] < b[col]) return ascending ? -1 : 1;
          if (a[col] > b[col]) return ascending ? 1 : -1;
        }
        return 0;
      });
    }
    if (this._single === "maybe") return { data: filtered[0] || null, error: null };
    if (this._single === "required") return { data: filtered[0], error: filtered[0] ? null : { message: "not found" } };
    return { data: filtered, error: null };
  }

  // Resolves on a real macrotask (setImmediate), not a microtask, so this
  // fake actually behaves like the network round trip it's standing in for.
  // Before this, `resolve(this._run())` ran synchronously off a resolved
  // promise -- every awaited call anywhere in a request handler drained via
  // the microtask queue without ever yielding back to the event loop, so
  // two concurrent HTTP requests to a test server backed by this fake could
  // never actually interleave: request 1's whole handler (however many
  // awaited Supabase calls it makes) would finish before request 2's
  // handler got a turn. That made this fake structurally unable to
  // reproduce the check-then-act races this codebase has repeatedly fixed
  // (lib/asyncLock.js's withLock() call sites) -- a regression test for one
  // of those fixes could pass against the pre-fix code for the wrong
  // reason (no real race ever occurred), not because the fix worked. See
  // scripts/testEntryDriftSuggestions.js's Test 9 for the case that flagged
  // this gap.
  then(resolve, reject) {
    setImmediate(() => {
      try {
        resolve(this._run());
      } catch (err) {
        reject(err);
      }
    });
  }
}

// The core RPCs the default (BILLING_ENABLED unset/false) legacy cap path
// in middleware/enforceGenerationCap.js calls, plus increment_entries_
// purchased (used by lib/worldConfigRepo.js's addPurchasedEntries,
// regardless of BILLING_ENABLED -- see scripts/testEntriesPurchasedIncrement.js)
// -- all real Postgres functions with no query-builder equivalent, so they
// need their own hand-rolled semantics rather than falling out of
// FakeQuery generically. billingRepo.js's own subscription-quota RPCs
// (check_and_spend_subscription_generation/refund_subscription_generation)
// and reset_free_cycle_if_elapsed were added once a BILLING_ENABLED=true
// test actually needed them (scripts/testSessionPrepRegenerateGate.js) --
// simplified versions of their real migrations/012+015/029 SQL: no
// credit_ledger fallback (nothing in this repo's tests exercises that
// path yet), and reset_free_cycle_if_elapsed is a pure no-op since no
// test needs actual cycle-rollover behavior, just for the call not to
// throw. image-quota RPCs (check_and_increment_image_generation_count/
// refund_image_generation_count) are still NOT covered -- no test in this
// repo exercises image generation under fakeSupabase yet.
function fakeRpc(fn, params) {
  if (fn === "check_and_increment_generation_count") {
    const row = db.world_config.find((r) => r.world_id === params.p_world_id);
    const current = (row && row.generation_count) || 0;
    const allowed = current + params.p_amount <= params.p_cap;
    if (allowed && row) row.generation_count = current + params.p_amount;
    return { data: [{ allowed, new_count: allowed ? current + params.p_amount : current }], error: null };
  }
  if (fn === "refund_generation_count") {
    const row = db.world_config.find((r) => r.world_id === params.p_world_id);
    if (row) row.generation_count = Math.max(0, (row.generation_count || 0) - params.p_amount);
    return { data: null, error: null };
  }
  if (fn === "increment_entries_purchased") {
    const row = db.world_config.find((r) => r.world_id === params.p_world_id);
    if (!row) return { data: null, error: { message: `world_config row for world_id ${params.p_world_id} does not exist` } };
    row.entries_purchased = (row.entries_purchased || 0) + params.p_amount;
    return { data: row.entries_purchased, error: null };
  }
  if (fn === "reset_free_cycle_if_elapsed") {
    return { data: null, error: null };
  }
  if (fn === "check_and_spend_subscription_generation") {
    const sub = db.subscriptions.find((s) => s.user_id === params.p_user_id);
    if (!sub) return { data: null, error: { message: `no subscription row for user_id ${params.p_user_id}` } };
    const amount = params.p_amount || 1;
    const quota = sub.status === "active" ? (sub.monthly_quota || 0) : 0;
    const used = sub.used_this_cycle || 0;
    if (used + amount <= quota) {
      sub.used_this_cycle = used + amount;
      return { data: [{ allowed: true, used_this_cycle: sub.used_this_cycle, credit_balance: 0, source: "quota" }], error: null };
    }
    return { data: [{ allowed: false, used_this_cycle: used, credit_balance: 0, source: "none" }], error: null };
  }
  if (fn === "refund_subscription_generation") {
    const sub = db.subscriptions.find((s) => s.user_id === params.p_user_id);
    if (sub) sub.used_this_cycle = Math.max(0, (sub.used_this_cycle || 0) - params.p_amount);
    return { data: null, error: null };
  }
  return { data: null, error: { message: `fakeSupabase: unhandled rpc "${fn}"` } };
}

const fakeSupabase = {
  from(table) {
    if (!db[table]) db[table] = [];
    return new FakeQuery(table);
  },
  rpc(fn, params) {
    return {
      // Same real-macrotask-yield reasoning as FakeQuery.prototype.then
      // above -- this backs the generation-cap/entry-cap RPCs, which is
      // exactly the code enforceEntryCap.js's own withLock() fix guards.
      then(resolve, reject) {
        setImmediate(() => {
          try {
            resolve(fakeRpc(fn, params));
          } catch (err) {
            reject(err);
          }
        });
      }
    };
  },
  // Minimal stub for lib/fileWriter.js's portrait storage calls
  // (getPortraitUrl/deleteAllPortraits) -- previously missing entirely,
  // which forced every test through HAS_PORTRAIT categories (npcs,
  // enemies, items, survivors, classes, locations -- see routes/
  // confirmEntry.js) to retarget onto a non-portrait category (factions/
  // logs) just to dodge a "Cannot read properties of undefined (reading
  // 'from')" crash on supabase.storage. getPublicUrl is real Supabase's
  // pure URL-construction call (no network round trip even for the real
  // client), so faking it deterministically is faithful, not a
  // simplification; list/remove are unused by any current test but
  // stubbed for the same reason deleteAllPortraits might otherwise crash
  // a future one.
  storage: {
    from(bucket) {
      return {
        getPublicUrl(path) {
          return { data: { publicUrl: `https://fake-storage.test/${bucket}/${path}` } };
        },
        list() {
          return Promise.resolve({ data: [], error: null });
        },
        remove() {
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  }
};

function install() {
  const supabaseClientPath = require.resolve("../../lib/supabaseClient");
  require.cache[supabaseClientPath] = {
    id: supabaseClientPath,
    filename: supabaseClientPath,
    loaded: true,
    exports: { supabase: fakeSupabase }
  };
}

module.exports = { install, db };
