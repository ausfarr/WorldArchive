// archive/js/campaignArc.js
//
// Campaigns (story arcs) -- see session_addendum_campaign_arcs_shipped.md.
// A Campaign references multiple existing Quests (built via
// archive/js/campaignModule.js) in an ordered list. AI planning is a
// single lightweight call (routes/campaignArc.js's /generate) -- it
// never generates full Quest content itself; an unmatched stage links
// out to the Quest builder (?arcId=&prefillConcept=), which appends the
// newly-created Quest back onto this arc once saved (see
// campaignModule.js's cmArcId handling).
//
// Reuses render.js's authFetch/showGenerationOverlay/hideGenerationOverlay
// globals, same as campaignModule.js.

// ---------- List page (campaign-arcs/index.html) ----------

async function loadAndRenderCampaignArcList() {
  const host = document.getElementById("arc-list");
  const empty = document.getElementById("arc-list-empty");
  if (!host) return;
  try {
    const res = await authFetch("/api/campaign-arcs");
    const data = await res.json();
    const arcs = (data && data.arcs) || [];
    if (arcs.length === 0) {
      empty.style.display = "block";
      return;
    }
    host.innerHTML = arcs.map((a) => `
      <a href="builder.html?id=${encodeURIComponent(a.id)}" class="entry-card" style="text-decoration: none; display: block;">
        <div class="entry-card-body">
          <h3 style="margin: 0 0 4px;">${caEscapeHtml(a.name)}</h3>
          <p style="margin: 0 0 8px; color: var(--ink-dim); font-size: 0.85rem;">${caEscapeHtml(a.summary || "")}</p>
          <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-faint); text-transform: uppercase;">${a.questIds.length} ${a.questIds.length === 1 ? "quest" : "quests"}</div>
        </div>
      </a>
    `).join("");
  } catch (err) {
    console.error("Loading campaigns failed:", err);
    host.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.85rem;">Couldn't load Campaigns: ${caEscapeHtml(err.message)}</p>`;
  }
}

// ---------- Builder page (campaign-arcs/builder.html) ----------

let caEditingId = null;
let caQuestIds = []; // ordered array of Quest ids
let caQuestDetails = {}; // id -> {name, summary, broken}
let caLoadedArc = null;
let caQuestOptionsCache = null;
let caCurrentPreview = null;

async function initCampaignArcBuilder() {
  const params = new URLSearchParams(window.location.search);
  caEditingId = params.get("id");

  await caPopulateAddQuestSelect();
  document.getElementById("ca-add-btn").addEventListener("click", caAddQuestManually);
  document.getElementById("ca-generate-btn").addEventListener("click", caGenerateWithAi);
  document.getElementById("ca-save-btn").addEventListener("click", caSaveArc);
  document.getElementById("ca-cancel-edit-btn").addEventListener("click", () => {
    if (caLoadedArc) {
      caPopulateEditForm(caLoadedArc);
      caExitEditMode();
    }
  });

  if (caEditingId) {
    document.getElementById("ca-danger-zone").style.display = "block";
    document.getElementById("ca-delete-btn").addEventListener("click", caDeleteArc);
    try {
      const res = await authFetch(`/api/campaign-arcs/${encodeURIComponent(caEditingId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load.");
      const arc = data.arc;
      document.getElementById("crumb-name").textContent = arc.name || "Campaign";
      caQuestIds = [...(arc.questIds || [])];
      await caHydrateQuestDetails(caQuestIds);
      caPopulateEditForm(arc);
      caRenderViewMode(arc);
      document.getElementById("ca-edit-mode").style.display = "none";
    } catch (err) {
      document.getElementById("ca-save-status").textContent = "Couldn't load this Campaign: " + err.message;
      document.getElementById("ca-edit-mode").style.display = "block";
    }
  } else {
    document.getElementById("ca-edit-mode").style.display = "block";
    caRenderStagesList();
  }
}

function caPopulateEditForm(arc) {
  document.getElementById("ca-name").value = arc.name || "";
  document.getElementById("ca-summary").value = arc.summary || "";
  caRenderStagesList();
}

async function caHydrateQuestDetails(ids) {
  await Promise.all(ids.map(async (id) => {
    if (caQuestDetails[id]) return;
    try {
      const res = await authFetch(`/api/campaign-modules/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (res.ok && data.module) {
        caQuestDetails[id] = { name: data.module.name, summary: data.module.summary, broken: false };
      } else {
        caQuestDetails[id] = { name: id, summary: "", broken: true };
      }
    } catch (err) {
      caQuestDetails[id] = { name: id, summary: "", broken: true };
    }
  }));
}

