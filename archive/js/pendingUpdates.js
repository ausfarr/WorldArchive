// archive/js/pendingUpdates.js
//
// Session Prep Companion, Phase 7 -- Suggested Updates page. Lists
// pending_entry_updates rows (surfaced by lib/logDateSuggestions.js and
// lib/sessionChronicleSuggestions.js) and lets the DM act or dismiss.
//
// "Act" on a status_flip suggestion writes immediately (no narrative
// rewrite needed -- routes/pendingUpdates.js patches the field and fires
// a Timeline event). "Act" on a regenerate suggestion does NOT write
// anything itself: it calls the entry's normal regenerate endpoint
// (render.js's existing REGENERATE_ENDPOINTS map) with the suggestion's
// own delta_text as a revisionNote, then opens the exact same
// showRegeneratePreview() modal every other Regenerate uses -- so the DM
// still reviews and explicitly confirms before anything is written,
// same as every other regenerate in the app.

async function loadPendingUpdates() {
  const host = document.getElementById("pu-list");
  const empty = document.getElementById("pu-list-empty");
  try {
    const res = await authFetch("/api/pending-updates?status=pending");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load suggestions.");
    const updates = data.updates || [];
    if (!updates.length) {
      empty.style.display = "block";
      host.innerHTML = "";
      return;
    }
    empty.style.display = "none";
    host.innerHTML = updates.map((u) => `
      <div class="entry-card" data-id="${escapeHtmlForSearch(u.id)}">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <a href="../dossier.html?category=${escapeHtmlForSearch(u.category)}&id=${escapeHtmlForSearch(u.entryId)}"><strong>${escapeHtmlForSearch(u.category)}: ${escapeHtmlForSearch(u.entryId)}</strong></a>
          <span class="tag">${escapeHtmlForSearch(u.suggestionType === "status_flip" ? "Status Flip" : "Regenerate")}</span>
        </div>
        <p style="margin:6px 0;">${escapeHtmlForSearch(u.deltaText)}</p>
        ${u.suggestionType === "status_flip" && u.payload && u.payload.targetStatus ? `<p style="color:var(--ink-faint); font-size:0.8rem; margin:0 0 8px;">New status: ${escapeHtmlForSearch(u.payload.targetStatus)}</p>` : ""}
        <div style="display:flex; gap:10px;">
          <button type="button" class="pu-apply-btn" style="background: var(--neon-primary); color: var(--bg-void); border: none; padding: 8px 16px; font-family: var(--font-display); text-transform: uppercase; font-size: 0.75rem; cursor: pointer; font-weight: 600;">Act</button>
          <button type="button" class="pu-dismiss-btn" style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink-dim); padding: 8px 16px; font-family: var(--font-display); text-transform: uppercase; font-size: 0.75rem; cursor: pointer;">Dismiss</button>
        </div>
      </div>
    `).join("");

    host.querySelectorAll(".pu-apply-btn").forEach((btn) => {
      btn.addEventListener("click", () => applyPendingUpdate(btn.closest(".entry-card").dataset.id, btn));
    });
    host.querySelectorAll(".pu-dismiss-btn").forEach((btn) => {
      btn.addEventListener("click", () => dismissPendingUpdate(btn.closest(".entry-card").dataset.id, btn));
    });
  } catch (err) {
    console.error("Loading pending updates failed:", err);
  }
}

async function dismissPendingUpdate(id, btnEl) {
  btnEl.disabled = true;
  try {
    const res = await authFetch(`/api/pending-updates/${encodeURIComponent(id)}/dismiss`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Dismiss failed.");
    loadPendingUpdates();
  } catch (err) {
    alert("Dismiss failed: " + err.message);
    btnEl.disabled = false;
  }
}

async function applyPendingUpdate(id, btnEl) {
  btnEl.disabled = true;
  const originalText = btnEl.textContent;
  btnEl.textContent = "Working…";
  try {
    const res = await authFetch(`/api/pending-updates/${encodeURIComponent(id)}/apply`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Apply failed.");

    if (data.applied === "status_flip") {
      // Already written server-side (see routes/pendingUpdates.js) -- just refresh.
      loadPendingUpdates();
      return;
    }

    // "regenerate" -- send the DM into the normal regenerate flow,
    // pre-filled with this suggestion's delta_text as the revision
    // instruction. Nothing writes until the DM confirms the preview.
    const endpoint = REGENERATE_ENDPOINTS[data.category];
    if (!endpoint) throw new Error(`No regenerate flow available for category '${data.category}'.`);
    showGenerationOverlay();
    const genRes = await authFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillExistingId: data.entryId, revisionNote: data.deltaText })
    });
    const genData = await genRes.json();
    hideGenerationOverlay();
    if (!genRes.ok) throw new Error(formatGenerationError(genData, { asHtml: false }));
    if (genData.preview) {
      showRegeneratePreview(genData);
    }
    loadPendingUpdates();
  } catch (err) {
    hideGenerationOverlay();
    alert("Act failed: " + err.message);
    btnEl.disabled = false;
    btnEl.textContent = originalText;
  }
}

async function initPendingUpdatesPage() {
  const session = await requireAuth();
  if (!session) return;
  renderAuthStatus();
  applySpellsNavVisibility();
  applyCategoryConfig();
  applySiteTheme();
  loadPendingUpdates();
}
