// The Archive — shared rendering engine
// Works entirely from small .js data files (not fetch/JSON) so the site
// keeps working when opened directly from disk (file://), where fetch()
// of local files is blocked by browser CORS rules.

const CATEGORY_LABELS = {
  factions: "Factions",
  npcs: "NPCs",
  enemies: "Bestiary",
  classes: "Classes",
  items: "Items",
  logs: "Logs",
  survivors: "Survivors",
  locations: "Locations"
};

// TODO(Austin): swap in the real Google Form URL once created.
const BETA_FEEDBACK_FORM_URL = "https://forms.gle/UuQSHAetFnkAXxV87";

// Turns a failed-generation response body into a display string.
//
// Every generate-* route reports errors as { error: "..." } (a human
// sentence, e.g. "Something went wrong"), EXCEPT
// middleware/enforceGenerationCap.js, which uniquely puts a machine code
// in `error` ("generation_cap_reached") and the human sentence in a
// separate `message` field. Preferring `message` over `error` handles
// both shapes correctly with one rule, and fixes a real existing bug:
// every "Generation failed" catch block across the 8 category pages (and
// the two handlers below) was showing the raw code
// "generation_cap_reached" verbatim to testers who hit the cap, instead
// of the friendly message that was already being sent.
//
// `asHtml: true` (the default, for the per-page status <p> elements,
// rendered via .innerHTML) adds a clickable link to the beta feedback
// form specifically for the cap-reached case, since that's the one
// error worth turning into an ask rather than just an apology.
// `asHtml: false` (for render.js's alert()-based flows, which can't
// render markup) appends the same URL as plain text instead.
function formatGenerationError(data, { asHtml = true } = {}) {
  const base = (data && (data.message || data.error)) || "Generation failed.";
  if (data && data.error === "generation_cap_reached") {
    return asHtml
      ? `${base} <a href="${BETA_FEEDBACK_FORM_URL}" target="_blank" rel="noopener" style="color: var(--neon-cyan); text-decoration: underline;">Got 2 minutes for a quick feedback form?</a>`
      : `${base} Feedback form: ${BETA_FEEDBACK_FORM_URL}`;
  }
  return base;
}
window.formatGenerationError = formatGenerationError;

// Per-category grouping + ordering for category index pages (see
// session_addendum_search_and_grouping.md). `groupBy` is a field name on
// each manifest entry to bucket under (null = no grouping, straight
// alphabetical). `orderField`/`order` define a fixed rank order *within*
// each group (or across all entries, if groupBy is null); entries whose
// value isn't in the `order` list, or where orderField is null, fall
// back to alphabetical-by-name.
const CATEGORY_SORT = {
  enemies: { groupBy: "faction", orderField: "tier", order: ["Trash", "Elite", "Boss"] },
  items: { groupBy: "itemCategory", orderField: "rarity", order: ["Common", "Uncommon", "Rare", "Legendary"] },
  npcs: {
    groupBy: "faction",
    orderField: "roleArchetype",
    // No existing "importance" field to sort by -- this rank order is a
    // new judgment call (power/plot-centrality descending), not pulled
    // from stored data. Easy one-line change if it feels wrong once live.
    order: ["Faction Leader", "Rival", "Quest-Giver", "Informant/Fixer", "Community VIP", "Merchant"]
  },
  locations: { groupBy: "faction", orderField: null, order: [] },
  classes: { groupBy: null, orderField: null, order: [] },
  survivors: { groupBy: null, orderField: null, order: [] },
  logs: { groupBy: null, orderField: null, order: [] },
  factions: { groupBy: null, orderField: null, order: [] }
};

// Display labels for Items' groupBy field (item.category values), kept
// separate from CATEGORY_LABELS since that map is keyed by archive
// category (npcs/items/...), not by a field *within* the items category.
const ITEM_CATEGORY_GROUP_LABELS = {
  Weapon: "Weapon",
  Armor: "Armor/Gear",
  Consumable: "Consumable",
  QuestItem: "Quest Item"
};

function byEntryName(a, b) {
  return (a.name || "").localeCompare(b.name || "");
}

function groupLabelFor(key, groupBy, factionLookup) {
  if (key === "__none__") return "Unaligned";
  if (groupBy === "faction") return (factionLookup[key] && factionLookup[key].name) || key;
  if (groupBy === "itemCategory") return ITEM_CATEGORY_GROUP_LABELS[key] || key;
  return key;
}

function orderWithinGroup(a, b, config) {
  if (config.orderField && config.order && config.order.length) {
    const idxA = config.order.indexOf(a[config.orderField]);
    const idxB = config.order.indexOf(b[config.orderField]);
    const rankA = idxA === -1 ? config.order.length : idxA;
    const rankB = idxB === -1 ? config.order.length : idxB;
    if (rankA !== rankB) return rankA - rankB;
  }
  return byEntryName(a, b);
}

// Buckets + orders a category's manifest per CATEGORY_SORT. Returns
// [{groupLabel, entries}, ...] -- groupLabel is null when the category
// has no grouping (classes/survivors/logs/factions), in which case
// there's exactly one bucket and the caller should skip rendering a
// group header.
function groupAndSortEntries(manifest, categoryPath, factionLookup) {
  const config = CATEGORY_SORT[categoryPath] || { groupBy: null, orderField: null, order: [] };
  const lookup = factionLookup || {};
  if (!config.groupBy) {
    return [{ groupLabel: null, entries: manifest.slice().sort((a, b) => orderWithinGroup(a, b, config)) }];
  }
  const groups = {};
  const groupKeys = [];
  manifest.forEach((entry) => {
    const key = entry[config.groupBy] || "__none__";
    if (!groups[key]) {
      groups[key] = [];
      groupKeys.push(key);
    }
    groups[key].push(entry);
  });
  // "Unaligned"/no-value group always sorts last; real groups sort
  // alphabetically by their display label.
  groupKeys.sort((a, b) => {
    if (a === "__none__") return 1;
    if (b === "__none__") return -1;
    return groupLabelFor(a, config.groupBy, lookup).localeCompare(groupLabelFor(b, config.groupBy, lookup));
  });
  return groupKeys.map((key) => ({
    groupLabel: groupLabelFor(key, config.groupBy, lookup),
    entries: groups[key].slice().sort((a, b) => orderWithinGroup(a, b, config))
  }));
}

// Categories where a locked/greyed-out placeholder can be filled in by the
// generator, and which API endpoint handles it. Survivors has no locked
// placeholders (the roster only ever grows via fresh generation), so it's
// intentionally absent here.
const FILL_IN_ENDPOINTS = {
  npcs: "/api/generate-npc",
  enemies: "/api/generate-enemy",
  items: "/api/generate-item",
  classes: "/api/generate-class",
  logs: "/api/generate-log",
  factions: "/api/generate-faction",
  locations: "/api/generate-location"
};

// Categories where an ALREADY-FILLED entry can be regenerated (revised in
// place). Unlike FILL_IN_ENDPOINTS, this includes survivors (no locked
// state, but any existing survivor can still be revised) and factions
// (no locked state either — factions are always "regenerate," never "fill").
const REGENERATE_ENDPOINTS = {
  npcs: "/api/generate-npc",
  enemies: "/api/generate-enemy",
  items: "/api/generate-item",
  classes: "/api/generate-class",
  logs: "/api/generate-log",
  survivors: "/api/generate-survivor",
  factions: "/api/generate-faction",
  locations: "/api/generate-location"
};

// Categories with a bespoke manual Edit form -- distinct from
// REGENERATE_ENDPOINTS (an AI-assisted rewrite with a preview/confirm
// step). Edit saves immediately (no AI call, no preview, doesn't count
// against the beta generation cap) by mutating the entry's existing
// `raw` JSON and writing it straight through the same /api/confirm-entry
// endpoint Regenerate's "Save This Version" already uses. Both buttons
// appear side by side on a card when present. Rolling out one category
// at a time (see session_addendum_tester_feedback_editable_content.md
// for the order) -- factions first, more get added to this map as their
// forms are built.
const EDIT_FORM_BUILDERS = {
  factions: showFactionEditForm,
  npcs: showNpcEditForm,
  enemies: showEnemyEditForm,
  classes: showClassEditForm,
  logs: showLogEditForm,
  locations: showLocationEditForm,
  items: showItemEditForm,
  survivors: showSurvivorEditForm
};

// Populates a faction <select>'s options from this world's LIVE Factions
// archive (via /api/entries/factions) instead of a hardcoded list. Used
// by the NPC/Bestiary "Generate New Entry" panels, which used to ship a
// static 4-faction Echoes list baked into lib/categoryPageTemplate.js at
// build time -- that never updated for a different world's factions (see
// this session's chat: the miss that prompted this fix). Uses each
// entry's own `.faction` field when set, falling back to `.id` -- same
// precedence as lib/worldFlavor.js's getFactionOptions() on the backend,
// so the value submitted here always matches what the generator actually
// expects.
async function populateFactionSelect(selectId, { includeUnaligned = false } = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const res = await authFetch("/api/entries/factions");
    const data = await res.json();
    const factions = (data && data.entries) || [];
    const options = ['<option value="">Let it choose</option>'];
    factions.forEach((f) => {
      const value = f.faction || f.id;
      options.push(`<option value="${value}">${f.name}</option>`);
    });
    if (includeUnaligned) options.push('<option value="unaligned">Unaligned</option>');
    select.innerHTML = options.join("\n");
  } catch (err) {
    console.error("Failed to load factions for dropdown:", err);
    // Leave whatever fallback options are already in the markup in
    // place -- generation still works via the text field, it just can't
    // offer a live faction picker if this call fails.
  }
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// factionLookup is {factionKey: {name, accentColor}} -- see
// getFactionLookup() below. Falls back to cyan for any faction that
// predates the accent-color feature or hasn't been assigned one yet
// (Echoes' original 5 included, until each is regenerated or given a
// color via the picker) rather than requiring a backfill.
function facColorVar(factionKey, factionLookup) {
  const entry = factionKey && factionLookup && factionLookup[factionKey];
  if (entry && entry.accentColor && HEX_COLOR_RE.test(entry.accentColor)) return entry.accentColor;
  return "var(--neon-cyan)";
}

// Fetches this world's real faction list and builds a
// {factionKey: {name, accentColor}} lookup, used for both tag TEXT and
// each entry's accent color -- replacing the two separate hardcoded maps
// (FACTION_LABEL, FACTION_COLORS) that only recognized Echoes' original 5
// factions (see this session's earlier chat: the "faction tags still
// don't show up" miss, and this session's Phase 4 work closing the
// matching color gap).
async function getFactionLookup() {
  try {
    const res = await authFetch("/api/entries/factions");
    const data = await res.json();
    const lookup = {};
    ((data && data.entries) || []).forEach((f) => {
      lookup[f.faction || f.id] = { name: f.name, accentColor: f.accentColor || null };
    });
    return lookup;
  } catch (err) {
    console.error("Failed to load faction lookup:", err);
    return {};
  }
}

