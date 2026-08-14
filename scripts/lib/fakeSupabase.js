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

const db = { entries: [], world_config: [], user_settings: [] };

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
  order() { return this; }
  insert(row) { this.op = { type: "insert", row }; return this; }
  update(patch) { this.op = { type: "update", patch }; return this; }
  upsert(row, opts) { this.op = { type: "upsert", row, onConflict: (opts && opts.onConflict) || "" }; return this; }
  delete() { this.op = { type: "delete" }; return this; }
  maybeSingle() { this._single = "maybe"; return this; }
  single() { this._single = "required"; return this; }

  _run() {
    const rows = db[this.table];
    if (this.op.type === "insert") {
      const row = { ...this.op.row, id: rows.length + 1 };
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
    const filtered = rows.filter((r) => matches(r, this.filters));
    if (this._single === "maybe") return { data: filtered[0] || null, error: null };
    if (this._single === "required") return { data: filtered[0], error: filtered[0] ? null : { message: "not found" } };
    return { data: filtered, error: null };
  }

  then(resolve, reject) {
    try {
      resolve(this._run());
    } catch (err) {
      reject(err);
    }
  }
}

// The only two RPCs the default (BILLING_ENABLED unset/false) legacy cap
// path in middleware/enforceGenerationCap.js calls -- both are real
// Postgres functions with no query-builder equivalent, so they need their
// own hand-rolled semantics rather than falling out of FakeQuery generically.
// billingRepo.js's RPCs (subscription/credit path) are deliberately NOT
// covered here -- BILLING_ENABLED is off by default, so that branch never
// runs in this sandbox and doesn't need a fake.
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
  return { data: null, error: { message: `fakeSupabase: unhandled rpc "${fn}"` } };
}

const fakeSupabase = {
  from(table) {
    if (!db[table]) db[table] = [];
    return new FakeQuery(table);
  },
  rpc(fn, params) {
    return {
      then(resolve, reject) {
        try {
          resolve(fakeRpc(fn, params));
        } catch (err) {
          reject(err);
        }
      }
    };
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
