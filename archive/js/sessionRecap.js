// archive/js/sessionRecap.js
//
// Session Prep Companion, Phase 5 -- Recap page. Picks a Quest/Campaign,
// takes freeform recap notes, generates a Session Chronicle (a Logs
// sub-type -- see routes/generateSessionChronicle.js), and shows a
// preview with an editable world-date control (efWorldDateField/
// readWorldDateField, already defined globally by render.js -- same
// helper every other category's date fields use) before confirming,
// per scope doc Section 4a-i. Doesn't reuse render.js's generic
// showRegeneratePreview() as-is because that modal has no slot for an
// editable field beyond the body diff -- this file's own preview overlay
// is intentionally small and specific to that one difference.
//
// Manual Mode (create/edit without an AI call) and a proper Regenerate
// action (previously entirely missing from this page's UI, though the
// backend route always supported it) added as a follow-up -- see
// showSessionChronicleManualForm / showChronicleRegenerateNotesPrompt
// below.

async function loadRecapPickers() {
  const select = document.getElementById("sr-target-select");
  try {
    const [questsRes, campaignsRes] = await Promise.all([
      authFetch("/api/campaign-modules"),
      authFetch("/api/campaign-arcs")
    ]);
    const questsData = await questsRes.json();
    const campaignsData = await campaignsRes.json();

    const questOptions = (questsData.modules || [])
      .map((m) => `<option value="quest:${m.id}">${escapeHtmlForSearch(m.name)}</option>`)
      .join("");
    const campaignOptions = (campaignsData.arcs || [])
      .map((a) => `<option value="campaign:${a.id}">${escapeHtmlForSearch(a.name)}</option>`)
      .join("");

    select.innerHTML = `
      <option value="">— choose a Quest or Campaign —</option>
      ${questOptions ? `<optgroup label="Quests">${questOptions}</optgroup>` : ""}
      ${campaignOptions ? `<optgroup label="Campaigns">${campaignOptions}</optgroup>` : ""}
    `;
    if (!questOptions && !campaignOptions) {
      document.getElementById("sr-no-targets").style.display = "block";
      document.getElementById("sr-generate-btn").disabled = true;
    }
  } catch (err) {
    console.error("Loading Quests/Campaigns failed:", err);
  }
}