// Called from a locked card's "Fill In" button. POSTs { fillExistingId }
// to the category's generate endpoint and reloads the page on success.
async function fillInEntry(categoryPath, id, btnEl) {
  const endpoint = FILL_IN_ENDPOINTS[categoryPath];
  if (!endpoint) return;
  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Generating…";
  try {
    const res = await authFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillExistingId: id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
    btnEl.textContent = "Done!";
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
    alert("Fill-in failed: " + err.message);
  }
}

// Called from an already-filled card's "Regenerate" button. POSTs
// { fillExistingId } to the category's generate endpoint. The backend
// treats any non-locked existing id as a regenerate and returns a preview
// (never writes immediately) — this opens that preview for review rather
// than reloading the page right away.
async function regenerateEntry(categoryPath, id, btnEl) {
  const endpoint = REGENERATE_ENDPOINTS[categoryPath];
  if (!endpoint) return;
  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Generating…";
  try {
    const res = await authFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillExistingId: id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
    btnEl.disabled = false;
    btnEl.textContent = originalText;
    if (data.preview) {
      showRegeneratePreview(data);
    } else {
      // Shouldn't normally happen for an already-filled entry, but handle
      // gracefully rather than silently doing nothing.
      window.location.reload();
    }
  } catch (err) {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
    alert("Regenerate failed: " + err.message);
  }
}

// Renders a full-screen overlay comparing the live entry to the freshly
// generated (not-yet-saved) version, with Confirm/Discard actions. Nothing
// is written to disk until "Save This Version" is clicked, which POSTs the
// exact previewed entry to /api/confirm-entry.
function showRegeneratePreview(data) {
  const existing = document.getElementById("regen-preview-overlay");
  if (existing) existing.remove();

  const oldPanel = data.oldBodyHtmlPreview
    ? data.oldBodyHtmlPreview
    : `<p style="color: var(--ink-faint); font-style: italic;">No prior structured content on record for this entry (it predates the regenerate feature) — only the new version is shown below.</p>`;

  const overlay = document.createElement("div");
  overlay.id = "regen-preview-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; overflow:auto; padding:40px 20px;";
  overlay.innerHTML = `
    <div style="max-width:1200px; margin:0 auto; background:var(--bg-panel); border:1px solid var(--border-line);">
      <div style="padding:20px 28px; border-bottom:1px solid var(--border-line-soft); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <h2 style="font-family:var(--font-display); text-transform:uppercase; margin:0; font-size:1.1rem;">Regenerate Preview — ${data.name}</h2>
        <button id="regen-discard-x" type="button" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:6px 12px; cursor:pointer; font-family:var(--font-mono); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Discard ✕</button>
      </div>
      <div style="display:flex; gap:0; flex-wrap:wrap;">
        <div style="flex:1; min-width:320px; padding:24px 28px; border-right:1px solid var(--border-line-soft);">
          <p style="font-family:var(--font-mono); font-size:0.68rem; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 16px;">Current (Live)</p>
          <div>${oldPanel}</div>
        </div>
        <div style="flex:1; min-width:320px; padding:24px 28px;">
          <p style="font-family:var(--font-mono); font-size:0.68rem; color:var(--neon-cyan); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 16px;">New (Preview — not saved yet)</p>
          <div>${data.newBodyHtmlPreview}</div>
        </div>
      </div>
      <div style="padding:20px 28px; border-top:1px solid var(--border-line-soft); display:flex; gap:12px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
        <p id="regen-status" style="font-family:var(--font-mono); font-size:0.72rem; color:var(--ink-faint); margin:0; display:none;"></p>
        <button id="regen-discard" type="button" style="background:var(--bg-panel-raised); border:1px solid var(--border-line); color:var(--ink-dim); padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer;">Discard</button>
        <button id="regen-confirm" type="button" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer; font-weight:600;">Save This Version</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("regen-discard").onclick = close;
  document.getElementById("regen-discard-x").onclick = close;
  document.getElementById("regen-confirm").onclick = async () => {
    const confirmBtn = document.getElementById("regen-confirm");
    const status = document.getElementById("regen-status");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Saving…";
    status.style.display = "block";
    status.textContent = "Writing to the archive…";
    try {
      const res = await authFetch("/api/confirm-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: data.category, entry: data.entry })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Save failed");
      status.textContent = "Saved — reloading…";
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Save This Version";
      status.textContent = "Error: " + err.message;
    }
  };
}


// Called from an already-filled card's "Edit" button. Fetches the
// entry's current full content (same GET routes/entries.js uses for the
// dossier page) and hands it to the category's bespoke form builder.
// Unlike regenerateEntry(), there's no AI call here at all -- this just
// loads what's already saved so it can be edited in place.
async function editEntry(categoryPath, id, btnEl) {
  const builder = EDIT_FORM_BUILDERS[categoryPath];
  if (!builder) return;
  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Loading…";
  try {
    const res = await authFetch(`/api/entries/${categoryPath}/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load entry.");
    builder(data.entry);
  } catch (err) {
    alert("Couldn't open editor: " + err.message);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
  }
}

// Bespoke Factions edit form. Full-screen overlay, same visual language
// as showRegeneratePreview()'s panel, but real inputs instead of a
// read-only diff, and no preview step -- Save writes straight through
// POST /api/confirm-entry, the exact same endpoint Regenerate's "Save
// This Version" button already uses. confirmEntry.js's factions branch
// doesn't care whether the `entry` it receives came from a fresh AI
// generation or a hand-edited form -- it just needs the same shape
// lib/factionDeepLore.js produces (id, factionKey, name, + the Deep Lore
// fields), which is exactly what entry.raw already contains. Computed/
// derived data (the Roundup, reciprocal relationship sync) is recomputed
// server-side on every confirm regardless of source, so it can't go
// stale here either.
//
// Deliberately excludes accentColor -- that's edited separately via the
// dossier page's own color picker (renderFactionColorPicker(), PATCH
// /api/wizard/factions/:id/accent-color) and isn't part of this raw
// Deep Lore object at all.
// ---------- Shared helpers for the bespoke Edit forms below ----------
// (showFactionEditForm above predates these and keeps its own small
// local `field()` helper rather than being refactored to use these --
// low-risk to leave working, tested code alone.)

// Fetches {id, name} pairs for a whole category, used to populate
// dependent id-picker dropdowns (e.g. an NPC relationship pointing at
// another npc/enemy/faction/class/survivor, or a Location/Log pointing
// at an npc/location) without ever letting a manual edit invent an id
// that doesn't actually exist -- same "exact list, never invent" rule
// every generator already follows server-side.
async function fetchCategoryOptions(category) {
  try {
    const res = await authFetch(`/api/entries/${category}`);
    const data = await res.json();
    return ((data && data.entries) || []).map((e) => ({ id: e.id, name: e.name }));
  } catch (err) {
    console.error(`Failed to load ${category} options:`, err);
    return [];
  }
}

// Renders <option> tags from an {id,name}[] list, marking currentId
// selected (even if it's since gone missing from the list, so an edit
// doesn't silently clobber a reference it didn't touch) and optionally
// prepending a "none" option for optional fields.
function idSelectOptionsHtml(options, currentId, noneLabel) {
  const opts = [];
  if (noneLabel !== undefined) opts.push(`<option value="" ${!currentId ? "selected" : ""}>${escapeHtmlForSearch(noneLabel)}</option>`);
  options.forEach((o) => {
    opts.push(`<option value="${escapeHtmlForSearch(o.id)}" ${o.id === currentId ? "selected" : ""}>${escapeHtmlForSearch(o.name)}</option>`);
  });
  if (currentId && !options.some((o) => o.id === currentId)) {
    opts.push(`<option value="${escapeHtmlForSearch(currentId)}" selected>${escapeHtmlForSearch(currentId)} (not found)</option>`);
  }
  return opts.join("");
}

// Same field-row markup as showFactionEditForm's local helper, shared
// across the 5 newer bespoke forms below.
function efField(label, id, value, { textarea = false, rows = 3, type = "text" } = {}) {
  const safeValue = escapeHtmlForSearch(value == null ? "" : value);
  const inputStyle = "width:100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);";
  return `
    <div style="margin-bottom: 14px;">
      <label for="${id}" style="display:block; font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">${label}</label>
      ${textarea
        ? `<textarea id="${id}" rows="${rows}" style="${inputStyle} resize: vertical;">${safeValue}</textarea>`
        : `<input id="${id}" type="${type}" value="${safeValue}" style="${inputStyle}">`}
    </div>`;
}

function efSelect(label, id, optionsHtml) {
  const style = "width:100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);";
  return `
    <div style="margin-bottom: 14px;">
      <label for="${id}" style="display:block; font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">${label}</label>
      <select id="${id}" style="${style}">${optionsHtml}</select>
    </div>`;
}

