// archive/js/sessionPacket.js
//
// Session Prep Companion, Phase 4 -- Session Packets page. Deliberately
// thin: reuses render.js's already-generic showGenerationOverlay/
// hideGenerationOverlay and showRegeneratePreview(data) (the same
// preview/confirm modal every other category's Regenerate button already
// uses -- it only ever reads data.category/name/entry/oldBodyHtmlPreview/
// newBodyHtmlPreview, all of which /api/generate-session-packet returns
// in exactly that shape) instead of a bespoke UI. This file only owns
// what's actually new: the Quest/Campaign picker and the past-packets
// list. Manual Mode (create/edit without an AI call) added as a
// follow-up -- see showSessionPacketManualForm below, reusing render.js's
// generic openEditOverlay the same way every other category's Manual
// Mode does.

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
        <button type="button" class="edit-btn" data-id="${escapeHtmlForSearch(e.id)}" style="background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Edit</button>
        <button type="button" class="regen-btn" data-id="${escapeHtmlForSearch(e.id)}" style="background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Regenerate</button>
      </div>
    `).join("");
    host.querySelectorAll(".regen-btn").forEach((btn) => {
      btn.addEventListener("click", () => regenerateSessionPacket(btn.dataset.id, btn));
    });
    host.querySelectorAll(".edit-btn").forEach((btn) => {
      const e = entries.find((entry) => entry.id === btn.dataset.id);
      btn.addEventListener("click", () => showSessionPacketManualForm(e));
    });
  } catch (err) {
    console.error("Loading Session Packets failed:", err);
  }
}

// ============================================================
// Manual Mode -- "Enter Manually" (create) / "Edit" (an already-
// generated packet) for Session Packets. Same underlying mechanism as
// every other category's Manual Mode (archive/js/render.js's
// openEditOverlay + efField/efSelect): one bespoke form serves both a
// blank create and an edit of an existing entry, saving through the
// same /api/confirm-entry write path AI-generated entries already use.
//
// Scene Beats / Complications Deck are entered as simple
// "Title | Description" lines (one per textarea line) rather than a
// dynamic repeatable-row UI -- keeps this v1 simple without building
// add/remove-row JS from scratch; each line becomes one structured
// object on save.
//
// NPC Voice Reminders is deliberately NOT offered in this form: it
// links to a real NPC id (lib/sessionPacketTemplate.js's entryLink()
// silently drops the name entirely if entryId is empty), and this
// app's "reference real ids, never invent" discipline means that needs
// a real roster picker, not a free-typed name -- out of scope for this
// pass. A manually-created packet can always have voice reminders added
// later via Regenerate. Existing voice reminders (when editing an
// AI-generated packet) are preserved as-is, just not editable here.

function generateManualPacketId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `manual-packet-${stamp}${rand}`;
}

function parsePipeLines(text) {
  return (text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const idx = line.indexOf("|");
    if (idx === -1) return { title: line, description: "" };
    return { title: line.slice(0, idx).trim(), description: line.slice(idx + 1).trim() };
  });
}

function parseLines(text) {
  return (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

async function showSessionPacketManualForm(entry) {
  const raw = entry.raw || {};
  const beatsText = (raw.sceneBeats || []).map((b) => `${b.title || ""} | ${b.description || ""}`).join("\n");
  const complicationsText = (raw.complicationsDeck || []).map((c) => `${c.title || ""} | ${c.description || ""}`).join("\n");
  const threadsText = (raw.openThreads || []).join("\n");

  const bodyHtml = `
    <div id="sp-ef-target-wrap"></div>
    ${efField("Title", "sp-ef-title", raw.title)}
    ${efField("Opening Read-Aloud", "sp-ef-openingReadAloud", raw.openingReadAloud, { textarea: true, rows: 3 })}
    ${efField('Scene Beats -- one per line, "Title | Description"', "sp-ef-sceneBeats", beatsText, { textarea: true, rows: 6 })}
    ${efField('Complications Deck (optional) -- one per line, "Title | Description"', "sp-ef-complicationsDeck", complicationsText, { textarea: true, rows: 3 })}
    ${efField("Open Threads (optional) -- one per line", "sp-ef-openThreads", threadsText, { textarea: true, rows: 3 })}
  `;

  const overlay = openEditOverlay(raw.title || "Session Packet", bodyHtml, async () => {
    const val = (id) => document.getElementById(id).value;
    const targetSelect = document.getElementById("sp-ef-target");
    const [kind, targetId] = (targetSelect.value || "").split(":");
    if (!kind || !targetId) throw new Error("Pick a Quest or Campaign first.");
    const targetName = targetSelect.options[targetSelect.selectedIndex].textContent;

    const packet = {
      ...raw,
      id: raw.id || entry.id,
      title: val("sp-ef-title") || "Session Packet",
      openingReadAloud: val("sp-ef-openingReadAloud"),
      sceneBeats: parsePipeLines(val("sp-ef-sceneBeats")).map((b) => ({ title: b.title, description: b.description, taggedEntries: [] })),
      npcVoiceReminders: raw.npcVoiceReminders || [],
      complicationsDeck: parsePipeLines(val("sp-ef-complicationsDeck")),
      openThreads: parseLines(val("sp-ef-openThreads")),
      questId: kind === "quest" ? targetId : null,
      campaignId: kind === "campaign" ? targetId : null,
      questName: kind === "quest" ? targetName : null,
      campaignName: kind === "campaign" ? targetName : null,
      dungeonMaps: raw.dungeonMaps || [],
      generatedAt: raw.generatedAt || Date.now()
    };

    const res = await authFetch("/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "session-packets", entry: packet })
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
  const currentTarget = raw.questId ? `quest:${raw.questId}` : (raw.campaignId ? `campaign:${raw.campaignId}` : "");
  const questOptions = (questsData.modules || [])
    .map((m) => `<option value="quest:${m.id}" ${`quest:${m.id}` === currentTarget ? "selected" : ""}>${escapeHtmlForSearch(m.name)}</option>`)
    .join("");
  const campaignOptions = (campaignsData.arcs || [])
    .map((a) => `<option value="campaign:${a.id}" ${`campaign:${a.id}` === currentTarget ? "selected" : ""}>${escapeHtmlForSearch(a.name)}</option>`)
    .join("");
  document.getElementById("sp-ef-target-wrap").innerHTML = efSelect("Quest or Campaign", "sp-ef-target", `
    <option value="">— choose a Quest or Campaign —</option>
    ${questOptions ? `<optgroup label="Quests">${questOptions}</optgroup>` : ""}
    ${campaignOptions ? `<optgroup label="Campaigns">${campaignOptions}</optgroup>` : ""}
  `);

  return overlay;
}

function handleManualPacketCreateClick() {
  showSessionPacketManualForm({ id: generateManualPacketId(), raw: null });
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
  document.getElementById("sp-manual-btn").addEventListener("click", handleManualPacketCreateClick);
  // Previously missing on this page entirely -- every one of the 8 base
  // category pages calls this from their own init flow to hide AI-spend
  // controls (.ai-generate-entry-btn/.regen-btn/.field-assist-btn, see
  // css/style.css's body.ai-disabled rule) when the account has AI
  // features turned off; requireAiEnabled already blocks the request
  // server-side either way, but the button was never actually hidden
  // client-side on this page.
  applyAiEnabledGating();
}