// Shows the Chronicle preview with an editable world-date control. `data`
// is exactly what POST /generate-session-chronicle returns -- same shape
// showRegeneratePreview() reads (category/name/entry/oldBodyHtmlPreview/
// newBodyHtmlPreview), plus calendarConfig for rendering the date field.
function showChroniclePreview(data) {
  const existing = document.getElementById("chronicle-preview-overlay");
  if (existing) existing.remove();

  const oldPanel = data.oldBodyHtmlPreview
    ? data.oldBodyHtmlPreview
    : `<p style="color: var(--ink-faint); font-style: italic;">This is a new Chronicle -- nothing to compare against yet.</p>`;

  const overlay = document.createElement("div");
  overlay.id = "chronicle-preview-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; overflow:auto; padding:40px 20px;";
  overlay.innerHTML = `
    <div style="max-width:1200px; margin:0 auto; background:var(--bg-panel); border:1px solid var(--border-line);">
      <div style="padding:20px 28px; border-bottom:1px solid var(--border-line-soft); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <h2 style="font-family:var(--font-display); text-transform:uppercase; margin:0; font-size:1.1rem;">Chronicle Preview — ${escapeHtmlForSearch(data.name)}</h2>
        <button id="chronicle-discard-x" type="button" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:6px 12px; cursor:pointer; font-family:var(--font-mono); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Discard ✕</button>
      </div>
      <div style="padding:20px 28px; border-bottom:1px solid var(--border-line-soft);">
        <div id="chronicle-date-field"></div>
        <p style="color:var(--ink-faint); font-size:0.78rem; margin:6px 0 0;">Pre-filled with this world's current date -- adjust it forward if the session spanned multiple in-fiction days before confirming.</p>
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
        <p id="chronicle-status" style="font-family:var(--font-mono); font-size:0.72rem; color:var(--ink-faint); margin:0; display:none;"></p>
        <button id="chronicle-discard" type="button" style="background:var(--bg-panel-raised); border:1px solid var(--border-line); color:var(--ink-dim); padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer;">Discard</button>
        <button id="chronicle-confirm" type="button" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer; font-weight:600;">Save This Chronicle</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("chronicle-date-field").innerHTML = efWorldDateField("In-World Date", "cp-worlddate", data.entry.resolvedDate);

  const close = () => overlay.remove();
  document.getElementById("chronicle-discard").onclick = close;
  document.getElementById("chronicle-discard-x").onclick = close;
  document.getElementById("chronicle-confirm").onclick = async () => {
    const confirmBtn = document.getElementById("chronicle-confirm");
    const status = document.getElementById("chronicle-status");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Saving…";
    status.style.display = "block";
    status.textContent = "Writing to the archive…";
    try {
      const worldDate = readWorldDateField("cp-worlddate");
      const entry = {
        ...data.entry,
        resolvedDate: worldDate,
        sessionChronicle: { ...data.entry.sessionChronicle, worldDate }
      };
      const res = await authFetch("/api/confirm-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "logs", entry })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || result.error || "Save failed");
      status.textContent = "Saved — reloading…";
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Save This Chronicle";
      status.textContent = "Error: " + err.message;
    }
  };
}

async function generateSessionChronicle() {
  const select = document.getElementById("sr-target-select");
  const notes = document.getElementById("sr-notes-input").value.trim();
  const status = document.getElementById("sr-generate-status");
  const btn = document.getElementById("sr-generate-btn");
  const [kind, id] = (select.value || "").split(":");
  if (!kind || !id) {
    status.textContent = "Pick a Quest or Campaign first.";
    return;
  }
  if (!notes) {
    status.textContent = "Recap notes are required.";
    return;
  }

  btn.disabled = true;
  status.textContent = "";
  showGenerationOverlay();
  try {
    const body = kind === "quest" ? { questId: id, recapNotes: notes } : { campaignId: id, recapNotes: notes };
    const res = await authFetch("/api/generate-session-chronicle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
    hideGenerationOverlay();
    showChroniclePreview(data);
  } catch (err) {
    hideGenerationOverlay();
    status.textContent = "Generation failed: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function loadPastChronicles() {
  const host = document.getElementById("sr-list");
  const empty = document.getElementById("sr-list-empty");
  try {
    const res = await authFetch("/api/entries/logs");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load Chronicles.");
    // Every Logs entry that carries a sessionChronicle field IS a
    // Chronicle -- entriesRepo.js's rowToManifestEntry spreads
    // entryMeta's own top-level fields onto every manifest row, and
    // lib/fileWriter.js's saveLogEntry now mirrors sessionChronicle
    // there (see this phase's commit), so no separate fetch is needed.
    const chronicles = (data.entries || []).filter((e) => e.sessionChronicle);
    chronicles.sort((a, b) => (b.sessionChronicle.sessionNumber || 0) - (a.sessionChronicle.sessionNumber || 0));
    if (!chronicles.length) {
      empty.style.display = "block";
      host.innerHTML = "";
      return;
    }
    empty.style.display = "none";
    host.innerHTML = chronicles.map((e) => `
      <div class="entry-card" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <a href="../dossier.html?category=logs&id=${escapeHtmlForSearch(e.id)}" style="flex:1; min-width:200px; text-decoration:none; color:inherit;">
          <strong>Session ${e.sessionChronicle.sessionNumber}: ${escapeHtmlForSearch(e.name)}</strong>
          <div style="color:var(--ink-faint); font-size:0.8rem;">${escapeHtmlForSearch(e.subtitle || "")}</div>
        </a>
        <button type="button" class="edit-btn" data-id="${escapeHtmlForSearch(e.id)}" style="background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Edit</button>
        <button type="button" class="regen-btn" data-id="${escapeHtmlForSearch(e.id)}" data-name="${escapeHtmlForSearch(e.name)}" style="background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Regenerate</button>
      </div>
    `).join("");
    host.querySelectorAll(".regen-btn").forEach((btn) => {
      btn.addEventListener("click", () => showChronicleRegenerateNotesPrompt(btn.dataset.id, btn.dataset.name));
    });
    host.querySelectorAll(".edit-btn").forEach((btn) => {
      const e = chronicles.find((entry) => entry.id === btn.dataset.id);
      btn.addEventListener("click", () => showSessionChronicleManualForm(e));
    });
  } catch (err) {
    console.error("Loading Chronicles failed:", err);
  }
}

// ============================================================
// Manual Mode -- "Enter Manually" (create) / "Edit" (an already-
// generated Chronicle), plus a "Regenerate" that was previously missing
// entirely for this category (routes/generateSessionChronicle.js has
// always supported fillExistingId; nothing in this UI called it until
// now). Reuses render.js's generic openEditOverlay/efField/efSelect/
// efWorldDateField the same way showLogEditForm does for a plain Log --
// same Location/Faction picker conventions, plus the two fields a
// Chronicle needs beyond a plain Log: a Quest/Campaign picker (required)
// and its session number (auto-assigned server-side on first save,
// shown read-only here, never DM-editable -- see routes/confirmEntry.js).

function generateManualChronicleId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `manual-chronicle-${stamp}${rand}`;
}

async function showSessionChronicleManualForm(entry) {
  const raw = entry.raw || {};
  const chronicle = raw.sessionChronicle || {};

  const sessionNumberNote = chronicle.sessionNumber
    ? `Session ${chronicle.sessionNumber} -- assigned automatically, can't be changed here.`
    : "Session number is assigned automatically on save.";

  const bodyHtml = `
    <div id="sc-ef-target-wrap"></div>
    <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--ink-faint); margin:0 0 14px;">${escapeHtmlForSearch(sessionNumberNote)}</p>
    ${efField("Name / Title", "sc-ef-name", raw.name)}
    ${efField("Location Context (free text)", "sc-ef-locationContext", raw.locationContext)}
    <div id="sc-ef-locationId-wrap"></div>
    ${efField("Characters", "sc-ef-characters", raw.characters)}
    ${efField("Context", "sc-ef-context", raw.context, { textarea: true, rows: 2 })}
    ${efField("Body Text (the journal entry itself)", "sc-ef-bodyText", raw.bodyText, { textarea: true, rows: 10 })}
    <div id="sc-ef-faction-wrap"></div>
    ${efWorldDateField("In-World Date", "sc-ef-worldDate", chronicle.worldDate || raw.resolvedDate)}
    ${efField("Design Notes (optional)", "sc-ef-designNotes", raw.designNotes, { textarea: true })}
  `;

  const overlay = openEditOverlay(raw.name || "Session Chronicle", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const targetSelect = document.getElementById("sc-ef-target");
    const [kind, targetId] = (targetSelect.value || "").split(":");
    if (!kind || !targetId) throw new Error("Pick a Quest or Campaign first.");
    if (!val("sc-ef-bodyText").trim()) throw new Error("Body text is required.");
    const worldDate = readWorldDateField("sc-ef-worldDate");

    const log = {
      ...raw,
      id: raw.id || entry.id,
      name: val("sc-ef-name") || "Session Chronicle",
      logType: "Journal",
      locationContext: val("sc-ef-locationContext"),
      locationId: val("sc-ef-locationId") || null,
      characters: val("sc-ef-characters"),
      context: val("sc-ef-context"),
      bodyText: val("sc-ef-bodyText"),
      faction: val("sc-ef-faction") || null,
      resolvedDate: worldDate,
      designNotes: val("sc-ef-designNotes"),
      sessionChronicle: {
        questId: kind === "quest" ? targetId : null,
        campaignId: kind === "campaign" ? targetId : null,
        sessionNumber: chronicle.sessionNumber || null,
        worldDate
      }
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "logs", entry: log })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || result.error || "Save failed");
  });

  const [questsRes, campaignsRes] = await Promise.all([
    authFetch("/api/campaign-modules"),
    authFetch("/api/campaign-arcs")
  ]);
  const questsData = await questsRes.json();
  const campaignsData = await campaignsRes.json();
  const currentTarget = chronicle.questId ? `quest:${chronicle.questId}` : (chronicle.campaignId ? `campaign:${chronicle.campaignId}` : "");
  const questOptions = (questsData.modules || [])
    .map((m) => `<option value="quest:${m.id}" ${`quest:${m.id}` === currentTarget ? "selected" : ""}>${escapeHtmlForSearch(m.name)}</option>`)
    .join("");
  const campaignOptions = (campaignsData.arcs || [])
    .map((a) => `<option value="campaign:${a.id}" ${`campaign:${a.id}` === currentTarget ? "selected" : ""}>${escapeHtmlForSearch(a.name)}</option>`)
    .join("");
  document.getElementById("sc-ef-target-wrap").innerHTML = efSelect("Quest or Campaign", "sc-ef-target", `
    <option value="">— choose a Quest or Campaign —</option>
    ${questOptions ? `<optgroup label="Quests">${questOptions}</optgroup>` : ""}
    ${campaignOptions ? `<optgroup label="Campaigns">${campaignOptions}</optgroup>` : ""}
  `);

  fetchCategoryOptions("locations").then((options) => {
    document.getElementById("sc-ef-locationId-wrap").innerHTML = efSelect("Location (archived)", "sc-ef-locationId", idSelectOptionsHtml(options, raw.locationId, "— none / not archived —"));
  });
  getFactionLookup().then((lookup) => {
    const options = Object.keys(lookup).map((key) => ({ id: key, name: lookup[key].name }));
    document.getElementById("sc-ef-faction-wrap").innerHTML = efSelect("Faction", "sc-ef-faction", idSelectOptionsHtml(options, raw.faction, "— none / unaffiliated —"));
  });

  return overlay;
}