// Generic overlay shell (header/body/footer, Cancel/Save wiring, status
// line) shared by the 5 newer bespoke forms. `bodyHtml` is the form's
// field markup; `onSave(overlay)` builds and POSTs the updated entry to
// /api/confirm-entry and should throw on failure (caught here to show
// the error inline rather than losing the user's edits).
function openEditOverlay(titleText, bodyHtml, onSave) {
  const existingOverlay = document.getElementById("edit-form-overlay");
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "edit-form-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; overflow:auto; padding:40px 20px;";
  overlay.innerHTML = `
    <div style="max-width:900px; margin:0 auto; background:var(--bg-panel); border:1px solid var(--border-line);">
      <div style="padding:20px 28px; border-bottom:1px solid var(--border-line-soft); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <h2 style="font-family:var(--font-display); text-transform:uppercase; margin:0; font-size:1.1rem;">Edit — ${escapeHtmlForSearch(titleText)}</h2>
        <button id="edit-discard-x" type="button" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:6px 12px; cursor:pointer; font-family:var(--font-mono); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Cancel ✕</button>
      </div>
      <div id="edit-body" style="padding:24px 28px;">${bodyHtml}</div>
      <div style="padding:20px 28px; border-top:1px solid var(--border-line-soft); display:flex; gap:12px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
        <p id="edit-status" style="font-family: var(--font-mono); font-size:0.72rem; color: var(--ink-faint); margin:0; display:none;"></p>
        <button id="edit-discard" type="button" style="background:var(--bg-panel-raised); border:1px solid var(--border-line); color:var(--ink-dim); padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer;">Cancel</button>
        <button id="edit-save" type="button" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer; font-weight:600;">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("edit-discard").onclick = close;
  document.getElementById("edit-discard-x").onclick = close;
  document.getElementById("edit-save").onclick = async () => {
    const saveBtn = document.getElementById("edit-save");
    const status = document.getElementById("edit-status");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    status.style.display = "block";
    status.textContent = "Writing to the archive…";
    try {
      await onSave(overlay);
      status.textContent = "Saved — reloading…";
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
      status.textContent = "Error: " + err.message;
    }
  };
  return overlay;
}

// Shared "row list" editor (relationships, abilities, notable NPCs,
// etc.) -- renders `state` (an array of plain objects) into `hostId`
// using `rowHtml(item, i)` for each row's inner markup, wires every
// [data-idx][data-field] input inside a row to write straight back into
// `state`, and wires any [data-idx].ef-row-remove button to splice it
// out and re-render. Returns a render() function to call after mutating
// `state` externally (e.g. an "Add" button pushing a new blank row).
function wireRowEditor(hostId, state, rowHtml, emptyMessage) {
  function render() {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = state.length
      ? state.map((item, i) => rowHtml(item, i)).join("")
      : `<p style="color:var(--ink-faint); font-size:0.85rem; margin:0 0 8px;">${emptyMessage}</p>`;
    host.querySelectorAll("[data-idx][data-field]").forEach((el) => {
      const sync = (e) => { state[Number(e.target.dataset.idx)][e.target.dataset.field] = e.target.value; };
      el.addEventListener("input", sync);
      el.addEventListener("change", sync);
    });
    host.querySelectorAll(".ef-row-remove").forEach((el) => {
      el.addEventListener("click", (e) => {
        state.splice(Number(e.currentTarget.dataset.idx), 1);
        render();
      });
    });
  }
  render();
  return render;
}

function showFactionEditForm(entry) {
  const existingOverlay = document.getElementById("edit-form-overlay");
  if (existingOverlay) existingOverlay.remove();

  const raw = entry.raw || {};
  const ownName = raw.name || entry.name || "";

  function field(label, id, value, { textarea = false, rows = 3 } = {}) {
    const safeValue = escapeHtmlForSearch(value || "");
    const inputStyle = "width:100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);";
    return `
      <div style="margin-bottom: 14px;">
        <label for="${id}" style="display:block; font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">${label}</label>
        ${textarea
          ? `<textarea id="${id}" rows="${rows}" style="${inputStyle} resize: vertical;">${safeValue}</textarea>`
          : `<input id="${id}" type="text" value="${safeValue}" style="${inputStyle}">`}
      </div>`;
  }

  const overlay = document.createElement("div");
  overlay.id = "edit-form-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; overflow:auto; padding:40px 20px;";
  overlay.innerHTML = `
    <div style="max-width:820px; margin:0 auto; background:var(--bg-panel); border:1px solid var(--border-line);">
      <div style="padding:20px 28px; border-bottom:1px solid var(--border-line-soft); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <h2 style="font-family:var(--font-display); text-transform:uppercase; margin:0; font-size:1.1rem;">Edit — ${escapeHtmlForSearch(ownName)}</h2>
        <button id="edit-discard-x" type="button" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:6px 12px; cursor:pointer; font-family:var(--font-mono); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Cancel ✕</button>
      </div>
      <div style="padding:24px 28px;">
        ${field("Name", "ef-name", raw.name)}
        ${field("Nickname / Epithet", "ef-nickname", raw.nickname)}
        ${field("Overview Quote", "ef-overviewQuote", raw.overviewQuote, { textarea: true, rows: 2 })}
        ${field("Core Philosophy", "ef-corePhilosophy", raw.corePhilosophy, { textarea: true, rows: 2 })}
        ${field("Origin", "ef-origin", raw.origin, { textarea: true })}
        ${field("Structure &amp; Hierarchy", "ef-structureHierarchy", raw.structureHierarchy, { textarea: true })}
        ${field("Territory", "ef-territory", raw.territory, { textarea: true })}
        ${field("Goals — Near-term", "ef-goalsNearTerm", raw.goalsNearTerm, { textarea: true, rows: 2 })}
        ${field("Goals — Long-term", "ef-goalsLongTerm", raw.goalsLongTerm, { textarea: true, rows: 2 })}
        ${field("Internal Tensions", "ef-internalTensions", raw.internalTensions, { textarea: true })}
        ${field("Iconography", "ef-iconography", raw.iconography, { textarea: true })}
        <div style="margin-bottom: 14px;">
          <label style="display:block; font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Relationships</label>
          <div id="ef-relationships-rows"></div>
          <button id="ef-add-relationship" type="button" style="margin-top:6px; background: var(--bg-panel-raised); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">+ Add Relationship</button>
        </div>
        ${field("Economy &amp; Resources", "ef-economyResources", raw.economyResources, { textarea: true })}
        ${field("Joining / Absorption", "ef-joining", raw.joining, { textarea: true })}
      </div>
      <div style="padding:20px 28px; border-top:1px solid var(--border-line-soft); display:flex; gap:12px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
        <p id="edit-status" style="font-family: var(--font-mono); font-size:0.72rem; color: var(--ink-faint); margin:0; display:none;"></p>
        <button id="edit-discard" type="button" style="background:var(--bg-panel-raised); border:1px solid var(--border-line); color:var(--ink-dim); padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer;">Cancel</button>
        <button id="edit-save" type="button" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer; font-weight:600;">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ---- Relationships: dynamic add/remove rows, faction dropdown
  // populated from this world's real live faction list (never a free
  // text field for the faction name -- matches the "exact list, never
  // invent" rule applied everywhere else relationships are generated).
  let relState = (Array.isArray(raw.relationships) ? raw.relationships : [])
    .map((r) => ({ faction: r.faction || "", stance: r.stance || "", why: r.why || "" }));
  let otherFactionNames = [];

  function renderRelationshipRows() {
    const host = document.getElementById("ef-relationships-rows");
    if (!host) return;
    const rowStyle = "flex:1; min-width:100px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);";
    host.innerHTML = relState.length ? relState.map((r, i) => `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
        <select data-idx="${i}" data-field="faction" class="ef-rel-input" style="${rowStyle} min-width:140px;">
          ${otherFactionNames.map((n) => `<option value="${escapeHtmlForSearch(n)}" ${n === r.faction ? "selected" : ""}>${escapeHtmlForSearch(n)}</option>`).join("")}
          ${r.faction && !otherFactionNames.includes(r.faction) ? `<option value="${escapeHtmlForSearch(r.faction)}" selected>${escapeHtmlForSearch(r.faction)}</option>` : ""}
        </select>
        <input data-idx="${i}" data-field="stance" class="ef-rel-input" type="text" value="${escapeHtmlForSearch(r.stance)}" placeholder="stance" style="${rowStyle}">
        <input data-idx="${i}" data-field="why" class="ef-rel-input" type="text" value="${escapeHtmlForSearch(r.why)}" placeholder="why" style="${rowStyle} flex:2;">
        <button type="button" data-idx="${i}" class="ef-rel-remove" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:8px 10px; cursor:pointer; font-family:var(--font-mono); font-size:0.68rem;">✕</button>
      </div>`).join("") : `<p style="color:var(--ink-faint); font-size:0.85rem; margin:0 0 8px;">No relationships yet.</p>`;

    host.querySelectorAll(".ef-rel-input").forEach((el) => {
      const sync = (e) => { relState[Number(e.target.dataset.idx)][e.target.dataset.field] = e.target.value; };
      el.addEventListener("input", sync);
      el.addEventListener("change", sync);
    });
    host.querySelectorAll(".ef-rel-remove").forEach((el) => {
      el.addEventListener("click", (e) => {
        relState.splice(Number(e.currentTarget.dataset.idx), 1);
        renderRelationshipRows();
      });
    });
  }

  getFactionLookup().then((lookup) => {
    otherFactionNames = Object.values(lookup).map((f) => f.name).filter((n) => n && n !== ownName);
    renderRelationshipRows();
  });

  document.getElementById("ef-add-relationship").addEventListener("click", () => {
    relState.push({ faction: otherFactionNames[0] || "", stance: "", why: "" });
    renderRelationshipRows();
  });

  // ---- Cancel ----
  const close = () => overlay.remove();
  document.getElementById("edit-discard").onclick = close;
  document.getElementById("edit-discard-x").onclick = close;

  // ---- Save (immediate, no preview step -- see this session's addendum
  // for why Edit skips the diff/confirm modal Regenerate uses) ----
  document.getElementById("edit-save").onclick = async () => {
    const saveBtn = document.getElementById("edit-save");
    const status = document.getElementById("edit-status");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    status.style.display = "block";
    status.textContent = "Writing to the archive…";

    const val = (id) => document.getElementById(id).value;
    const updatedFaction = {
      ...raw,
      id: raw.id,
      factionKey: raw.factionKey,
      name: val("ef-name"),
      nickname: val("ef-nickname"),
      overviewQuote: val("ef-overviewQuote"),
      corePhilosophy: val("ef-corePhilosophy"),
      origin: val("ef-origin"),
      structureHierarchy: val("ef-structureHierarchy"),
      territory: val("ef-territory"),
      goalsNearTerm: val("ef-goalsNearTerm"),
      goalsLongTerm: val("ef-goalsLongTerm"),
      internalTensions: val("ef-internalTensions"),
      iconography: val("ef-iconography"),
      relationships: relState.filter((r) => r.faction),
      economyResources: val("ef-economyResources"),
      joining: val("ef-joining")
    };

    try {
      const res = await authFetch("/api/confirm-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "factions", entry: updatedFaction })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Save failed");
      status.textContent = "Saved — reloading…";
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
      status.textContent = "Error: " + err.message;
    }
  };
}

// Bespoke NPCs edit form. Relationships can point at any of 5 categories
// (factions/npcs/enemies/classes/survivors), so each relationship row's
// "target" dropdown is populated dynamically based on that row's own
// category picker -- never a free-text id field, matching the "exact
// list, never invent" rule prompts/npcContentPrompt.js already enforces
// server-side. Dialogue branches are a simpler tone/reply row pair.
const NPC_ROLE_ARCHETYPES = ["Faction Leader", "Quest-Giver", "Community VIP", "Rival", "Informant/Fixer", "Merchant"];
const RELATIONSHIP_CATEGORIES = ["factions", "npcs", "enemies", "classes", "survivors"];

