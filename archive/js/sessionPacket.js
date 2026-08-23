// archive/js/sessionPacket.js
//
// Session Prep Companion, Phase 4 -- Session Packets page. Deliberately
// thin: reuses render.js's already-generic showGenerationOverlay/
// hideGenerationOverlay and showRegeneratePreview(data) (the same
// preview/confirm modal every other category's Regenerate button already
// uses -- it only ever reads data.category/name/entry/oldBodyHtmlPreview/
// newBodyHtmlPreview, all of which /api/generate-session-packet returns
// in exactly that shape) instead of a bespoke UI. This file only owns
// what's actually new: the Quest/Campaign picker and the past-packets list.

async function loadPickers() {
  const select = document.getElementById("sp-target-select");
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
      document.getElementById("sp-no-targets").style.display = "block";
      document.getElementById("sp-generate-btn").disabled = true;
    }
  } catch (err) {
    console.error("Loading Quests/Campaigns failed:", err);
  }
}

async function generateSessionPacket() {
  const select = document.getElementById("sp-target-select");
  const concept = document.getElementById("sp-concept-input").value.trim();
  const status = document.getElementById("sp-generate-status");
  const btn = document.getElementById("sp-generate-btn");
  const [kind, id] = (select.value || "").split(":");
  if (!kind || !id) {
    status.textContent = "Pick a Quest or Campaign first.";
    return;
  }

  btn.disabled = true;
  status.textContent = "";
  showGenerationOverlay();
  try {
    const body = kind === "quest" ? { questId: id, concept: concept || undefined } : { campaignId: id, concept: concept || undefined };
    const res = await authFetch("/api/generate-session-packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
    hideGenerationOverlay();
    showRegeneratePreview(data);
  } catch (err) {
    hideGenerationOverlay();
    status.textContent = "Generation failed: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function regenerateSessionPacket(id, btnEl) {
  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Generating…";
  showGenerationOverlay();
  try {
    const res = await authFetch("/api/generate-session-packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillExistingId: id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
    hideGenerationOverlay();
    btnEl.disabled = false;
    btnEl.textContent = originalText;
    showRegeneratePreview(data);
  } catch (err) {
    hideGenerationOverlay();
    btnEl.disabled = false;
    btnEl.textContent = originalText;
    alert("Regenerate failed: " + err.message);
  }
}

async function loadPastPackets() {
  const host = document.getElementById("sp-list");
  const empty = document.getElementById("sp-list-empty");
  try {
    const res = await authFetch("/api/entries/session-packets");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load Session Packets.");
    const entries = data.entries || [];
    if (!entries.length) {
      empty.style.display = "block";
      host.innerHTML = "";
      return;
    }
    empty.style.display = "none";
    host.innerHTML = entries.map((e) => `
      <div class="entry-card" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <a href="../dossier.html?category=session-packets&id=${escapeHtmlForSearch(e.id)}" style="flex:1; min-width:200px; text-decoration:none; color:inherit;">
          <strong>${escapeHtmlForSearch(e.name)}</strong>
          <div style="color:var(--ink-faint); font-size:0.8rem;">${escapeHtmlForSearch(e.subtitle || "")}</div>
        </a>
        <button type="button" class="regen-btn" data-id="${escapeHtmlForSearch(e.id)}" style="background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Regenerate</button>
      </div>
    `).join("");
    host.querySelectorAll(".regen-btn").forEach((btn) => {
      btn.addEventListener("click", () => regenerateSessionPacket(btn.dataset.id, btn));
    });
  } catch (err) {
    console.error("Loading Session Packets failed:", err);
  }
}

async function initSessionPacketsPage() {
  const session = await requireAuth();
  if (!session) return;
  renderAuthStatus();
  applySpellsNavVisibility();
  applyCategoryConfig();
  applySiteTheme();
  loadPickers();
  loadPastPackets();
  document.getElementById("sp-generate-btn").addEventListener("click", generateSessionPacket);
}
