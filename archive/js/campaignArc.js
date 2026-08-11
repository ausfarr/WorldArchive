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
let caPendingStages = []; // [{id, title, concept}] -- unmatched stages still needing a Quest, persisted server-side
// Monotonic counter for pending-stage ids, not just Date.now()+random --
// caCommitPlan below can mint several ids in one synchronous forEach
// pass, all sharing the same Date.now() millisecond, and a 1-in-1000
// random suffix had a real chance of colliding within a batch, which
// would make caRemovePendingStage/appendQuestToArc's `s.id !== stageId`
// filter remove the wrong stage.
let caStageIdCounter = 0;

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
      caPendingStages = [...(arc.pendingStages || [])];
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
      ${caRenderPendingStagesHtml()}
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
  const linkedHtml = caQuestIds.length
    ? caQuestIds.map((id, i) => {
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
      }).join("")
    : "";
  const emptyNote = (caQuestIds.length === 0 && caPendingStages.length === 0)
    ? `<p style="color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.8rem;">No stages yet -- add existing Quests below, or plan with AI above.</p>`
    : "";
  host.innerHTML = linkedHtml + emptyNote + caRenderPendingStagesHtml();
}

// Shared between view mode and edit mode -- a stage that's still
// waiting on a Quest to be created for it. Persisted server-side (see
// migrations/011_campaign_arc_pending_stages.sql) specifically so this
// list survives navigating away to the Quest builder and back, instead
// of only ever existing in a discarded in-memory preview.
function caRenderPendingStagesHtml() {
  if (!caPendingStages.length) return "";
  return caPendingStages.map((s, i) => {
    const prefill = [s.title, s.concept].filter(Boolean).join(" — ");
    return `
      <div style="border: 1px dashed var(--border-line); padding: 8px 10px; margin-top: 8px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div>
            <strong style="color: var(--ink-faint);">${caEscapeHtml(s.title)}</strong>
            <p style="margin:4px 0 8px; font-size:0.8rem; color: var(--ink-dim);">${caEscapeHtml(s.concept || "")}</p>
          </div>
          <button type="button" onclick="caRemovePendingStage(${i})" class="bm-btn bm-btn-secondary" style="flex-shrink:0;">Remove</button>
        </div>
        <a href="../campaigns/builder.html?arcId=${encodeURIComponent(caEditingId || "")}&stageId=${encodeURIComponent(s.id)}&prefillConcept=${encodeURIComponent(prefill)}" class="bm-btn" style="text-decoration:none; display:inline-block;">Create this Quest →</a>
      </div>
    `;
  }).join("");
}

// Discards a stage the DM doesn't want without creating its Quest --
// persists immediately since pendingStages is server-side state now,
// same reasoning as everything else in this file post-generate.
async function caRemovePendingStage(index) {
  caPendingStages.splice(index, 1);
  caRenderStagesList();
  if (caEditingId) {
    try {
      await authFetch(`/api/campaign-arcs/${encodeURIComponent(caEditingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingStages: caPendingStages })
      });
    } catch (err) {
      console.error("Removing pending stage failed:", err);
    }
  }
}

// ---------- AI planning ----------
//
// Unlike the old design, there is no separate "preview, then Accept"
// step here -- a generated plan commits to the Campaign immediately
// (matched stages into questIds, unmatched stages into pendingStages,
// both persisted server-side in the same save/patch call). This is what
// fixes the real bug this addendum exists for: the old in-memory-only
// preview was wiped the instant a DM navigated to the Quest builder to
// fill an unmatched stage, forcing them to regenerate a whole new plan
// just to see the OTHER stages again. Persisting immediately means
// leaving and coming back always shows the true current state.

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
    await caCommitPlan(data);
    status.textContent = "Plan saved — matched stages are in, unmatched ones are below.";
  } catch (err) {
    status.textContent = "Planning failed: " + err.message;
  } finally {
    hideGenerationOverlay();
    btn.disabled = false;
  }
}

// Folds a freshly-generated plan into the Campaign's real, persisted
// state in one round trip -- creates the Campaign first if this is a
// brand-new one (no id yet). Matched stages merge into questIds
// (deduped); unmatched stages become new pendingStages entries, each
// given a stable client-generated id so a later append-quest call can
// remove exactly the right one.
async function caCommitPlan(proposal) {
  if (!document.getElementById("ca-name").value.trim()) document.getElementById("ca-name").value = proposal.name;
  if (!document.getElementById("ca-summary").value.trim()) document.getElementById("ca-summary").value = proposal.summary;

  proposal.stages.forEach((s) => {
    if (s.matched) {
      if (!caQuestIds.includes(s.questId)) {
        caQuestIds.push(s.questId);
        caQuestDetails[s.questId] = { name: s.questName, summary: s.questSummary, broken: false };
      }
    } else {
      caPendingStages.push({ id: `stage-${Date.now()}-${caStageIdCounter++}`, title: s.title || "Untitled stage", concept: s.concept || "" });
    }
  });

  const name = document.getElementById("ca-name").value.trim();
  const summary = document.getElementById("ca-summary").value.trim();
  const payload = { name, summary, questIds: caQuestIds, pendingStages: caPendingStages };

  try {
    if (caEditingId) {
      await authFetch(`/api/campaign-arcs/${encodeURIComponent(caEditingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      const res = await authFetch("/api/campaign-arcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, createdVia: "ai" })
      });
      const data = await res.json();
      if (res.ok && data.arc) {
        caEditingId = data.arc.id;
        document.getElementById("crumb-name").textContent = data.arc.name;
        document.getElementById("ca-danger-zone").style.display = "block";
        document.getElementById("ca-delete-btn").addEventListener("click", caDeleteArc);
        window.history.replaceState(null, "", `builder.html?id=${encodeURIComponent(caEditingId)}`);
      }
    }
  } catch (err) {
    console.error("Saving generated plan failed:", err);
  }
  caRenderStagesList();
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