function handleManualChronicleCreateClick() {
  showSessionChronicleManualForm({ id: generateManualChronicleId(), raw: null });
}

// A regenerate for a Chronicle needs recap notes the same way a brand-
// new one does (routes/generateSessionChronicle.js requires them even
// on fillExistingId -- the original notes were never stored, only the
// prose they produced). A small bespoke prompt rather than
// openEditOverlay: that helper's save flow assumes success = "written,
// reload the page," but a regenerate's result is a PREVIEW that still
// needs its own confirm step (showChroniclePreview below), not an
// immediate write.
function showChronicleRegenerateNotesPrompt(id, name) {
  const existing = document.getElementById("chronicle-regen-notes-overlay");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "chronicle-regen-notes-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;";
  overlay.innerHTML = `
    <div style="max-width:520px; width:100%; background:var(--bg-panel); border:1px solid var(--border-line); padding:24px 28px;">
      <h3 style="font-family:var(--font-display); text-transform:uppercase; margin:0 0 12px; font-size:1rem;">Regenerate — ${escapeHtmlForSearch(name)}</h3>
      <p style="color:var(--ink-dim); font-size:0.85rem; margin:0 0 14px;">Give the AI updated recap notes -- what changed, what to fix, or just re-describe the session.</p>
      <textarea id="chronicle-regen-notes-input" rows="5" style="width:100%; background:var(--bg-panel-raised); border:1px solid var(--border-line); color:var(--ink); padding:8px 10px; font-family:var(--font-body); resize:vertical;"></textarea>
      <p id="chronicle-regen-notes-status" style="font-family:var(--font-mono); font-size:0.72rem; color:var(--ink-faint); margin:10px 0 0; display:none;"></p>
      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:16px;">
        <button id="chronicle-regen-notes-cancel" type="button" style="background:var(--bg-panel-raised); border:1px solid var(--border-line); color:var(--ink-dim); padding:10px 18px; font-family:var(--font-display); text-transform:uppercase; cursor:pointer;">Cancel</button>
        <button id="chronicle-regen-notes-go" type="button" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 18px; font-family:var(--font-display); text-transform:uppercase; font-weight:600; cursor:pointer;">Regenerate</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById("chronicle-regen-notes-cancel").onclick = close;
  document.getElementById("chronicle-regen-notes-go").onclick = async () => {
    const notes = document.getElementById("chronicle-regen-notes-input").value.trim();
    const status = document.getElementById("chronicle-regen-notes-status");
    if (!notes) {
      status.style.display = "block";
      status.textContent = "Recap notes are required.";
      return;
    }
    const goBtn = document.getElementById("chronicle-regen-notes-go");
    goBtn.disabled = true;
    status.style.display = "block";
    status.textContent = "Generating…";
    showGenerationOverlay();
    try {
      const res = await authFetch("/api/generate-session-chronicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fillExistingId: id, recapNotes: notes })
      });
      const data = await res.json();
      hideGenerationOverlay();
      if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
      close();
      showChroniclePreview(data);
    } catch (err) {
      hideGenerationOverlay();
      goBtn.disabled = false;
      status.textContent = "Error: " + err.message;
    }
  };
}

async function initSessionRecapPage() {
  const session = await requireAuth();
  if (!session) return;
  renderAuthStatus();
  applySpellsNavVisibility();
  applyCategoryConfig();
  applySiteTheme();
  loadRecapPickers();
  loadPastChronicles();
  document.getElementById("sr-generate-btn").addEventListener("click", generateSessionChronicle);
  document.getElementById("sr-manual-btn").addEventListener("click", handleManualChronicleCreateClick);
  // Previously missing on this page entirely -- see the identical note
  // in archive/js/sessionPacket.js's initSessionPacketsPage().
  applyAiEnabledGating();
}