function showNpcEditForm(entry) {
  const raw = entry.raw || {};
  const speech = raw.speech || {};
  const dialogue = raw.dialogue || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    ${efField("Callsign (optional)", "ef-callsign", raw.callsign)}
    ${efSelect("Role Archetype", "ef-roleArchetype", NPC_ROLE_ARCHETYPES.map((r) => `<option value="${r}" ${r === raw.roleArchetype ? "selected" : ""}>${r}</option>`).join(""))}
    <div id="ef-faction-wrap"></div>
    ${efField("Age", "ef-age", raw.age, { type: "number" })}
    ${efField("Signature Quote", "ef-signatureQuote", raw.signatureQuote, { textarea: true, rows: 2 })}
    ${efField("Physical Description", "ef-physicalDescription", raw.physicalDescription, { textarea: true })}
    ${efField("Traits (comma-separated)", "ef-traits", (raw.traits || []).join(", "))}
    ${efField("The Contradiction", "ef-contradiction", raw.contradiction, { textarea: true, rows: 2 })}
    ${efField("Wants", "ef-wants", raw.wants)}
    ${efField("Actually Needs", "ef-actuallyNeeds", raw.actuallyNeeds)}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Speech Pattern</h3>
    ${efField("Register", "ef-speech-register", speech.register)}
    ${efField("Rhythm", "ef-speech-rhythm", speech.rhythm)}
    ${efField("Tic", "ef-speech-tic", speech.tic)}
    ${efField("Would Never Say", "ef-speech-neverSay", speech.neverSay)}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Relationships</h3>
    <div id="ef-rel-rows"></div>
    <button id="ef-add-rel" type="button" style="margin-top:6px; background: var(--bg-panel-raised); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">+ Add Relationship</button>
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Sample Dialogue</h3>
    ${efField("Opening Line", "ef-dialogue-opening", dialogue.openingLine, { textarea: true, rows: 2 })}
    <p style="font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.05em; margin: 12px 0 8px;">Branches</p>
    <div id="ef-branch-rows"></div>
    <button id="ef-add-branch" type="button" style="margin-top:6px; background: var(--bg-panel-raised); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">+ Add Branch</button>
    ${efField("Quest Hook (optional)", "ef-questHook", raw.questHook, { textarea: true, rows: 2 })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "NPC", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const resolvedRelationships = await Promise.all(
      relState.filter((r) => r.toId).map(async (r) => {
        const options = await getCachedOptions(r.toCategory);
        const match = options.find((o) => o.id === r.toId);
        return { type: r.type, toId: r.toId, toCategory: r.toCategory, toLabel: (match && match.name) || r.toLabel, why: r.why };
      })
    );

    const updatedNpc = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      callsign: val("ef-callsign") || null,
      roleArchetype: val("ef-roleArchetype"),
      faction: val("ef-faction"),
      age: val("ef-age") ? Number(val("ef-age")) : raw.age,
      signatureQuote: val("ef-signatureQuote"),
      physicalDescription: val("ef-physicalDescription"),
      traits: val("ef-traits").split(",").map((t) => t.trim()).filter(Boolean),
      contradiction: val("ef-contradiction"),
      wants: val("ef-wants"),
      actuallyNeeds: val("ef-actuallyNeeds"),
      speech: {
        register: val("ef-speech-register"),
        rhythm: val("ef-speech-rhythm"),
        tic: val("ef-speech-tic"),
        neverSay: val("ef-speech-neverSay")
      },
      relationships: resolvedRelationships,
      dialogue: {
        openingLine: val("ef-dialogue-opening"),
        branches: branchState.filter((b) => b.reply)
      },
      questHook: val("ef-questHook") || null,
      designNotes: val("ef-designNotes")
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "npcs", entry: updatedNpc })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Save failed");
  });

  // ---- Faction select (populated live, since faction ids/keys aren't fixed) ----
  getFactionLookup().then((lookup) => {
    const options = Object.keys(lookup).map((key) => ({ id: key, name: lookup[key].name }));
    document.getElementById("ef-faction-wrap").innerHTML = efSelect(
      "Faction",
      "ef-faction",
      `<option value="unaligned" ${raw.faction === "unaligned" ? "selected" : ""}>Unaligned</option>` + idSelectOptionsHtml(options, raw.faction)
    );
  });

  // ---- Relationships: category-dependent target dropdown per row ----
  const relState = (Array.isArray(raw.relationships) ? raw.relationships : [])
    .map((r) => ({ type: r.type || "", toId: r.toId || "", toCategory: r.toCategory || "npcs", toLabel: r.toLabel || "", why: r.why || "" }));
  const categoryOptionsCache = {};

  async function getCachedOptions(category) {
    if (!categoryOptionsCache[category]) categoryOptionsCache[category] = await fetchCategoryOptions(category);
    return categoryOptionsCache[category];
  }

  async function relRowHtml(r, i) {
    const options = await getCachedOptions(r.toCategory);
    return `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
        <input data-idx="${i}" data-field="type" class="ef-rel-input" type="text" value="${escapeHtmlForSearch(r.type)}" placeholder="relationship type" style="flex:1; min-width:120px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
        <select data-idx="${i}" data-field="toCategory" class="ef-rel-category" style="min-width:110px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
          ${RELATIONSHIP_CATEGORIES.map((c) => `<option value="${c}" ${c === r.toCategory ? "selected" : ""}>${CATEGORY_LABELS[c] || c}</option>`).join("")}
        </select>
        <select data-idx="${i}" data-field="toId" class="ef-rel-toid" style="flex:1; min-width:140px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
          ${idSelectOptionsHtml(options, r.toId)}
        </select>
        <input data-idx="${i}" data-field="why" class="ef-rel-input" type="text" value="${escapeHtmlForSearch(r.why)}" placeholder="why" style="flex:2; min-width:160px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
        <button type="button" data-idx="${i}" class="ef-row-remove" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:8px 10px; cursor:pointer; font-family:var(--font-mono); font-size:0.68rem;">✕</button>
      </div>`;
  }

  async function renderRelRows() {
    const host = document.getElementById("ef-rel-rows");
    if (!host) return;
    host.innerHTML = relState.length
      ? (await Promise.all(relState.map((r, i) => relRowHtml(r, i)))).join("")
      : `<p style="color:var(--ink-faint); font-size:0.85rem; margin:0 0 8px;">No relationships yet.</p>`;

    host.querySelectorAll(".ef-rel-input, .ef-rel-toid").forEach((el) => {
      const sync = (e) => { relState[Number(e.target.dataset.idx)][e.target.dataset.field] = e.target.value; };
      el.addEventListener("input", sync);
      el.addEventListener("change", sync);
    });
    host.querySelectorAll(".ef-rel-category").forEach((el) => {
      el.addEventListener("change", async (e) => {
        const idx = Number(e.target.dataset.idx);
        relState[idx].toCategory = e.target.value;
        relState[idx].toId = "";
        await renderRelRows();
      });
    });
    host.querySelectorAll(".ef-row-remove").forEach((el) => {
      el.addEventListener("click", async (e) => {
        relState.splice(Number(e.currentTarget.dataset.idx), 1);
        await renderRelRows();
      });
    });
  }

  renderRelRows();
  document.getElementById("ef-add-rel").addEventListener("click", () => {
    relState.push({ type: "", toId: "", toCategory: "npcs", toLabel: "", why: "" });
    renderRelRows();
  });

  // ---- Dialogue branches ----
  const branchState = (Array.isArray(dialogue.branches) ? dialogue.branches : [])
    .map((b) => ({ toneLabel: b.toneLabel || "", reply: b.reply || "" }));
  const renderBranchRows = wireRowEditor("ef-branch-rows", branchState, (b, i) => `
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
      <input data-idx="${i}" data-field="toneLabel" type="text" value="${escapeHtmlForSearch(b.toneLabel)}" placeholder="tone label" style="flex:1; min-width:160px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <input data-idx="${i}" data-field="reply" type="text" value="${escapeHtmlForSearch(b.reply)}" placeholder="reply" style="flex:2; min-width:200px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <button type="button" data-idx="${i}" class="ef-row-remove" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:8px 10px; cursor:pointer; font-family:var(--font-mono); font-size:0.68rem;">✕</button>
    </div>`, "No dialogue branches yet.");
  document.getElementById("ef-add-branch").addEventListener("click", () => {
    branchState.push({ toneLabel: "", reply: "" });
    renderBranchRows();
  });

  return overlay;
}

// Bespoke Bestiary (enemies) edit form. Attributes are the only editable
// numbers -- Max Health/Energy/Dodge/Crit/Accuracy/Move Speed are never
// stored at all (lib/enemyTemplate.js's buildEnemyBodyHtml() computes
// them fresh from attributes+tier on every render via statFormulas.js),
// so there's nothing to "lock": editing an attribute here automatically
// keeps every derived stat correct the next time the dossier renders.
const ENEMY_TIERS = ["Trash", "Elite", "Boss"];
const ABILITY_KINDS = ["Active", "Passive"];

function showEnemyEditForm(entry) {
  const raw = entry.raw || {};
  const attrs = raw.attributes || {};
  const combat = raw.combatNotes || {};
  const phase = raw.phaseChange || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    <div id="ef-faction-wrap"></div>
    ${efSelect("Tier", "ef-tier", ENEMY_TIERS.map((t) => `<option value="${t}" ${t === raw.tier ? "selected" : ""}>${t}</option>`).join(""))}
    ${efField("Role", "ef-role", raw.role)}
    ${efField("Signature Quote (leave blank for Trash tier)", "ef-signatureQuote", raw.signatureQuote, { textarea: true, rows: 2 })}
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true })}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Attributes</h3>
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 0 16px;">
      ${efField("Body", "ef-attr-body", attrs.body, { type: "number" })}
      ${efField("Reflex", "ef-attr-reflex", attrs.reflex, { type: "number" })}
      ${efField("Knowledge", "ef-attr-knowledge", attrs.knowledge, { type: "number" })}
      ${efField("Presence", "ef-attr-presence", attrs.presence, { type: "number" })}
      ${efField("Sanity", "ef-attr-sanity", attrs.sanity, { type: "number" })}
      ${efField("Fate", "ef-attr-fate", attrs.fate, { type: "number" })}
    </div>
    <p style="color:var(--ink-faint); font-size:0.78rem; margin:-6px 0 14px;">Derived stats (Max Health, Dodge, Crit, etc.) recompute automatically from these on save -- not editable directly.</p>
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Abilities</h3>
    <div id="ef-ability-rows"></div>
    <button id="ef-add-ability" type="button" style="margin-top:6px; background: var(--bg-panel-raised); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">+ Add Ability</button>
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Phase Change (Boss tier only)</h3>
    ${efField("HP Threshold (%)", "ef-phase-threshold", phase.hpThreshold, { type: "number" })}
    ${efField("Description", "ef-phase-description", phase.description, { textarea: true, rows: 2 })}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Combat Notes</h3>
    ${efField("Positioning", "ef-combat-positioning", combat.positioning)}
    ${efField("Applies", "ef-combat-applies", combat.applies)}
    ${efField("Vulnerable To", "ef-combat-vulnerableTo", combat.vulnerableTo)}
    ${efField("Drops", "ef-combat-drops", combat.drops)}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Enemy", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const updatedEnemy = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      faction: val("ef-faction") || null,
      tier: val("ef-tier"),
      role: val("ef-role"),
      signatureQuote: val("ef-signatureQuote") || null,
      flavor: val("ef-flavor"),
      attributes: {
        body: Number(val("ef-attr-body")) || 0,
        reflex: Number(val("ef-attr-reflex")) || 0,
        knowledge: Number(val("ef-attr-knowledge")) || 0,
        presence: Number(val("ef-attr-presence")) || 0,
        sanity: Number(val("ef-attr-sanity")) || 0,
        fate: Number(val("ef-attr-fate")) || 0
      },
      abilities: abilityState.filter((a) => a.name),
      phaseChange: val("ef-phase-description") ? { hpThreshold: Number(val("ef-phase-threshold")) || 50, description: val("ef-phase-description") } : null,
      combatNotes: {
        positioning: val("ef-combat-positioning"),
        applies: val("ef-combat-applies"),
        vulnerableTo: val("ef-combat-vulnerableTo"),
        drops: val("ef-combat-drops")
      },
      designNotes: val("ef-designNotes")
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "enemies", entry: updatedEnemy })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Save failed");
  });

  getFactionLookup().then((lookup) => {
    const options = Object.keys(lookup).map((key) => ({ id: key, name: lookup[key].name }));
    document.getElementById("ef-faction-wrap").innerHTML = efSelect("Faction", "ef-faction", idSelectOptionsHtml(options, raw.faction, "— faction-agnostic / wild —"));
  });

  const abilityState = (Array.isArray(raw.abilities) ? raw.abilities : [])
    .map((a) => ({ name: a.name || "", kind: a.kind || "Active", flavor: a.flavor || "", effect: a.effect || "", scaling: a.scaling || "" }));
  const renderAbilityRows = wireRowEditor("ef-ability-rows", abilityState, (a, i) => `
    <div style="display:grid; grid-template-columns: 1fr 100px; gap:8px; margin-bottom:6px;">
      <input data-idx="${i}" data-field="name" type="text" value="${escapeHtmlForSearch(a.name)}" placeholder="ability name" style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <select data-idx="${i}" data-field="kind" style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
        ${ABILITY_KINDS.map((k) => `<option value="${k}" ${k === a.kind ? "selected" : ""}>${k}</option>`).join("")}
      </select>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
      <input data-idx="${i}" data-field="flavor" type="text" value="${escapeHtmlForSearch(a.flavor)}" placeholder="flavor" style="flex:1; min-width:140px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <input data-idx="${i}" data-field="effect" type="text" value="${escapeHtmlForSearch(a.effect)}" placeholder="effect" style="flex:1; min-width:140px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <input data-idx="${i}" data-field="scaling" type="text" value="${escapeHtmlForSearch(a.scaling)}" placeholder="scaling formula" style="flex:1; min-width:160px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <button type="button" data-idx="${i}" class="ef-row-remove" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:8px 10px; cursor:pointer; font-family:var(--font-mono); font-size:0.68rem;">✕</button>
    </div>`, "No abilities yet.");
  document.getElementById("ef-add-ability").addEventListener("click", () => {
    abilityState.push({ name: "", kind: "Active", flavor: "", effect: "", scaling: "" });
    renderAbilityRows();
  });

  return overlay;
}