function caRenderViewMode(arc) {
  caLoadedArc = arc;
  const host = document.getElementById("ca-view-mode");
  const stagesHtml = caQuestIds.length
    ? caQuestIds.map((id, i) => {
        const q = caQuestDetails[id] || { name: id, summary: "" };
        return `
          <div style="border: 1px solid var(--border-line); padding: 10px 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px;">
            <span class="tag" style="flex-shrink:0;">Stage ${i + 1}</span>
            <div style="flex: 1; min-width: 0;">
              <a href="../campaigns/builder.html?id=${encodeURIComponent(id)}" style="font-weight: 600; color: var(--ink); text-decoration: none;">${caEscapeHtml(q.name)}${q.broken ? " (missing)" : ""}</a>
              <p style="margin: 2px 0 0; font-size: 0.82rem; color: var(--ink-dim);">${caEscapeHtml(q.summary || "")}</p>
            </div>
          </div>
        `;
      }).join("")
    : `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.85rem;">No stages yet.</p>`;

  host.innerHTML = `
    <div class="sheet-header">
      <p class="sheet-eyebrow">Campaign</p>
      <h1 style="font-family: var(--font-display); text-transform: uppercase; margin: 6px 0 10px;">${caEscapeHtml(arc.name)}</h1>
      ${arc.summary ? `<p class="subtitle" style="margin:0 0 12px;">${caEscapeHtml(arc.summary)}</p>` : ""}
    </div>
    <div class="sheet-body">
      <h2>Stages</h2>
      ${stagesHtml}
    </div>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-line-soft);">
      <button type="button" id="ca-edit-btn" class="bm-btn">Edit</button>
    </div>
  `;
  document.getElementById("ca-edit-btn").addEventListener("click", caEnterEditMode);
}

function caEnterEditMode() {
  document.getElementById("ca-view-mode").style.display = "none";
  document.getElementById("ca-edit-mode").style.display = "block";
  document.getElementById("ca-cancel-edit-btn").style.display = "inline-block";
}

function caExitEditMode() {
  document.getElementById("ca-edit-mode").style.display = "none";
  document.getElementById("ca-view-mode").style.display = "block";
}

async function caPopulateAddQuestSelect() {
  const select = document.getElementById("ca-add-quest");
  select.innerHTML = "<option>Loading…</option>";
  try {
    if (!caQuestOptionsCache) {
      const res = await authFetch("/api/campaign-modules");
      const data = await res.json();
      caQuestOptionsCache = (data.modules || []).map((m) => ({ id: m.id, name: m.name, summary: m.summary || "" }));
    }
    select.innerHTML = caQuestOptionsCache.length
      ? caQuestOptionsCache.map((q) => `<option value="${caEscapeHtml(q.id)}">${caEscapeHtml(q.name)}</option>`).join("")
      : `<option value="">No Quests yet -- create one first</option>`;
  } catch (err) {
    select.innerHTML = `<option value="">Couldn't load</option>`;
  }
}

function caAddQuestManually() {
  const select = document.getElementById("ca-add-quest");
  const id = select.value;
  if (!id || caQuestIds.includes(id)) return;
  const opt = (caQuestOptionsCache || []).find((q) => q.id === id);
  caQuestIds.push(id);
  caQuestDetails[id] = { name: opt ? opt.name : id, summary: opt ? opt.summary : "", broken: false };
  caRenderStagesList();
}

function caRemoveQuest(index) {
  caQuestIds.splice(index, 1);
  caRenderStagesList();
}

