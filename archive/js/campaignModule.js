// archive/js/campaignModule.js
//
// Campaign Structure -- see session_addendum_campaign_structure_scope.md.
// Kept as its own file rather than folded into render.js's renderDossier()
// machinery: a Campaign Module isn't one of the 8 fixed content
// categories (no manifest/entries-table row, no locked/fill-in state),
// so it doesn't fit that per-category rendering pattern -- these are two
// standalone pages (campaigns/index.html, campaigns/builder.html) with
// their own simpler read/write flow against routes/campaignModule.js.
//
// Reuses render.js's authFetch, showGenerationOverlay/hideGenerationOverlay,
// and CATEGORY_LABELS globals -- render.js is loaded before this file on
// both pages.

const CM_STATUS_LABELS = { planned: "Planned", prepped: "Prepped", run: "Run" };

// ---------- List page (campaigns/index.html) ----------

async function loadAndRenderCampaignList() {
  const host = document.getElementById("campaign-list");
  const empty = document.getElementById("campaign-list-empty");
  if (!host) return;
  try {
    const res = await authFetch("/api/campaign-modules");
    const data = await res.json();
    const modules = (data && data.modules) || [];
    if (modules.length === 0) {
      empty.style.display = "block";
      return;
    }
    host.innerHTML = modules.map((m) => `
      <a href="builder.html?id=${encodeURIComponent(m.id)}" class="entry-card" style="text-decoration: none; display: block;">
        <div class="entry-card-body">
          <h3 style="margin: 0 0 4px;">${cmEscapeHtml(m.name)}</h3>
          <p style="margin: 0 0 8px; color: var(--ink-dim); font-size: 0.85rem;">${cmEscapeHtml(m.summary || "")}</p>
          <div style="display:flex; gap:8px; align-items:center; font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-faint); text-transform: uppercase;">
            <span class="tag">${CM_STATUS_LABELS[m.status] || m.status}</span>
            <span>${m.entries.length} ${m.entries.length === 1 ? "entry" : "entries"}</span>
          </div>
        </div>
      </a>
    `).join("");
  } catch (err) {
    console.error("Loading campaign modules failed:", err);
    host.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.85rem;">Couldn't load Quests: ${cmEscapeHtml(err.message)}</p>`;
  }
}

// ---------- Builder page (campaigns/builder.html) ----------

let cmEditingId = null;
let cmArcId = null; // set when arriving from a Campaign's unmatched stage (?arcId=...)
let cmStageId = null; // the specific pending stage this Quest fulfills, so it can be removed from the Campaign's list
let cmEntries = []; // [{category, entryId, name, subtitle, role, note}]
let cmEntryOptionsCache = {}; // category -> [{id, name, subtitle}]
let cmLoadedModule = null; // last fetched/saved module, used to render view mode and to reset on Cancel

// Quest/Campaign Module slot-fill ruleset fix -- see
// session_addendum_quest_slot_fill_ruleset_and_background_equipment.md.
// cmRuleset is fetched ONCE when the builder page loads (see
// cmLoadRulesetOnce() below) and reused everywhere a ruleset check is
// needed (both the Import/Reflavor/Homebrew slot picker and Encounter
// Difficulty's own 5e-only gating) instead of each feature doing its own
// round trip.
let cmRuleset = "echoes";
let cmSrdMonstersCache = null; // [{id, name, cr}] -- lazily fetched the first time a 5e world's preview shows an unmatched enemies slot
let cmSrdItemsCache = null; // {mundane:[...], magic:[...]} -- same, for an unmatched items slot
let cmSlotModeState = {}; // preview entry index -> {mode: 'homebrew'|'import'|'reflavor', srdLibraryId} for the Import/Reflavor/Homebrew slot picker

async function cmLoadRulesetOnce() {
  try {
    const res = await authFetch("/api/wizard/ruleset-options");
    const data = await res.json();
    cmRuleset = data.current || "echoes";
  } catch (err) {
    console.error("Could not load this world's ruleset, defaulting to Echoes behavior:", err);
  }
}