// Bespoke Logs edit form -- the flattest schema of the 5, no nested
// arrays. locationId is a live dropdown (never a free-typed id) same as
// every other cross-reference in this batch.
const LOG_TYPES = ["Audio", "Journal", "Terminal"];

function showLogEditForm(entry) {
  const raw = entry.raw || {};

  const bodyHtml = `
    ${efField("Name / Title", "ef-name", raw.name)}
    ${efSelect("Log Type", "ef-logType", LOG_TYPES.map((t) => `<option value="${t}" ${t === raw.logType ? "selected" : ""}>${t}</option>`).join(""))}
    ${efField("Location Context (free text)", "ef-locationContext", raw.locationContext)}
    <div id="ef-locationId-wrap"></div>
    ${efField("Characters", "ef-characters", raw.characters)}
    ${efField("Context", "ef-context", raw.context, { textarea: true, rows: 2 })}
    ${efField("Body Text", "ef-bodyText", raw.bodyText, { textarea: true, rows: 10 })}
    <div id="ef-faction-wrap"></div>
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Log", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const updatedLog = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      logType: val("ef-logType"),
      locationContext: val("ef-locationContext"),
      locationId: val("ef-locationId") || null,
      characters: val("ef-characters"),
      context: val("ef-context"),
      bodyText: val("ef-bodyText"),
      faction: val("ef-faction") || null,
      designNotes: val("ef-designNotes")
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "logs", entry: updatedLog })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Save failed");
  });

  fetchCategoryOptions("locations").then((options) => {
    document.getElementById("ef-locationId-wrap").innerHTML = efSelect("Location (archived)", "ef-locationId", idSelectOptionsHtml(options, raw.locationId, "— none / not archived —"));
  });
  getFactionLookup().then((lookup) => {
    const options = Object.keys(lookup).map((key) => ({ id: key, name: lookup[key].name }));
    document.getElementById("ef-faction-wrap").innerHTML = efSelect("Faction", "ef-faction", idSelectOptionsHtml(options, raw.faction, "— personal / unaffiliated —"));
  });

  return overlay;
}

// Bespoke Locations edit form. notableNpcs.toId is a live npcs dropdown
// (never free-typed), same pattern as everywhere else in this batch.
function showLocationEditForm(entry) {
  const raw = entry.raw || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    ${efField("Descriptor Line", "ef-descriptorLine", raw.descriptorLine, { textarea: true, rows: 2 })}
    ${efField("Region / Biome", "ef-regionBiome", raw.regionBiome)}
    <div id="ef-faction-wrap"></div>
    ${efField("Notable Features", "ef-notableFeatures", raw.notableFeatures, { textarea: true })}
    ${efField("Danger Tags (comma-separated)", "ef-dangerTags", (raw.dangerTags || []).join(", "))}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Notable NPCs</h3>
    <div id="ef-npc-rows"></div>
    <button id="ef-add-npc" type="button" style="margin-top:6px; background: var(--bg-panel-raised); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">+ Add Notable NPC</button>
    ${efField("Hooks & Secrets (optional)", "ef-hooksSecrets", raw.hooksSecrets, { textarea: true, rows: 2 })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Location", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const npcOptions = await fetchCategoryOptions("npcs");
    const npcLookup = {};
    npcOptions.forEach((o) => { npcLookup[o.id] = o.name; });

    const updatedLocation = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      descriptorLine: val("ef-descriptorLine"),
      regionBiome: val("ef-regionBiome"),
      faction: val("ef-faction"),
      notableFeatures: val("ef-notableFeatures"),
      dangerTags: val("ef-dangerTags").split(",").map((t) => t.trim()).filter(Boolean),
      notableNpcs: npcState
        .filter((n) => n.toId)
        .map((n) => ({ toId: n.toId, toLabel: npcLookup[n.toId] || n.toLabel, why: n.why })),
      hooksSecrets: val("ef-hooksSecrets") || null,
      designNotes: val("ef-designNotes")
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "locations", entry: updatedLocation })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Save failed");
  });

  getFactionLookup().then((lookup) => {
    const options = Object.keys(lookup).map((key) => ({ id: key, name: lookup[key].name }));
    document.getElementById("ef-faction-wrap").innerHTML = efSelect(
      "Controlling Faction",
      "ef-faction",
      `<option value="unaligned" ${raw.faction === "unaligned" ? "selected" : ""}>Unaligned</option>` + idSelectOptionsHtml(options, raw.faction)
    );
  });

  const npcState = (Array.isArray(raw.notableNpcs) ? raw.notableNpcs : [])
    .map((n) => ({ toId: n.toId || "", toLabel: n.toLabel || "", why: n.why || "" }));

  fetchCategoryOptions("npcs").then((npcOptions) => {
    const renderNpcRows = wireRowEditor("ef-npc-rows", npcState, (n, i) => `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
        <select data-idx="${i}" data-field="toId" style="flex:1; min-width:160px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
          ${idSelectOptionsHtml(npcOptions, n.toId)}
        </select>
        <input data-idx="${i}" data-field="why" type="text" value="${escapeHtmlForSearch(n.why)}" placeholder="why" style="flex:2; min-width:180px; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
        <button type="button" data-idx="${i}" class="ef-row-remove" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:8px 10px; cursor:pointer; font-family:var(--font-mono); font-size:0.68rem;">✕</button>
      </div>`, "No notable NPCs yet.");
    document.getElementById("ef-add-npc").addEventListener("click", () => {
      npcState.push({ toId: "", toLabel: "", why: "" });
      renderNpcRows();
    });
  });

  return overlay;
}

// Bespoke Classes edit form -- the largest schema of the 5 (a full
// Level 1-99 tree). Each of the 4 tiers gets its own ability row editor
// (level/name/kind/effectText), reusing wireRowEditor() 4 times rather
// than writing 4 near-identical editors by hand. "Why This Progression
// Works" is deliberately NOT a dynamic add/remove list -- the schema
// requires exactly 3 named callouts, so this renders exactly 3 fixed
// label+text rows.
const CLASS_ABILITY_KINDS = ["Active", "Passive", "Ultimate Unlock", "Final Unlock"];

function abilityRowHtml(a, i) {
  return `
    <div style="display:grid; grid-template-columns: 70px 1fr 150px; gap:8px; margin-bottom:6px;">
      <input data-idx="${i}" data-field="level" type="number" value="${escapeHtmlForSearch(a.level)}" placeholder="lvl" style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <input data-idx="${i}" data-field="name" type="text" value="${escapeHtmlForSearch(a.name)}" placeholder="ability name" style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <select data-idx="${i}" data-field="kind" style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
        ${CLASS_ABILITY_KINDS.map((k) => `<option value="${k}" ${k === a.kind ? "selected" : ""}>${k}</option>`).join("")}
      </select>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <input data-idx="${i}" data-field="effectText" type="text" value="${escapeHtmlForSearch(a.effectText)}" placeholder="effect text (incl. scaling formula)" style="flex:1; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
      <button type="button" data-idx="${i}" class="ef-row-remove" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:8px 10px; cursor:pointer; font-family:var(--font-mono); font-size:0.68rem;">✕</button>
    </div>`;
}

function tierSectionHtml(tierKey, tierLabel, tier) {
  return `
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">${tierLabel}</h3>
    ${efField(`${tierLabel} — Title`, `ef-${tierKey}-title`, tier.title)}
    ${efField(`${tierLabel} — Theme`, `ef-${tierKey}-theme`, tier.theme, { textarea: true, rows: 2 })}
    <p style="font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.05em; margin: 8px 0;">Abilities</p>
    <div id="ef-${tierKey}-rows"></div>
    <button id="ef-add-${tierKey}" type="button" style="margin-top:6px; background: var(--bg-panel-raised); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">+ Add Ability</button>
  `;
}

function showClassEditForm(entry) {
  const raw = entry.raw || {};
  const skillEff = raw.skillEfficiency || {};
  const evo = raw.evolutionEvent || {};
  const whyItWorks = Array.isArray(raw.whyItWorks) ? raw.whyItWorks : [];
  const tier1 = raw.tier1 || { abilities: [] };
  const tier2 = raw.tier2 || { abilities: [] };
  const tier3 = raw.tier3 || { abilities: [] };
  const tier4 = raw.tier4 || { abilities: [] };

  const why = (i) => whyItWorks[i] || { label: "", text: "" };

  const bodyHtml = `
    ${efField("Base Name", "ef-baseName", raw.baseName)}
    ${efField("Evolved Name", "ef-evolvedName", raw.evolvedName)}
    ${efField("Tagline", "ef-tagline", raw.tagline, { textarea: true, rows: 2 })}
    ${efField("Archetype", "ef-archetype", raw.archetype)}
    ${efField("Core Resource Name", "ef-coreResourceName", raw.coreResourceName)}
    ${efField("Core Resource Description", "ef-coreResourceDescription", raw.coreResourceDescription, { textarea: true, rows: 2 })}
    ${efField("Primary Attribute", "ef-primaryAttribute", raw.primaryAttribute)}
    ${efField("Secondary Attribute", "ef-secondaryAttribute", raw.secondaryAttribute)}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Skill Efficiency</h3>
    ${efField("Major (1.0x)", "ef-skill-major", skillEff.major)}
    ${efField("Minor (0.5x)", "ef-skill-minor", skillEff.minor)}
    ${efField("Misc (0.2x)", "ef-skill-misc", skillEff.misc)}
    ${tierSectionHtml("tier1", "Tier 1 (Levels 1–20)", tier1)}
    ${tierSectionHtml("tier2", "Tier 2 (Levels 21–49)", tier2)}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Evolution Event (Level 50)</h3>
    ${efField("Requirement", "ef-evo-requirement", evo.requirement)}
    ${efField("Cost", "ef-evo-cost", evo.cost)}
    ${efField("Location (free text)", "ef-evo-location", evo.location)}
    <div id="ef-evo-locationId-wrap"></div>
    ${efField("Visual Shift", "ef-evo-visualShift", evo.visualShift, { textarea: true, rows: 2 })}
    ${tierSectionHtml("tier3", "Tier 3 (Levels 50–75)", tier3)}
    ${tierSectionHtml("tier4", "Tier 4 (Levels 76–99)", tier4)}
    ${efField("Capstone Quote", "ef-capstoneQuote", raw.capstoneQuote, { textarea: true, rows: 2 })}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Why This Progression Works (exactly 3)</h3>
    ${efField("Callout 1 — Label", "ef-why0-label", why(0).label)}
    ${efField("Callout 1 — Text", "ef-why0-text", why(0).text, { textarea: true, rows: 2 })}
    ${efField("Callout 2 — Label", "ef-why1-label", why(1).label)}
    ${efField("Callout 2 — Text", "ef-why1-text", why(1).text, { textarea: true, rows: 2 })}
    ${efField("Callout 3 — Label", "ef-why2-label", why(2).label)}
    ${efField("Callout 3 — Text", "ef-why2-text", why(2).text, { textarea: true, rows: 2 })}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.baseName || entry.name || "Class", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const buildTier = (key, abilityState) => ({
      title: val(`ef-${key}-title`),
      theme: val(`ef-${key}-theme`),
      abilities: abilityState
        .filter((a) => a.name)
        .map((a) => ({ level: Number(a.level) || 0, name: a.name, kind: a.kind, effectText: a.effectText }))
    });

    const updatedClass = {
      ...raw,
      id: raw.id,
      baseName: val("ef-baseName"),
      evolvedName: val("ef-evolvedName"),
      tagline: val("ef-tagline"),
      archetype: val("ef-archetype"),
      coreResourceName: val("ef-coreResourceName"),
      coreResourceDescription: val("ef-coreResourceDescription"),
      primaryAttribute: val("ef-primaryAttribute"),
      secondaryAttribute: val("ef-secondaryAttribute"),
      skillEfficiency: { major: val("ef-skill-major"), minor: val("ef-skill-minor"), misc: val("ef-skill-misc") },
      tier1: buildTier("tier1", tier1State),
      tier2: buildTier("tier2", tier2State),
      evolutionEvent: {
        requirement: val("ef-evo-requirement"),
        cost: val("ef-evo-cost"),
        location: val("ef-evo-location"),
        locationId: val("ef-evo-locationId") || null,
        visualShift: val("ef-evo-visualShift")
      },
      tier3: buildTier("tier3", tier3State),
      tier4: buildTier("tier4", tier4State),
      capstoneQuote: val("ef-capstoneQuote"),
      whyItWorks: [
        { label: val("ef-why0-label"), text: val("ef-why0-text") },
        { label: val("ef-why1-label"), text: val("ef-why1-text") },
        { label: val("ef-why2-label"), text: val("ef-why2-text") }
      ],
      designNotes: val("ef-designNotes")
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "classes", entry: updatedClass })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Save failed");
  });

  fetchCategoryOptions("locations").then((options) => {
    document.getElementById("ef-evo-locationId-wrap").innerHTML = efSelect("Location (archived, optional)", "ef-evo-locationId", idSelectOptionsHtml(options, evo.locationId, "— none / not archived —"));
  });

  function setupTierRows(key, tier) {
    const state = (Array.isArray(tier.abilities) ? tier.abilities : []).map((a) => ({ level: a.level || 1, name: a.name || "", kind: a.kind || "Active", effectText: a.effectText || "" }));
    const render = wireRowEditor(`ef-${key}-rows`, state, abilityRowHtml, "No abilities yet.");
    document.getElementById(`ef-add-${key}`).addEventListener("click", () => {
      state.push({ level: 1, name: "", kind: "Active", effectText: "" });
      render();
    });
    return state;
  }

  const tier1State = setupTierRows("tier1", tier1);
  const tier2State = setupTierRows("tier2", tier2);
  const tier3State = setupTierRows("tier3", tier3);
  const tier4State = setupTierRows("tier4", tier4);

  return overlay;
}