function caRenderStagesList() {
  const host = document.getElementById("ca-stages-list");
  if (caQuestIds.length === 0) {
    host.innerHTML = `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.8rem;">No stages yet -- add existing Quests below, or plan with AI above.</p>`;
    return;
  }
  host.innerHTML = caQuestIds.map((id, i) => {
    const q = caQuestDetails[id] || { name: id, summary: "" };
    return `
      <div style="border: 1px solid var(--border-line); padding: 10px 12px; display: flex; align-items: center; gap: 10px;">
        <span class="tag" style="flex-shrink:0;">Stage ${i + 1}</span>
        <div style="flex: 1; min-width: 0;">
          <p style="margin:0; font-weight:600; ${q.broken ? "color: var(--danger, #c0392b);" : ""}">${caEscapeHtml(q.name)}${q.broken ? " (missing)" : ""}</p>
          <p style="margin:2px 0 0; font-size:0.78rem; color: var(--ink-dim);">${caEscapeHtml(q.summary || "")}</p>
        </div>
        <button type="button" onclick="caRemoveQuest(${i})" class="bm-btn bm-btn-secondary" style="flex-shrink:0;">Remove</button>
      </div>
    `;
  }).join("");
}

// ---------- AI planning + preview ----------

async function caGenerateWithAi() {
  const btn = document.getElementById("ca-generate-btn");
  const status = document.getElementById("ca-generate-status");
  btn.disabled = true;
  showGenerationOverlay(["Planning the throughline…", "Sequencing stages…", "Checking which Quests already fit…", "Almost there…"]);
  status.textContent = "Planning — this can take a bit…";
  try {
    const concept = document.getElementById("ca-concept").value.trim();
    const stageCount = document.getElementById("ca-stage-count").value;
    const res = await authFetch("/api/campaign-arcs/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concept, stageCount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(formatGenerationError(data, { asHtml: false }));
    // A brand-new (unsaved) Campaign needs a real id before an unmatched
    // stage's "Create this Quest" link can carry ?arcId= back to it --
    // silently save a draft here so that link always works, same spirit
    // as slot-fill generation creating real content before the parent
    // container's own explicit save.
    await caEnsureSaved(data);
    status.textContent = "Plan ready — review below before accepting.";
    caRenderPreview(data);
  } catch (err) {
    status.textContent = "Planning failed: " + err.message;
  } finally {
    hideGenerationOverlay();
    btn.disabled = false;
  }
}

async function caEnsureSaved(proposal) {
  if (caEditingId) return caEditingId;
  try {
    const res = await authFetch("/api/campaign-arcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: proposal.name, summary: proposal.summary, questIds: caQuestIds, createdVia: "ai" })
    });
    const data = await res.json();
    if (res.ok && data.arc) {
      caEditingId = data.arc.id;
      document.getElementById("crumb-name").textContent = data.arc.name;
      document.getElementById("ca-danger-zone").style.display = "block";
      document.getElementById("ca-delete-btn").addEventListener("click", caDeleteArc);
      window.history.replaceState(null, "", `builder.html?id=${encodeURIComponent(caEditingId)}`);
    }
  } catch (err) {
    console.error("Auto-saving campaign draft failed:", err);
  }
  return caEditingId;
}

function caRenderPreview(proposal) {
  caCurrentPreview = proposal;
  const zone = document.getElementById("ca-preview-zone");
  zone.innerHTML = `
    <div style="border: 1px solid var(--border-accent, var(--neon-primary)); padding: 14px; margin: 10px 0;">
      <p style="margin:0 0 4px; font-weight:600;">${caEscapeHtml(proposal.name)}</p>
      <p style="margin:0 0 12px; color: var(--ink-dim); font-size:0.85rem;">${caEscapeHtml(proposal.summary)}</p>
      <div id="ca-preview-stages" style="display:flex; flex-direction:column; gap:8px;"></div>
      <div style="margin-top:12px; display:flex; gap:10px;">
        <button type="button" id="ca-accept-preview-btn" class="bm-btn">Accept matched stages into Campaign</button>
        <button type="button" id="ca-discard-preview-btn" class="bm-btn bm-btn-secondary">Discard</button>
      </div>
    </div>
  `;
  caRenderPreviewStages(proposal.stages);
  document.getElementById("ca-accept-preview-btn").addEventListener("click", () => caAcceptPreview(proposal));
  document.getElementById("ca-discard-preview-btn").addEventListener("click", () => { zone.innerHTML = ""; });
}