async function initCampaignBuilder() {
  const params = new URLSearchParams(window.location.search);
  cmEditingId = params.get("id");
  cmArcId = params.get("arcId");
  cmStageId = params.get("stageId");
  const prefillConcept = params.get("prefillConcept");

  await cmLoadRulesetOnce();
  await cmPopulateAddEntrySelect();
  cmInitEncounterDifficulty();
  document.getElementById("cm-add-category").addEventListener("change", cmPopulateAddEntrySelect);
  document.getElementById("cm-add-btn").addEventListener("click", cmAddEntryManually);
  document.getElementById("cm-generate-btn").addEventListener("click", cmGenerateWithAi);
  document.getElementById("cm-save-btn").addEventListener("click", cmSaveModule);
  document.getElementById("cm-cancel-edit-btn").addEventListener("click", () => {
    if (cmLoadedModule) {
      cmPopulateEditForm(cmLoadedModule);
      cmExitEditMode();
    }
  });

  if (cmEditingId) {
    document.getElementById("cm-danger-zone").style.display = "block";
    document.getElementById("cm-delete-btn").addEventListener("click", cmDeleteModule);
    try {
      const res = await authFetch(`/api/campaign-modules/${encodeURIComponent(cmEditingId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load.");
      const mod = data.module;
      document.getElementById("crumb-name").textContent = mod.name || "Quest";
      cmEntries = await cmHydrateExistingEntries(mod.entries || []);
      cmPopulateEditForm(mod);
      // Load finished in a saved, real state -- show it as finalized (view
      // mode), same as any other archive entry. Edit is an explicit action
      // from here, not the default landing state.
      cmRenderViewMode({ ...mod, entries: cmEntries });
      document.getElementById("cm-edit-mode").style.display = "none";
    } catch (err) {
      document.getElementById("cm-save-status").textContent = "Couldn't load this Quest: " + err.message;
      document.getElementById("cm-edit-mode").style.display = "block";
    }
  } else {
    // Brand new -- nothing saved yet, so there's nothing to show as
    // "finalized." Go straight to the build form.
    document.getElementById("cm-edit-mode").style.display = "block";
    cmRenderEntriesList();
    if (prefillConcept) {
      document.getElementById("cm-concept").value = prefillConcept;
    }
  }
}

function cmPopulateEditForm(mod) {
  document.getElementById("cm-name").value = mod.name || "";
  document.getElementById("cm-summary").value = mod.summary || "";
  document.getElementById("cm-status").value = mod.status || "planned";
  cmRenderEntriesList();
}

// Read-only display for a saved module -- the default state when opening
// an existing Campaign Module, matching every other category's Edit/
// Regenerate-sit-beside-a-finalized-view pattern instead of always
// landing on an editable form.
function cmRenderViewMode(mod) {
  cmLoadedModule = mod;
  const host = document.getElementById("cm-view-mode");
  const entriesHtml = (mod.entries || []).length
    ? mod.entries.map((e) => `
        <div style="border: 1px solid var(--border-line); padding: 10px 12px; margin-bottom: 8px;">
          <span class="tag">${CATEGORY_LABELS[e.category] || e.category}</span>
          <strong style="margin-left:6px; ${e.broken ? "color: var(--danger, #c0392b);" : ""}">${cmEscapeHtml(e.name || e.entryId)}${e.broken ? " (missing)" : ""}</strong>
          <p style="margin:4px 0 0; font-size:0.85rem; color: var(--ink-dim);">${cmEscapeHtml(e.role || "")}${e.role && e.note ? " — " : ""}${cmEscapeHtml(e.note || "")}</p>
        </div>
      `).join("")
    : `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.85rem;">No entries yet.</p>`;

  host.innerHTML = `
    <div class="sheet-header">
      <p class="sheet-eyebrow">Quest</p>
      <h1 style="font-family: var(--font-display); text-transform: uppercase; margin: 6px 0 10px;">${cmEscapeHtml(mod.name)}</h1>
      ${mod.summary ? `<p class="subtitle" style="margin:0 0 12px;">${cmEscapeHtml(mod.summary)}</p>` : ""}
      <span class="tag">${CM_STATUS_LABELS[mod.status] || mod.status}</span>
    </div>
    <div class="sheet-body">
      <h2>Entries</h2>
      ${entriesHtml}
    </div>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-line-soft); display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
      <button type="button" id="cm-edit-btn" class="bm-btn">Edit</button>
      <button type="button" id="cm-export-btn" class="bm-btn bm-btn-secondary">Download PDF</button>
      <span id="cm-export-status" class="bm-status"></span>
    </div>
  `;
  document.getElementById("cm-edit-btn").addEventListener("click", cmEnterEditMode);
  document.getElementById("cm-export-btn").addEventListener("click", () =>
    downloadExportPdf(`/api/export/campaign/${mod.id}`, document.getElementById("cm-export-btn"), document.getElementById("cm-export-status"))
  );
}

function cmEnterEditMode() {
  document.getElementById("cm-view-mode").style.display = "none";
  document.getElementById("cm-edit-mode").style.display = "block";
  document.getElementById("cm-cancel-edit-btn").style.display = "inline-block";
}

function cmExitEditMode() {
  document.getElementById("cm-edit-mode").style.display = "none";
  document.getElementById("cm-view-mode").style.display = "block";
}

// Existing saved entries only carry {category, entryId, role, note} --
// look each one up for display name/subtitle. A since-deleted entry
// (category/id no longer resolves) is shown as a broken reference rather
// than silently dropped, so the DM notices and can remove it.
async function cmHydrateExistingEntries(entries) {
  const results = await Promise.all(entries.map(async (e) => {
    try {
      const res = await authFetch(`/api/entries/${e.category}/${encodeURIComponent(e.entryId)}`);
      const data = await res.json();
      if (res.ok && data.entry) {
        return { ...e, name: data.entry.name, subtitle: data.entry.subtitle || null, broken: false };
      }
    } catch (err) { /* fall through to broken */ }
    return { ...e, name: e.entryId, subtitle: null, broken: true };
  }));
  return results;
}

async function cmPopulateAddEntrySelect() {
  const category = document.getElementById("cm-add-category").value;
  const select = document.getElementById("cm-add-entry");
  select.innerHTML = "<option>Loading…</option>";
  try {
    if (!cmEntryOptionsCache[category]) {
      const res = await authFetch(`/api/entries/${category}`);
      const data = await res.json();
      cmEntryOptionsCache[category] = (data.entries || []).map((e) => ({ id: e.id, name: e.name, subtitle: e.subtitle || "" }));
    }
    const options = cmEntryOptionsCache[category];
    select.innerHTML = options.length
      ? options.map((o) => `<option value="${cmEscapeHtml(o.id)}">${cmEscapeHtml(o.name)}${o.subtitle ? " — " + cmEscapeHtml(o.subtitle) : ""}</option>`).join("")
      : `<option value="">No ${CATEGORY_LABELS[category] || category} yet</option>`;
  } catch (err) {
    select.innerHTML = `<option value="">Couldn't load</option>`;
  }
}

function cmAddEntryManually() {
  const category = document.getElementById("cm-add-category").value;
  const entrySelect = document.getElementById("cm-add-entry");
  const entryId = entrySelect.value;
  if (!entryId) return;
  const opt = (cmEntryOptionsCache[category] || []).find((o) => o.id === entryId);
  const role = document.getElementById("cm-add-role").value.trim();
  const note = document.getElementById("cm-add-note").value.trim();
  cmEntries.push({ category, entryId, name: opt ? opt.name : entryId, subtitle: opt ? opt.subtitle : "", role, note });
  document.getElementById("cm-add-role").value = "";
  document.getElementById("cm-add-note").value = "";
  cmRenderEntriesList();
}

function cmRemoveEntry(index) {
  cmEntries.splice(index, 1);
  cmRenderEntriesList();
}

function cmRenderEntriesList() {
  const host = document.getElementById("cm-entries-list");
  if (cmEntries.length === 0) {
    host.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.8rem;">No entries yet — add some below, or generate with AI above.</p>`;
    return;
  }
  host.innerHTML = cmEntries.map((e, i) => `
    <div style="border: 1px solid var(--border-line); padding: 10px 12px; display: flex; align-items: center; gap: 10px;">
      <span class="tag" style="flex-shrink:0;">${CATEGORY_LABELS[e.category] || e.category}</span>
      <div style="flex: 1; min-width: 0;">
        <p style="margin:0; font-weight:600; ${e.broken ? "color: var(--danger, #c0392b);" : ""}">${cmEscapeHtml(e.name)}${e.broken ? " (missing — was this deleted?)" : ""}</p>
        <p style="margin:2px 0 0; font-size:0.78rem; color: var(--ink-dim);">${cmEscapeHtml(e.role || "")}${e.role && e.note ? " — " : ""}${cmEscapeHtml(e.note || "")}</p>
      </div>
      <button type="button" onclick="cmRemoveEntry(${i})" class="bm-btn bm-btn-secondary" style="flex-shrink:0;">Remove</button>
    </div>
  `).join("");
}

// ---------- AI generation + preview ----------

async function cmGenerateWithAi() {
  const btn = document.getElementById("cm-generate-btn");
  const status = document.getElementById("cm-generate-status");
  const previewZone = document.getElementById("cm-preview-zone");
  btn.disabled = true;
  showGenerationOverlay(["Reading through the archive…", "Looking for pieces that connect…", "Drafting the throughline…", "Almost there…"]);
  status.textContent = "Assembling a proposal — this can take a bit…";
  try {
    const concept = document.getElementById("cm-concept").value.trim();
    const res = await authFetch("/api/campaign-modules/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concept })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
    status.textContent = "Proposal ready — review below before accepting.";
    await cmRenderPreview(data);
  } catch (err) {
    status.textContent = "Generation failed: " + err.message;
  } finally {
    hideGenerationOverlay();
    btn.disabled = false;
  }
}

let cmCurrentPreview = null;

// Import/Reflavor SRD pickers for unmatched enemies/items slots (5e
// worlds only) -- lazily fetched once per page load, same lists +
// grouping the standalone "Generate New Entry" forms on
// archive/enemies/index.html / archive/items/index.html already use, so
// a 5e Quest slot offers the exact same source-tier capability as those
// pages instead of only ever generating an Echoes-shaped Homebrew entry.
async function cmLoadSrdMonstersOnce() {
  if (cmSrdMonstersCache) return cmSrdMonstersCache;
  try {
    const res = await authFetch("/api/srd-library?ruleset=5e&category=monsters");
    const data = await res.json();
    cmSrdMonstersCache = data.entries || [];
  } catch (err) {
    console.error("Could not load SRD monster list:", err);
    cmSrdMonstersCache = [];
  }
  return cmSrdMonstersCache;
}

async function cmLoadSrdItemsOnce() {
  if (cmSrdItemsCache) return cmSrdItemsCache;
  try {
    const [mundaneRes, magicRes] = await Promise.all([
      authFetch("/api/srd-library?ruleset=5e&category=items"),
      authFetch("/api/srd-library?ruleset=5e&category=magic-items")
    ]);
    cmSrdItemsCache = {
      mundane: (await mundaneRes.json()).entries || [],
      magic: (await magicRes.json()).entries || []
    };
  } catch (err) {
    console.error("Could not load SRD item list:", err);
    cmSrdItemsCache = { mundane: [], magic: [] };
  }
  return cmSrdItemsCache;
}

function cmSrdOptionsHtml(category) {
  if (category === "enemies") {
    const list = cmSrdMonstersCache || [];
    return list.length
      ? list.map((m) => `<option value="${m.id}">${cmEscapeHtml(m.name)}${m.cr != null ? ` (CR ${m.cr})` : ""}</option>`).join("")
      : `<option value="">No SRD monsters available</option>`;
  }
  const items = cmSrdItemsCache || { mundane: [], magic: [] };
  const mundaneHtml = items.mundane.length ? `<optgroup label="Equipment">${items.mundane.map((it) => `<option value="${it.id}">${cmEscapeHtml(it.name)}</option>`).join("")}</optgroup>` : "";
  const magicHtml = items.magic.length ? `<optgroup label="Magic Items">${items.magic.map((it) => `<option value="${it.id}">${cmEscapeHtml(it.name)} (${cmEscapeHtml(it.rarity || "Magic")})</option>`).join("")}</optgroup>` : "";
  return (mundaneHtml + magicHtml) || `<option value="">No SRD items available</option>`;
}

async function cmRenderPreview(proposal) {
  cmCurrentPreview = proposal;
  cmSlotModeState = {};
  const zone = document.getElementById("cm-preview-zone");
  zone.innerHTML = `
    <div style="border: 1px solid var(--border-accent, var(--neon-primary)); padding: 14px; margin: 10px 0;">
      <p style="margin:0 0 4px; font-weight:600;">${cmEscapeHtml(proposal.name)}</p>
      <p style="margin:0 0 12px; color: var(--ink-dim); font-size:0.85rem;">${cmEscapeHtml(proposal.summary)}</p>
      <div id="cm-preview-entries" style="display:flex; flex-direction:column; gap:8px;"></div>
      <div style="margin-top:12px; display:flex; gap:10px;">
        <button type="button" id="cm-accept-preview-btn" class="bm-btn">Accept into module</button>
        <button type="button" id="cm-discard-preview-btn" class="bm-btn bm-btn-secondary">Discard</button>
      </div>
    </div>
  `;
  // Only fetch the SRD picker lists if this preview actually has an
  // unmatched enemies/items slot on a 5e world -- an Echoes/Generic
  // world, or a preview with no such slot, never pays this round trip.
  const needsSrdPickers = cmRuleset === "5e" && proposal.entries.some((e) => !e.matched && (e.category === "enemies" || e.category === "items"));
  if (needsSrdPickers) {
    await Promise.all([cmLoadSrdMonstersOnce(), cmLoadSrdItemsOnce()]);
  }
  cmRenderPreviewEntries(proposal.entries);
  document.getElementById("cm-accept-preview-btn").addEventListener("click", () => cmAcceptPreview(proposal));
  document.getElementById("cm-discard-preview-btn").addEventListener("click", cmDiscardPreview);
}

// Discarding the preview used to just clear the DOM -- but any slot
// filled via "Generate one" (cmGenerateSlot) already saved a REAL,
// cap-charged entry to its category the moment it was generated (see
// lib/campaignEntryGenerators.js's header comment for why), so discarding
// without deleting those left orphaned, paid-for entries behind with no
// warning. Entries picked via "Pick existing instead" are NOT touched --
// those are pre-existing archive content this preview only referenced.
async function cmDiscardPreview() {
  const zone = document.getElementById("cm-preview-zone");
  const freshEntries = (cmCurrentPreview ? cmCurrentPreview.entries : []).filter((e) => e.freshlyGenerated && e.entryId);

  if (freshEntries.length > 0) {
    const names = freshEntries.map((e) => e.name || e.entryId).join(", ");
    const confirmed = confirm(
      `This preview includes ${freshEntries.length} freshly-generated ${freshEntries.length === 1 ? "entry" : "entries"} (${names}) that ${freshEntries.length === 1 ? "was" : "were"} already saved for real. ` +
      `Discarding will permanently delete ${freshEntries.length === 1 ? "it" : "them"} too, not just the preview. Continue?`
    );
    if (!confirmed) return;

    for (const e of freshEntries) {
      try {
        await authFetch(`/api/entries/${e.category}/${e.entryId}`, { method: "DELETE" });
      } catch (err) {
        console.error(`Failed to delete discarded Quest slot entry ${e.category}/${e.entryId}:`, err);
      }
    }
  }

  cmCurrentPreview = null;
  zone.innerHTML = "";
}

// A 5e world's unmatched enemies/items slot gets the same
// Homebrew/Import/Reflavor source choice the standalone "Generate New
// Entry" forms already offer -- everything else (Echoes, Generic, or a
// non-enemy/item category on any ruleset) renders exactly as before,
// defaulting to Homebrew server-side (lib/campaignEntryGenerators.js's
// createNewEnemy/createNewItem default `mode` to "homebrew" when absent).
function cmShowsSourcePicker(category) {
  return cmRuleset === "5e" && (category === "enemies" || category === "items");
}

function cmRenderPreviewEntries(entries) {
  const host = document.getElementById("cm-preview-entries");
  host.innerHTML = entries.map((e, i) => {
    if (e.matched) {
      return `
        <div style="border: 1px solid var(--border-line); padding: 8px 10px;">
          <span class="tag">${CATEGORY_LABELS[e.category] || e.category}</span>
          <strong style="margin-left:6px;">${cmEscapeHtml(e.name)}</strong>
          <p style="margin:4px 0 0; font-size:0.8rem; color: var(--ink-dim);">${cmEscapeHtml(e.role || "")}${e.role && e.note ? " — " : ""}${cmEscapeHtml(e.note || "")}</p>
        </div>
      `;
    }

    const showPicker = cmShowsSourcePicker(e.category);
    let sourcePickerHtml = "";
    let generateDisabled = false;
    if (showPicker) {
      const state = cmSlotModeState[i] || (cmSlotModeState[i] = { mode: "homebrew", srdLibraryId: "" });
      const needsSrd = state.mode === "import" || state.mode === "reflavor";
      generateDisabled = needsSrd && !state.srdLibraryId;
      const noun = e.category === "enemies" ? "monster" : "item";
      sourcePickerHtml = `
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin: 8px 0 6px;">
          <button type="button" class="mode-btn${state.mode === "homebrew" ? " mode-btn-active" : ""}" onclick="cmSetSlotMode(${i}, 'homebrew')">Homebrew<span class="mode-btn-tag">AI · fully new design</span></button>
          <button type="button" class="mode-btn${state.mode === "import" ? " mode-btn-active" : ""}" onclick="cmSetSlotMode(${i}, 'import')">Import<span class="mode-btn-tag">Free · copies SRD ${noun}</span></button>
          <button type="button" class="mode-btn${state.mode === "reflavor" ? " mode-btn-active" : ""}" onclick="cmSetSlotMode(${i}, 'reflavor')">Reflavor<span class="mode-btn-tag">AI · SRD stats, new narrative</span></button>
        </div>
        ${needsSrd ? `
          <select id="cm-slot-srd-${i}" onchange="cmSetSlotSrd(${i}, this.value)" style="width:100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 6px 8px; margin-bottom:8px;">
            <option value="">Select an SRD ${noun}…</option>
            ${cmSrdOptionsHtml(e.category)}
          </select>
        ` : ""}
      `;
    }

    return `
      <div style="border: 1px dashed var(--border-line); padding: 8px 10px;" id="cm-preview-slot-${i}">
        <span class="tag">${CATEGORY_LABELS[e.category] || e.category}</span>
        <strong style="margin-left:6px; color: var(--ink-faint);">Nothing existing fits</strong>
        <p style="margin:4px 0 8px; font-size:0.8rem; color: var(--ink-dim);">${cmEscapeHtml(e.neededConcept || e.note || "")}</p>
        ${sourcePickerHtml}
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="bm-btn ai-action" onclick="cmGenerateSlot(${i})"${generateDisabled ? " disabled" : ""}>Generate one (1 generation)</button>
          <button type="button" class="bm-btn bm-btn-secondary" onclick="cmOpenSlotPicker(${i})">Pick existing instead</button>
          <button type="button" class="bm-btn bm-btn-secondary" onclick="cmLeaveSlotEmpty(${i})">Leave empty</button>
        </div>
        <p id="cm-preview-slot-status-${i}" class="bm-status"></p>
      </div>
    `;
  }).join("");
}

function cmSetSlotMode(index, mode) {
  const state = cmSlotModeState[index] || (cmSlotModeState[index] = { mode: "homebrew", srdLibraryId: "" });
  state.mode = mode;
  if (mode === "homebrew") state.srdLibraryId = "";
  cmRenderPreviewEntries(cmCurrentPreview.entries);
}

function cmSetSlotSrd(index, value) {
  const state = cmSlotModeState[index] || (cmSlotModeState[index] = { mode: "homebrew", srdLibraryId: "" });
  state.srdLibraryId = value;
  cmRenderPreviewEntries(cmCurrentPreview.entries);
}

// "Pick existing instead" -- the AI proposal said nothing existing fit,
// but that's a judgment call the DM can override. Toggles a small inline
// picker within the slot card (reuses the same per-category entry cache
// the manual "Add entry" form already builds, so this doesn't cost an
// extra round trip if that form was already used this session).
async function cmOpenSlotPicker(index) {
  const slot = cmCurrentPreview.entries[index];
  const existingPicker = document.getElementById(`cm-slot-picker-${index}`);
  if (existingPicker) { existingPicker.remove(); return; }

  if (!cmEntryOptionsCache[slot.category]) {
    const res = await authFetch(`/api/entries/${slot.category}`);
    const data = await res.json();
    cmEntryOptionsCache[slot.category] = (data.entries || []).map((e) => ({ id: e.id, name: e.name, subtitle: e.subtitle || "" }));
  }
  const options = cmEntryOptionsCache[slot.category];
  const container = document.getElementById(`cm-preview-slot-${index}`);
  const picker = document.createElement("div");
  picker.id = `cm-slot-picker-${index}`;
  picker.style.cssText = "margin-top:8px; display:flex; gap:8px; align-items:center;";
  picker.innerHTML = `
    <select id="cm-slot-picker-select-${index}" style="flex:1; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 6px 8px;">
      ${options.length ? options.map((o) => `<option value="${cmEscapeHtml(o.id)}">${cmEscapeHtml(o.name)}${o.subtitle ? " — " + cmEscapeHtml(o.subtitle) : ""}</option>`).join("") : `<option value="">No ${CATEGORY_LABELS[slot.category] || slot.category} yet</option>`}
    </select>
    <button type="button" class="bm-btn" onclick="cmConfirmSlotPick(${index})">Use this</button>
  `;
  container.appendChild(picker);
}

function cmConfirmSlotPick(index) {
  const select = document.getElementById(`cm-slot-picker-select-${index}`);
  const entryId = select.value;
  if (!entryId) return;
  const slot = cmCurrentPreview.entries[index];
  const opt = (cmEntryOptionsCache[slot.category] || []).find((o) => o.id === entryId);
  cmCurrentPreview.entries[index] = { ...slot, matched: true, entryId, name: opt ? opt.name : entryId, subtitle: opt ? opt.subtitle : "" };
  cmRenderPreviewEntries(cmCurrentPreview.entries);
}

function cmAcceptPreview(proposal) {
  if (!document.getElementById("cm-name").value.trim()) {
    document.getElementById("cm-name").value = proposal.name;
  }
  if (!document.getElementById("cm-summary").value.trim()) {
    document.getElementById("cm-summary").value = proposal.summary;
  }
  proposal.entries.filter((e) => e.matched).forEach((e) => {
    cmEntries.push({ category: e.category, entryId: e.entryId, name: e.name, subtitle: e.subtitle, role: e.role, note: e.note });
  });
  cmRenderEntriesList();
  document.getElementById("cm-preview-zone").innerHTML = "";
}

// Builds the full context a "Generate one" call sends, not just the
// slot's own neededConcept -- includes the module's own name/summary
// and every OTHER entry already part of it (both AI-matched picks in
// the current preview and anything the DM already added manually via
// cmEntries), so a newly-generated NPC/Location/Item/Log actually knows
// what quest it's for and who/what else is already in it, instead of
// being generated in isolation from a single role description.
function cmBuildSlotContext(slot) {
  const parts = [];
  const moduleName = document.getElementById("cm-name").value.trim() || (cmCurrentPreview && cmCurrentPreview.name) || "";
  const moduleSummary = document.getElementById("cm-summary").value.trim() || (cmCurrentPreview && cmCurrentPreview.summary) || "";
  if (moduleName) parts.push(`This is for a Quest called "${moduleName}".`);
  if (moduleSummary) parts.push(`Quest summary: ${moduleSummary}`);
  parts.push(`This entry fills the role: ${slot.role || "unspecified"}.`);
  if (slot.neededConcept || slot.note) parts.push(`Concept for this specific piece: ${slot.neededConcept || slot.note}`);

  const others = [];
  cmEntries.forEach((e) => {
    if (e.name) others.push(`${e.name} (${CATEGORY_LABELS[e.category] || e.category}${e.role ? ", " + e.role : ""})`);
  });
  if (cmCurrentPreview) {
    cmCurrentPreview.entries.forEach((e) => {
      if (e.matched && e.name) others.push(`${e.name} (${CATEGORY_LABELS[e.category] || e.category}${e.role ? ", " + e.role : ""})`);
    });
  }
  if (others.length) parts.push(`Other pieces already part of this quest -- make this entry feel connected to them where it makes sense: ${others.join("; ")}.`);

  return parts.join(" ");
}

async function cmGenerateSlot(index) {
  if (!cmCurrentPreview) return;
  const slot = cmCurrentPreview.entries[index];
  const statusEl = document.getElementById(`cm-preview-slot-status-${index}`);

  // 5e enemies/items slot carries a mode/srdLibraryId choice from the
  // source picker rendered in cmRenderPreviewEntries -- everything else
  // (Echoes, Generic, non-enemy/item categories) has no such state and
  // falls through to homebrew/undefined, matching pre-existing behavior.
  const slotState = cmShowsSourcePicker(slot.category) ? cmSlotModeState[index] : null;
  if (slotState && (slotState.mode === "import" || slotState.mode === "reflavor") && !slotState.srdLibraryId) {
    statusEl.textContent = `Pick an SRD ${slot.category === "enemies" ? "monster" : "item"} first.`;
    return;
  }

  statusEl.textContent = "Generating…";
  showGenerationOverlay();
  try {
    const body = { category: slot.category, concept: cmBuildSlotContext(slot) };
    if (slotState) {
      body.mode = slotState.mode;
      body.srdLibraryId = slotState.srdLibraryId || undefined;
    }
    const res = await authFetch("/api/campaign-modules/generate-slot-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
    // freshlyGenerated marks this as a real, immediately-saved,
    // cap-charged entry created JUST for this slot -- as opposed to an
    // existing entry the DM picked via "Pick existing instead" (line
    // ~352 below), which must never be deleted on discard since it's
    // pre-existing archive content, not something this preview created.
    cmCurrentPreview.entries[index] = { ...slot, matched: true, entryId: data.entryId, name: data.name, subtitle: data.subtitle, freshlyGenerated: true };
    delete cmSlotModeState[index];
    cmRenderPreviewEntries(cmCurrentPreview.entries);
  } catch (err) {
    statusEl.textContent = "Failed: " + err.message;
  } finally {
    hideGenerationOverlay();
  }
}

function cmLeaveSlotEmpty(index) {
  if (!cmCurrentPreview) return;
  cmCurrentPreview.entries.splice(index, 1);
  // Splicing shifts every later slot's index down by one -- reindex
  // cmSlotModeState the same way so a source-picker choice already made
  // on a later slot doesn't end up misapplied to the wrong slot.
  const reindexed = {};
  Object.keys(cmSlotModeState).forEach((key) => {
    const i = Number(key);
    if (i < index) reindexed[i] = cmSlotModeState[key];
    else if (i > index) reindexed[i - 1] = cmSlotModeState[key];
  });
  cmSlotModeState = reindexed;
  cmRenderPreviewEntries(cmCurrentPreview.entries);
}

// ---------- Save / delete ----------

async function cmSaveModule() {
  const btn = document.getElementById("cm-save-btn");
  const status = document.getElementById("cm-save-status");
  const name = document.getElementById("cm-name").value.trim();
  if (!name) {
    status.textContent = "Give this Quest a name first.";
    return;
  }
  btn.disabled = true;
  status.textContent = "Saving…";
  const payload = {
    name,
    summary: document.getElementById("cm-summary").value.trim(),
    status: document.getElementById("cm-status").value,
    entries: cmEntries.map((e) => ({ category: e.category, entryId: e.entryId, role: e.role, note: e.note })),
    createdVia: cmEditingId ? undefined : "manual"
  };
  try {
    const res = cmEditingId
      ? await authFetch(`/api/campaign-modules/${encodeURIComponent(cmEditingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      : await authFetch("/api/campaign-modules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed.");
    status.textContent = "Saved.";
    if (!cmEditingId && data.module) {
      if (cmArcId) {
        try {
          await authFetch(`/api/campaign-arcs/${encodeURIComponent(cmArcId)}/append-quest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questId: data.module.id, stageId: cmStageId })
          });
        } catch (err) {
          console.error("Linking this Quest back to its Campaign failed:", err);
        }
        window.location.href = `../campaign-arcs/builder.html?id=${encodeURIComponent(cmArcId)}`;
        return;
      }
      window.location.href = `builder.html?id=${encodeURIComponent(data.module.id)}`;
    } else if (cmEditingId) {
      document.getElementById("crumb-name").textContent = name;
      cmRenderViewMode({ id: cmEditingId, name, summary: payload.summary, status: payload.status, entries: cmEntries });
      cmExitEditMode();
    }
  } catch (err) {
    status.textContent = "Save failed: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function cmDeleteModule() {
  if (!cmEditingId) return;
  const confirmed = window.confirm("Delete this Quest? This doesn't delete any of the NPCs/Locations/Items/Logs it references, only the Quest itself.");
  if (!confirmed) return;
  try {
    const res = await authFetch(`/api/campaign-modules/${encodeURIComponent(cmEditingId)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed.");
    window.location.href = "index.html";
  } catch (err) {
    document.getElementById("cm-save-status").textContent = "Delete failed: " + err.message;
  }
}

function cmEscapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- R4 Phase 7: Encounter Difficulty (5e only) ----------

let edArchivePartyLevels = null; // set by "Use PCs From Archive" -- real per-character levels take priority over the size/avg-level inputs when present

async function cmInitEncounterDifficulty() {
  const host = document.getElementById("cm-encounter-difficulty");
  if (!host) return;
  // cmRuleset is already loaded once by initCampaignBuilder's
  // cmLoadRulesetOnce() before this runs -- no separate fetch needed here
  // anymore (Quest/Campaign Module slot-fill ruleset fix consolidated
  // this page's two independent ruleset lookups into one).
  if (cmRuleset !== "5e") return; // stays hidden -- Echoes' Tier system and Generic have no CR/XP concept
  host.style.display = "block";

  document.getElementById("ed-use-archive-pcs").addEventListener("click", cmUseArchivePcsForParty);
  document.getElementById("ed-compute-btn").addEventListener("click", cmComputeEncounterDifficulty);
  ["ed-party-size", "ed-party-level"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => { edArchivePartyLevels = null; }); // manual edit overrides a prior Archive pull
  });
}

async function cmUseArchivePcsForParty() {
  const result = document.getElementById("ed-result");
  try {
    const res = await authFetch("/api/entries/survivors");
    const data = await res.json();
    const pcs = (data && data.entries) || [];
    if (!pcs.length) {
      result.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.8rem;">No Player Characters in the Archive yet.</p>`;
      return;
    }
    const full = await Promise.all(pcs.map((p) => authFetch(`/api/entries/survivors/${encodeURIComponent(p.id)}`).then((r) => r.json())));
    const levels = full
      .map((f) => f.entry && f.entry.raw && f.entry.raw.totalLevel)
      .filter((lvl) => typeof lvl === "number" && lvl > 0);
    if (!levels.length) {
      result.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.8rem;">Couldn't read levels from the Archive's Player Characters.</p>`;
      return;
    }
    edArchivePartyLevels = levels;
    document.getElementById("ed-party-size").value = levels.length;
    document.getElementById("ed-party-level").value = Math.round(levels.reduce((s, l) => s + l, 0) / levels.length);
    result.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.8rem;">Pulled ${levels.length} PC${levels.length === 1 ? "" : "s"} from the Archive (levels: ${levels.join(", ")}).</p>`;
  } catch (err) {
    result.innerHTML = `<p style="color: var(--danger, #c0392b); font-family: var(--font-mono); font-size: 0.8rem;">Couldn't load Player Characters: ${cmEscapeHtml(err.message)}</p>`;
  }
}

async function cmComputeEncounterDifficulty() {
  const result = document.getElementById("ed-result");
  const btn = document.getElementById("ed-compute-btn");
  btn.disabled = true;
  result.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.8rem;">Checking…</p>`;
  try {
    const bestiaryRefs = cmEntries.filter((e) => e.category === "enemies");
    if (!bestiaryRefs.length) {
      result.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.8rem;">This Quest has no Bestiary entries yet -- add some above to check difficulty.</p>`;
      return;
    }
    const fullEnemies = await Promise.all(bestiaryRefs.map((e) => authFetch(`/api/entries/enemies/${encodeURIComponent(e.entryId)}`).then((r) => r.json())));
    const monsterCrs = fullEnemies
      .map((f) => f.entry && f.entry.raw && f.entry.raw.challengeRating && f.entry.raw.challengeRating.cr)
      .filter((cr) => cr != null);

    const partySize = Number(document.getElementById("ed-party-size").value) || 1;
    const partyLevel = Number(document.getElementById("ed-party-level").value) || 1;
    const partyLevels = edArchivePartyLevels && edArchivePartyLevels.length
      ? edArchivePartyLevels
      : Array.from({ length: partySize }, () => partyLevel);

    const res = await authFetch("/api/reference/5e/encounter-difficulty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partyLevels, monsterCrs })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't compute difficulty.");

    const DIFFICULTY_COLORS = { Trivial: "var(--ink-faint)", Easy: "var(--neon-cyan, #4dd0e1)", Medium: "#e0c341", Hard: "#e08a41", Deadly: "var(--danger, #c0392b)" };
    result.innerHTML = `
      <div style="border: 1px solid var(--border-line); padding: 14px;">
        <p style="margin:0 0 6px; font-weight:700; font-size:1.1rem; color:${DIFFICULTY_COLORS[data.difficulty] || "var(--ink)"};">${cmEscapeHtml(data.difficulty)}</p>
        <p style="margin:0 0 10px; color: var(--ink-dim); font-size:0.85rem;">${monsterCrs.length} monster${monsterCrs.length === 1 ? "" : "s"}, ${data.totalXp} XP × ${data.multiplier} multiplier = ${data.adjustedXp} adjusted XP</p>
        <div style="display:flex; gap:14px; flex-wrap:wrap; font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-faint);">
          <span>Easy: ${data.thresholds.easy}</span>
          <span>Medium: ${data.thresholds.medium}</span>
          <span>Hard: ${data.thresholds.hard}</span>
          <span>Deadly: ${data.thresholds.deadly}</span>
        </div>
      </div>
    `;
  } catch (err) {
    result.innerHTML = `<p style="color: var(--danger, #c0392b); font-family: var(--font-mono); font-size: 0.8rem;">${cmEscapeHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}