// Bespoke Items edit form. Schema branches 4 ways by category (Weapon /
// Armor / Consumable / QuestItem) -- the form shows all 4 field groups
// and toggles visibility based on the Category select, rather than
// swapping the DOM out entirely, so switching category never loses data
// already typed into a group you might switch back to. Armor's Damage
// Reduction is never stored (lib/itemTemplate.js computes it fresh from
// effectorTier via computeArmorDR() on every render, same locked/
// recomputed pattern as Bestiary derived stats) -- effectorTier is the
// only editable Armor stat field.
const ITEM_CATEGORIES = ["Weapon", "Armor", "Consumable", "QuestItem"];
const ITEM_RARITIES = ["Common", "Uncommon", "Rare", "Legendary"];
const WEAPON_SKILLS = ["Heavy Weapons", "Light Weapons", "Polearm", "Unarmed", "Ballistics", "Archery", "Catalysts"];

function itemGroupDisplayStyle(category, forCategory) {
  return category === forCategory ? "" : "display:none;";
}

function showItemEditForm(entry) {
  const raw = entry.raw || {};
  const cat = raw.category || "Weapon";

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    ${efSelect("Category", "ef-category", ITEM_CATEGORIES.map((c) => `<option value="${c}" ${c === cat ? "selected" : ""}>${c}</option>`).join(""))}
    <div id="ef-group-rarity" style="${itemGroupDisplayStyle(cat, "Weapon")}${cat === "Armor" ? "" : ""}">
      ${efSelect("Rarity", "ef-rarity", `<option value="">— none —</option>` + ITEM_RARITIES.map((r) => `<option value="${r}" ${r === raw.rarity ? "selected" : ""}>${r}</option>`).join(""))}
    </div>
    ${efField("Flavor", "ef-flavor", raw.flavor, { textarea: true })}
    <div id="ef-group-weapon">
      <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Weapon Stats</h3>
      ${efSelect("Weapon Skill", "ef-weaponSkill", WEAPON_SKILLS.map((w) => `<option value="${w}" ${w === raw.weaponSkill ? "selected" : ""}>${w}</option>`).join(""))}
      ${efField("Weapon Type", "ef-weaponType", raw.weaponType)}
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0 16px;">
        ${efField("Damage Min", "ef-damageMin", raw.damageMin, { type: "number" })}
        ${efField("Damage Max", "ef-damageMax", raw.damageMax, { type: "number" })}
      </div>
      ${efField("Relevant Stat", "ef-relevantStat", raw.relevantStat)}
      ${efField("Applies Status (optional)", "ef-appliesStatus", raw.appliesStatus)}
    </div>
    <div id="ef-group-armor">
      <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Armor Stats</h3>
      ${efField("Effector Tier (1–4)", "ef-effectorTier", raw.effectorTier, { type: "number" })}
      <p style="color:var(--ink-faint); font-size:0.78rem; margin:-6px 0 14px;">Damage Reduction recomputes automatically from this on save.</p>
    </div>
    <div id="ef-group-rarityEffect">
      ${efField("Rarity Effect (Uncommon+ Weapon/Armor)", "ef-rarityEffect", raw.rarityEffect)}
    </div>
    <div id="ef-group-consumable">
      <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Consumable</h3>
      ${efField("AP Cost", "ef-apCost", raw.apCost, { type: "number" })}
      ${efField("Effect", "ef-effect", raw.effect, { textarea: true })}
    </div>
    <div id="ef-group-questitem">
      <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Quest Item</h3>
      ${efField("Where Found / Why It Matters", "ef-whereFoundWhyMatters", raw.whereFoundWhyMatters, { textarea: true })}
      <div id="ef-foundAtLocationId-wrap"></div>
    </div>
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Item", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const category = val("ef-category");
    const updatedItem = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      category,
      rarity: (category === "Weapon" || category === "Armor") ? (val("ef-rarity") || null) : null,
      flavor: val("ef-flavor"),
      weaponSkill: category === "Weapon" ? val("ef-weaponSkill") : null,
      weaponType: category === "Weapon" ? val("ef-weaponType") : null,
      damageMin: category === "Weapon" ? Number(val("ef-damageMin")) || 0 : null,
      damageMax: category === "Weapon" ? Number(val("ef-damageMax")) || 0 : null,
      relevantStat: category === "Weapon" ? val("ef-relevantStat") : null,
      appliesStatus: category === "Weapon" ? (val("ef-appliesStatus") || null) : null,
      effectorTier: category === "Armor" ? Number(val("ef-effectorTier")) || 1 : null,
      rarityEffect: (category === "Weapon" || category === "Armor") ? (val("ef-rarityEffect") || null) : null,
      apCost: category === "Consumable" ? Number(val("ef-apCost")) || 1 : null,
      effect: category === "Consumable" ? val("ef-effect") : null,
      whereFoundWhyMatters: category === "QuestItem" ? val("ef-whereFoundWhyMatters") : null,
      foundAtLocationId: category === "QuestItem" ? (val("ef-foundAtLocationId") || null) : null,
      designNotes: val("ef-designNotes")
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "items", entry: updatedItem })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Save failed");
  });

  fetchCategoryOptions("locations").then((options) => {
    document.getElementById("ef-foundAtLocationId-wrap").innerHTML = efSelect("Found At Location (optional)", "ef-foundAtLocationId", idSelectOptionsHtml(options, raw.foundAtLocationId, "— none / not archived —"));
  });

  function toggleGroups() {
    const category = document.getElementById("ef-category").value;
    document.getElementById("ef-group-rarity").style.display = (category === "Weapon" || category === "Armor") ? "" : "none";
    document.getElementById("ef-group-weapon").style.display = category === "Weapon" ? "" : "none";
    document.getElementById("ef-group-armor").style.display = category === "Armor" ? "" : "none";
    document.getElementById("ef-group-rarityEffect").style.display = (category === "Weapon" || category === "Armor") ? "" : "none";
    document.getElementById("ef-group-consumable").style.display = category === "Consumable" ? "" : "none";
    document.getElementById("ef-group-questitem").style.display = category === "QuestItem" ? "" : "none";
  }
  toggleGroups();
  document.getElementById("ef-category").addEventListener("change", toggleGroups);

  return overlay;
}

// Bespoke Survivors edit form -- the simplest schema in the whole
// rollout. className is stored as a bare base-class name (e.g.
// "Tailor", not an id and not "The Tailor") -- lib/roster.js's
// buildAvailableClassesText() derives that exact same string server-side
// by splitting a class's "BaseName → EvolvedName" manifest name on "→"
// and stripping a leading "The "; this dropdown replicates that
// transform client-side so the saved value matches what the survivor
// generator itself would have produced.
function classDisplayNameToBareName(displayName) {
  return (displayName || "").split("→")[0].replace(/^The\s+/i, "").trim();
}