function caRenderPreviewStages(stages) {
  const host = document.getElementById("ca-preview-stages");
  host.innerHTML = stages.map((s, i) => {
    if (s.matched) {
      return `
        <div style="border: 1px solid var(--border-line); padding: 8px 10px;">
          <span class="tag">Stage ${i + 1}</span>
          <strong style="margin-left:6px;">${caEscapeHtml(s.questName)}</strong>
          <p style="margin:4px 0 0; font-size:0.8rem; color: var(--ink-dim);">${caEscapeHtml(s.questSummary || "")}</p>
        </div>
      `;
    }
    const prefill = [s.title, s.concept].filter(Boolean).join(" — ");
    return `
      <div style="border: 1px dashed var(--border-line); padding: 8px 10px;">
        <span class="tag">Stage ${i + 1}</span>
        <strong style="margin-left:6px; color: var(--ink-faint);">${caEscapeHtml(s.title)}</strong>
        <p style="margin:4px 0 8px; font-size:0.8rem; color: var(--ink-dim);">${caEscapeHtml(s.concept || "")}</p>
        <a href="../campaigns/builder.html?arcId=${encodeURIComponent(caEditingId || "")}&prefillConcept=${encodeURIComponent(prefill)}" class="bm-btn" style="text-decoration:none; display:inline-block;">Create this Quest →</a>
      </div>
    `;
  }).join("");
}

function caAcceptPreview(proposal) {
  if (!document.getElementById("ca-name").value.trim()) document.getElementById("ca-name").value = proposal.name;
  if (!document.getElementById("ca-summary").value.trim()) document.getElementById("ca-summary").value = proposal.summary;
  proposal.stages.filter((s) => s.matched).forEach((s) => {
    if (!caQuestIds.includes(s.questId)) {
      caQuestIds.push(s.questId);
      caQuestDetails[s.questId] = { name: s.questName, summary: s.questSummary, broken: false };
    }
  });
  caRenderStagesList();
  document.getElementById("ca-preview-zone").innerHTML = "";
}

// ---------- Save / delete ----------

async function caSaveArc() {
  const btn = document.getElementById("ca-save-btn");
  const status = document.getElementById("ca-save-status");
  const name = document.getElementById("ca-name").value.trim();
  if (!name) {
    status.textContent = "Give this Campaign a name first.";
    return;
  }
  btn.disabled = true;
  status.textContent = "Saving…";
  const payload = {
    name,
    summary: document.getElementById("ca-summary").value.trim(),
    questIds: caQuestIds,
    createdVia: caEditingId ? undefined : "manual"
  };
  try {
    const res = caEditingId
      ? await authFetch(`/api/campaign-arcs/${encodeURIComponent(caEditingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      : await authFetch("/api/campaign-arcs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed.");
    status.textContent = "Saved.";
    if (!caEditingId && data.arc) {
      window.location.href = `builder.html?id=${encodeURIComponent(data.arc.id)}`;
    } else if (caEditingId) {
      document.getElementById("crumb-name").textContent = name;
      caRenderViewMode({ id: caEditingId, name, summary: payload.summary });
      caExitEditMode();
    }
  } catch (err) {
    status.textContent = "Save failed: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function caDeleteArc() {
  if (!caEditingId) return;
  const confirmed = window.confirm("Delete this Campaign? This doesn't delete any of the Quests it references, only the Campaign itself.");
  if (!confirmed) return;
  try {
    const res = await authFetch(`/api/campaign-arcs/${encodeURIComponent(caEditingId)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed.");
    window.location.href = "index.html";
  } catch (err) {
    document.getElementById("ca-save-status").textContent = "Delete failed: " + err.message;
  }
}

function caEscapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
