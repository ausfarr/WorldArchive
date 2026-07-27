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
    if (!res.ok) throw new Error(data.error || "Generation failed");
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
    if (!res.ok) throw new Error(data.error || "Generation failed");
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
      ${REGENERATE_ENDPOINTS[categoryPath] ? `<button type="button" class="regen-btn" onclick="event.stopPropagation(); regenerateEntry('${categoryPath}', '${entry.id}', this)" style="position: relative; z-index: 2; margin-top: 10px; background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Regenerate</button>` : ""}
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