function showSurvivorEditForm(entry) {
  const raw = entry.raw || {};
  const quirk = raw.quirk || {};

  const bodyHtml = `
    ${efField("Name", "ef-name", raw.name)}
    ${efField("Callsign (optional)", "ef-callsign", raw.callsign)}
    <div id="ef-className-wrap"></div>
    ${efField("Backstory", "ef-backstory", raw.backstory, { textarea: true })}
    <h3 style="font-family:var(--font-display); text-transform:uppercase; font-size:0.9rem; margin:20px 0 10px;">Quirk</h3>
    ${efField("Quirk Name", "ef-quirk-name", quirk.name)}
    ${efField("Effect", "ef-quirk-effect", quirk.effect, { textarea: true, rows: 2 })}
    ${efField("Flavor Line", "ef-quirk-flavorLine", quirk.flavorLine)}
    ${efField("Design Notes", "ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || entry.name || "Survivor", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const updatedSurvivor = {
      ...raw,
      id: raw.id,
      name: val("ef-name"),
      callsign: val("ef-callsign") || null,
      className: val("ef-className"),
      backstory: val("ef-backstory"),
      quirk: {
        name: val("ef-quirk-name"),
        effect: val("ef-quirk-effect"),
        flavorLine: val("ef-quirk-flavorLine")
      },
      designNotes: val("ef-designNotes")
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "survivors", entry: updatedSurvivor })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Save failed");
  });

  fetchCategoryOptions("classes").then((classOptions) => {
    const bareNames = [...new Set(classOptions.map((o) => classDisplayNameToBareName(o.name)).filter(Boolean))];
    const optionsHtml = bareNames.map((n) => `<option value="${escapeHtmlForSearch(n)}" ${n === raw.className ? "selected" : ""}>${escapeHtmlForSearch(n)}</option>`).join("");
    const fallback = raw.className && !bareNames.includes(raw.className)
      ? `<option value="${escapeHtmlForSearch(raw.className)}" selected>${escapeHtmlForSearch(raw.className)} (not found)</option>`
      : "";
    document.getElementById("ef-className-wrap").innerHTML = efSelect("Class", "ef-className", optionsHtml + fallback);
  });

  return overlay;
}

// Replaces the old <script src="manifest.js"> + renderCategoryIndex(window.MANIFEST_X, ...)
// pattern -- fetches this world's entries for the category from the API
// (see routes/entries.js) and renders them. Category pages now call this
// directly instead of loading a manifest.js file.
async function loadAndRenderCategoryIndex(categoryPath) {
  const grid = document.getElementById("entry-grid");
  try {
    const [entriesRes, factionLookup] = await Promise.all([
      authFetch(`/api/entries/${categoryPath}`),
      getFactionLookup()
    ]);
    const data = await entriesRes.json();
    if (!entriesRes.ok) throw new Error(data.error || "Failed to load entries.");
    renderCategoryIndex(data.entries, categoryPath, factionLookup);
  } catch (err) {
    console.error(`Failed to load ${categoryPath} entries:`, err);
    if (grid) grid.innerHTML = `<p style="color: var(--ink-faint);">Could not load entries: ${err.message}</p>`;
  }
}

function buildEntryCardHtml(entry, categoryPath, lookup) {
  const facColor = facColorVar(entry.faction, lookup);
  const tagsHtml = (entry.tags || []).join("");
  const facName = entry.faction ? ((lookup[entry.faction] && lookup[entry.faction].name) || entry.faction) : null;
  const facTag = facName ? `<span class="tag fac">${facName}</span>` : "";
  if (entry.locked && categoryPath !== "factions") {
    const canFill = !!FILL_IN_ENDPOINTS[categoryPath];
    const fillBtn = canFill
      ? `<button type="button" class="fill-in-btn" onclick="fillInEntry('${categoryPath}', '${entry.id}', this)" style="margin-top: 10px; background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Fill In</button>`
      : "";
    return `
      <div class="entry-card locked" style="--fac-color: ${facColor};">
        <h3>${entry.name}</h3>
        <p class="role">${entry.subtitle || ""}</p>
        <div class="tags">${facTag}${tagsHtml}</div>
        ${fillBtn}
      </div>`;
  }
  return `
    <div class="entry-card" style="--fac-color: ${facColor}; position: relative;">
      <h3>${entry.name}</h3>
      <p class="role">${entry.subtitle || ""}</p>
      <div class="tags">${facTag}${tagsHtml}</div>
      <a class="card-link" href="../dossier.html?category=${categoryPath}&id=${entry.id}"></a>
      <div style="position: relative; z-index: 2; display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
        ${EDIT_FORM_BUILDERS[categoryPath] ? `<button type="button" class="edit-btn" onclick="event.stopPropagation(); editEntry('${categoryPath}', '${entry.id}', this)" style="background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Edit</button>` : ""}
        ${REGENERATE_ENDPOINTS[categoryPath] ? `<button type="button" class="regen-btn" onclick="event.stopPropagation(); regenerateEntry('${categoryPath}', '${entry.id}', this)" style="background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Regenerate</button>` : ""}
      </div>
    </div>`;
}

// Renders a category's entries as grouped/ordered sections per
// CATEGORY_SORT (see session_addendum_search_and_grouping.md). Ungrouped
// categories (classes/survivors/logs/factions) render as a single
// section with no header, same visual result as the old flat list.
function renderCategoryIndex(manifest, categoryPath, factionLookup) {
  const grid = document.getElementById("entry-grid");
  if (!grid) return;
  const lookup = factionLookup || {};
  const groups = groupAndSortEntries(manifest, categoryPath, lookup);
  grid.innerHTML = groups.map(group => {
    const cardsHtml = group.entries.map(entry => buildEntryCardHtml(entry, categoryPath, lookup)).join("");
    if (!group.groupLabel) return cardsHtml;
    return `
      <div class="entry-group">
        <h2 class="entry-group-label">${group.groupLabel}</h2>
        <div class="entry-group-grid">${cardsHtml}</div>
      </div>`;
  }).join("");
}

// ---------- Dossier page: render one full entry from its data file ----------
function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return tmp.textContent || tmp.innerText || "";
}

function renderDossier(entry, factionLookup) {
  document.title = `${stripHtml(entry.name)} — The Archive`;
  const lookup = factionLookup || {};
  // A faction entry's own accent color is keyed by ITS id (this is the
  // color other entries reference via .faction), not by a `.faction`
  // field on itself -- factions don't belong to another faction.
  const colorKey = entry.category === "factions" ? entry.id : entry.faction;
  const facColor = facColorVar(colorKey, lookup);
  document.documentElement.style.setProperty("--fac-color-override", facColor);
  const styleTag = document.createElement("style");
  styleTag.textContent = `:root { --fac-color: ${facColor}; }`;
  document.head.appendChild(styleTag);

  document.getElementById("crumb-category").textContent = CATEGORY_LABELS[entry.category] || entry.category;
  document.getElementById("crumb-category").href = `${entry.category}/index.html`;
  document.getElementById("crumb-name").textContent = entry.name;

  document.getElementById("sheet-eyebrow").textContent = entry.eyebrow || "";
  document.getElementById("sheet-title").innerHTML = entry.name;
  document.getElementById("sheet-subtitle").textContent = entry.subtitle || "";

  const facName = entry.faction ? ((lookup[entry.faction] && lookup[entry.faction].name) || entry.faction) : null;
  const facTag = facName ? `<span class="tag fac">${facName}</span>` : "";
  const extraTags = (entry.tags || []).join("");
  document.getElementById("sheet-tags").innerHTML = facTag + extraTags;

  document.getElementById("sheet-body").innerHTML = entry.bodyHtml || "";

  const footerEl = document.getElementById("sheet-footer");
  footerEl.innerHTML = (entry.footer || []).map(f => `<span>${f}</span>`).join("");

  if (entry.category === "factions") {
    renderFactionColorPicker(entry, facColor);
  }

  wireDeleteEntryButton(entry);
}

// Wires the dossier page's "Delete This Entry" button to the entry
// currently being viewed. Re-wired on every renderDossier() call (rather
// than once at page load) since entry.category/entry.id aren't known
// until the fetch in loadAndRenderDossier() resolves.
function wireDeleteEntryButton(entry) {
  const btn = document.getElementById("delete-entry-btn");
  if (!btn) return;
  // Clone-and-replace clears any listener from a previous render (dossier
  // pages don't currently re-render without a full navigation, but this
  // keeps the function safe to call more than once regardless).
  const freshBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(freshBtn, btn);

  freshBtn.addEventListener("click", async () => {
    const confirmed = window.confirm(`Permanently delete "${stripHtml(entry.name)}"? This cannot be undone.`);
    if (!confirmed) return;

    const status = document.getElementById("delete-entry-status");
    freshBtn.disabled = true;
    status.textContent = "Deleting…";

    try {
      const res = await authFetch(`/api/entries/${entry.category}/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Delete failed.");
      }
      status.textContent = "Deleted. Redirecting…";
      window.location.href = `${entry.category}/index.html`;
    } catch (err) {
      console.error("Delete entry failed:", err);
      status.textContent = "Something went wrong: " + err.message;
      freshBtn.disabled = false;
    }
  });
}

// Small color-picker control injected only on a faction's own dossier
// page. Deliberately calls the dedicated PATCH endpoint rather than the
// regenerate/confirm flow -- changing the color shouldn't touch Deep
// Lore content, and shouldn't require a preview/confirm round trip.
function renderFactionColorPicker(entry, currentColorCss) {
  const host = document.getElementById("sheet-tags");
  if (!host || document.getElementById("fac-color-picker")) return;
  const currentHex = HEX_COLOR_RE.test(entry.accentColor || "") ? entry.accentColor : "#29f0d1";
  const wrap = document.createElement("span");
  wrap.id = "fac-color-picker";
  wrap.style.cssText = "display:inline-flex; align-items:center; gap:6px; margin-left:8px; font-family:var(--font-mono); font-size:0.65rem; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.05em; vertical-align:middle;";
  wrap.innerHTML = `
    Accent
    <input type="color" id="fac-color-input" value="${currentHex}" style="width:22px; height:22px; padding:0; border:1px solid var(--border-line); background:none; cursor:pointer;">
    <span id="fac-color-status"></span>
  `;
  host.appendChild(wrap);

  document.getElementById("fac-color-input").addEventListener("change", async (e) => {
    const status = document.getElementById("fac-color-status");
    status.textContent = "Saving…";
    try {
      const res = await authFetch(`/api/wizard/factions/${entry.id}/accent-color`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accentColor: e.target.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      status.textContent = "Saved — reloading…";
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      status.textContent = "Error: " + err.message;
    }
  });
}

// Resolves ?category=X&id=Y and fetches the matching entry from the API
// (see routes/entries.js), then renders it. Replaces the old
// <script src="{category}/data/{id}.js"> injection pattern.
async function loadAndRenderDossier() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const id = params.get("id");
  if (!category || !id) {
    document.getElementById("sheet-body").innerHTML = "<p>No entry specified.</p>";
    return;
  }
  try {
    const [res, factionLookup] = await Promise.all([
      authFetch(`/api/entries/${category}/${id}`),
      getFactionLookup()
    ]);
    if (res.status === 404) {
      document.getElementById("sheet-body").innerHTML = "<p>Entry not found.</p>";
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load entry.");
    renderDossier(data.entry, factionLookup);
  } catch (err) {
    console.error("Failed to load entry:", err);
    document.getElementById("sheet-body").innerHTML = "<p>Entry not found.</p>";
  }
}

// Fetches all 7 categories' entries from the API and renders homepage
// counts. Replaces the old pattern of loading 7 manifest.js files via
// <script> tags and passing window.MANIFEST_X objects directly.
async function loadAndRenderHomepageCounts() {
  const categories = Object.keys(CATEGORY_LABELS);
  try {
    const results = await Promise.all(categories.map(async (cat) => {
      const res = await authFetch(`/api/entries/${cat}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to load ${cat}`);
      return [cat, data.entries || []];
    }));
    renderHomepageCounts(Object.fromEntries(results));
  } catch (err) {
    console.error("Failed to load homepage counts:", err);
  }
}

const CATEGORY_CACHE_KEY = "worldforge_category_config_cache";

// Applies category_config_json (Wizard Step 7) to the live nav and
// homepage: relabels categories, hides disabled ones. Every archive page
// gets id="nav-{category}" on its nav link; index.html additionally gets
// id="card-{category}" on its homepage card; category index pages get
// id="page-title" and id="crumb-label" for their own heading/breadcrumb.
// Caches the result in localStorage so the next page load can apply it
// synchronously before paint (see the inline cache-apply snippet near
// the end of <body> on every page) -- otherwise every navigation flashes
// the default category name before correcting, same class of bug the
// theme flash fix already addressed.
async function applyCategoryConfig() {
  try {
    const res = await authFetch("/api/wizard/category-config");
    const { categoryConfig } = await res.json();
    if (!categoryConfig) {
      localStorage.removeItem(CATEGORY_CACHE_KEY);
      return;
    }
    applyCategoryConfigToDom(categoryConfig);
    localStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify(categoryConfig));
  } catch (err) {
    console.error("Failed to apply category config:", err);
  }
}

// The actual DOM-mutation logic, factored out so both the async fetch
// above and the synchronous cache-apply snippet in each page can use the
// identical rules (the snippet is vanilla JS duplicated inline since it
// runs before render.js loads, but mirrors this function's logic).
function applyCategoryConfigToDom(categoryConfig) {
  const site = categoryConfig._site || {};
  if (site.title) {
    const titleEl = document.getElementById("site-title-text");
    if (titleEl) titleEl.textContent = site.title;
    const heroTitleEl = document.getElementById("hero-title-text");
    if (heroTitleEl) heroTitleEl.textContent = site.title;
    document.title = document.title.includes(" — ")
      ? document.title.replace(/ — .+$/, ` — ${site.title}`)
      : site.title;
  }
  if (site.tagline) {
    const taglineEl = document.getElementById("hero-tagline");
    if (taglineEl) taglineEl.textContent = site.tagline;
  }
  if (site.footer) {
    const footerEl = document.getElementById("site-footer-text");
    if (footerEl) footerEl.textContent = site.footer;
  }
  if (site.statusLine) {
    const statusEl = document.getElementById("hero-status-line");
    if (statusEl) statusEl.textContent = site.statusLine;
  }

  Object.entries(categoryConfig).forEach(([key, cfg]) => {
    if (key === "_site") return;
    const navLink = document.getElementById(`nav-${key}`);
    if (navLink) {
      if (cfg.enabled === false) navLink.style.display = "none";
      else if (cfg.label) navLink.textContent = cfg.label;
    }
    const card = document.getElementById(`card-${key}`);
    if (card) {
      if (cfg.enabled === false) {
        card.style.display = "none";
      } else if (cfg.label) {
        const h2 = card.querySelector("h2");
        if (h2) h2.textContent = cfg.label;
      }
    }
    if (cfg.blurb) {
      const cardDesc = document.getElementById(`card-desc-${key}`);
      if (cardDesc) cardDesc.textContent = cfg.blurb;
    }
    const pageTitle = document.getElementById("page-title");
    const crumbLabel = document.getElementById("crumb-label");
    if (document.body.dataset.category === key) {
      if (cfg.label) {
        if (pageTitle) pageTitle.textContent = cfg.label;
        if (crumbLabel) crumbLabel.textContent = cfg.label;
        document.title = document.title.replace(/^[^—]+/, `${cfg.label} `);
      }
      if (cfg.blurb) {
        const pageBlurb = document.getElementById("page-blurb");
        if (pageBlurb) pageBlurb.textContent = cfg.blurb;
      }
    }
  });
}

const THEME_CACHE_KEY = "worldforge_theme_cache";

function googleFontLinkTag(fontName) {
  const family = encodeURIComponent(fontName).replace(/%20/g, "+");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap">`;
}

// Shared between the async applySiteTheme() below and the synchronous
// cache-apply snippet duplicated inline in every page's <head> (which
// can't call this function directly since it runs before render.js
// loads -- see the inline snippet for why it's a near-identical copy of
// this logic in plain vanilla JS).
function buildThemeOverrideCss(styleGuide) {
  const hex = /^#[0-9a-fA-F]{6}$/;
  const overrides = [];
  if (hex.test(styleGuide.backgroundColor)) overrides.push(`--bg-void: ${styleGuide.backgroundColor};`);
  if (hex.test(styleGuide.panelColor)) overrides.push(`--bg-panel: ${styleGuide.panelColor}; --bg-panel-raised: ${styleGuide.panelColor};`);
  if (hex.test(styleGuide.inkColor)) overrides.push(`--ink: ${styleGuide.inkColor};`);
  if (hex.test(styleGuide.primaryColor)) overrides.push(`--neon-primary: ${styleGuide.primaryColor};`);
  if (hex.test(styleGuide.secondaryColor)) overrides.push(`--neon-cyan: ${styleGuide.secondaryColor};`);
  // Override the CSS custom properties themselves, not selector rules --
  // style.css and several inline style="font-family: var(--font-display)"
  // attributes already reference these variables everywhere. Redefining
  // what the variable MEANS cascades correctly through all of that
  // automatically. Writing a competing `h1 { font-family: ... }` rule
  // instead (the original approach) silently lost to any inline style
  // using var(--font-display), which is why some titles kept showing the
  // default font even after "applying" a theme.
  if (styleGuide.fontDisplay) overrides.push(`--font-display: '${styleGuide.fontDisplay}', sans-serif;`);
  if (styleGuide.fontBody) overrides.push(`--font-body: '${styleGuide.fontBody}', sans-serif;`);

  return `:root { ${overrides.join(" ")} }`;
}

// Applies style_guide_json's literal color/font fields (Wizard Step 6) as
// a runtime CSS override, and caches it in localStorage so the NEXT page
// load can apply it synchronously before first paint (see the inline
// cache-apply snippet at the top of every page's <head>) -- eliminating
// the flash-of-default-theme on every navigation after the first.
//
// KNOWN SIMPLIFICATION: localStorage isn't scoped per-account -- if
// multiple WorldForge accounts share one browser, they'll briefly see
// each other's cached theme on the very first paint before this async
// call corrects it. Low-stakes (visual only, self-corrects same page
// load), same risk class as the portrait bucket's unguessable-ID
// simplification -- not worth solving until it's a real complaint.
async function applySiteTheme() {
  try {
    const res = await authFetch("/api/wizard/style-guide");
    const { styleGuide } = await res.json();

    // Remove any previously-applied override (from this call or the
    // cache-apply snippet) so a world with no theme (or a freshly reset
    // one) actually reverts to the site defaults instead of leaving a
    // stale cached theme showing forever.
    const existingOverride = document.getElementById("world-theme-override");
    if (existingOverride) existingOverride.remove();
    const cachedOverride = document.getElementById("world-theme-cached");
    if (cachedOverride) cachedOverride.remove();

    if (!styleGuide) {
      localStorage.removeItem(THEME_CACHE_KEY);
      return;
    }

    let fontLinks = "";
    if (styleGuide.fontDisplay) fontLinks += googleFontLinkTag(styleGuide.fontDisplay);
    if (styleGuide.fontBody) fontLinks += googleFontLinkTag(styleGuide.fontBody);
    if (fontLinks) document.head.insertAdjacentHTML("beforeend", fontLinks);

    const styleTag = document.createElement("style");
    styleTag.id = "world-theme-override";
    styleTag.textContent = buildThemeOverrideCss(styleGuide);
    document.head.appendChild(styleTag);

    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(styleGuide));
  } catch (err) {
    console.error("Failed to apply site theme:", err);
  }
}

// ---------- Homepage: compute archived counts from each manifest ----------
function renderHomepageCounts(manifests) {
  Object.keys(manifests).forEach(category => {
    const list = manifests[category] || [];
    const archived = list.filter(e => !e.locked).length;
    const el = document.getElementById(`count-${category}`);
    if (el) el.textContent = `${archived} / ${list.length} archived`;
  });
}

// ---------- Shared nav: archive-wide search ----------
// Self-initializing (see the DOMContentLoaded listener at the bottom of
// this file) so every page that includes render.js gets a working search
// bar for free, with no per-page wiring needed -- same "add once, works
// everywhere" approach as the nav link rollout for Locations.

function escapeHtmlForSearch(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Category pages link to dossier.html via "../dossier.html"; top-level
// pages (homepage, dossier, map, settings, world-info) link via a bare
// "dossier.html". Rather than hardcode this per file, read it off the
// nav's own Factions link, which every page that has the nav already
// gets right.
function getSitePrefix() {
  const link = document.getElementById("nav-factions");
  const href = (link && link.getAttribute("href")) || "";
  return href.startsWith("../") ? "../" : "";
}

function initSiteSearch() {
  const input = document.getElementById("site-search-input");
  const results = document.getElementById("site-search-results");
  if (!input || !results) return;
  const prefix = getSitePrefix();
  let debounceTimer = null;

  function hideResults() {
    results.style.display = "none";
  }

  function renderSearchResults(groups) {
    if (!groups.length) {
      results.innerHTML = '<div class="site-search-empty">No matches.</div>';
      results.style.display = "block";
      return;
    }
    results.innerHTML = groups.map(group => {
      const label = CATEGORY_LABELS[group.category] || group.category;
      const items = group.entries.map(entry => {
        const href = `${prefix}dossier.html?category=${encodeURIComponent(group.category)}&id=${encodeURIComponent(entry.id)}`;
        return `<a class="site-search-result" href="${href}"><span>${escapeHtmlForSearch(entry.name)}</span><span class="site-search-cat">${label}</span></a>`;
      }).join("");
      return `<div class="site-search-group"><div class="site-search-group-label">${label}</div>${items}</div>`;
    }).join("");
    results.style.display = "block";
  }

  async function runSearch(q) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      hideResults();
      return;
    }
    try {
      const res = await authFetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed.");
      renderSearchResults(data.results || []);
    } catch (err) {
      console.error("Search failed:", err);
      hideResults();
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value;
    debounceTimer = setTimeout(() => runSearch(q), 250);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideResults();
      input.blur();
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target !== input && !results.contains(e.target)) hideResults();
  });
}

document.addEventListener("DOMContentLoaded", initSiteSearch);
