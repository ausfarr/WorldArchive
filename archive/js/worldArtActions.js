// archive/js/worldArtActions.js
//
// Generate/Upload pending-slot UI for the two Priority 6 World Art
// assets (world mood board, faction banners), added as part of the v0.9
// Manual Wizard Path piece so a world that skipped art at Step 6 isn't
// stuck without it -- both assets become generatable/uploadable later
// from World Info (mood board) and a faction's own dossier page
// (banner), same on-demand pattern archive/js/portraitActions.js
// already established for entry portraits, and reusing its .portrait-*
// CSS classes rather than inventing new ones.
//
// Include on any page that can show a "no art yet" state (currently
// world-info.html for the mood board, dossier.html for faction banners)
// AFTER auth.js, since it uses authFetch().

// ---------- World Mood Board (world-info.html) ----------

// Renders a pending slot with Generate/Upload actions into `host` when
// no mood board exists yet. Called from world-info.html's
// loadWorldMoodBoard() in place of leaving the section hidden.
function renderMoodBoardPendingSlot(host) {
  host.innerHTML = "";
  host.style.display = "block";

  const wrap = document.createElement("div");
  wrap.className = "portrait-slot";
  wrap.id = "mood-board-slot";

  const status = document.createElement("span");
  status.className = "sub";
  status.id = "mood-board-status";
  status.textContent = "World Mood Board — not yet generated";
  wrap.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "portrait-actions";

  const genBtn = document.createElement("button");
  genBtn.type = "button";
  genBtn.className = "portrait-action-btn";
  genBtn.textContent = "Generate Image";
  genBtn.addEventListener("click", generateMoodBoard);
  actions.appendChild(genBtn);

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "portrait-action-btn portrait-upload-label";
  uploadLabel.textContent = "Upload Image";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", (e) => uploadMoodBoard(e.target));
  uploadLabel.appendChild(fileInput);
  actions.appendChild(uploadLabel);

  wrap.appendChild(actions);
  host.appendChild(wrap);
}

async function generateMoodBoard() {
  const statusEl = document.getElementById("mood-board-status");
  const buttons = document.querySelectorAll("#mood-board-slot .portrait-action-btn");
  buttons.forEach((b) => (b.disabled = true));
  if (statusEl) statusEl.textContent = "Generating — this can take up to 30 seconds…";

  try {
    const res = await authFetch("/api/world-art/generate-mood-board", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed.");
    replaceMoodBoardSlotWithImage(data.url);
  } catch (err) {
    console.error("Mood board generation failed:", err);
    if (statusEl) statusEl.textContent = `Generation failed: ${err.message}`;
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function uploadMoodBoard(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const statusEl = document.getElementById("mood-board-status");
  const buttons = document.querySelectorAll("#mood-board-slot .portrait-action-btn");
  buttons.forEach((b) => (b.disabled = true));
  if (statusEl) statusEl.textContent = "Uploading…";

  try {
    const imageBase64 = await readFileAsDataUrl(file);
    const res = await authFetch("/api/world-art/upload-mood-board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    replaceMoodBoardSlotWithImage(data.url);
  } catch (err) {
    console.error("Mood board upload failed:", err);
    if (statusEl) statusEl.textContent = `Upload failed: ${err.message}`;
    buttons.forEach((b) => (b.disabled = false));
  }
}

function replaceMoodBoardSlotWithImage(url) {
  const slot = document.getElementById("mood-board-slot");
  if (!slot) return;
  const img = document.createElement("img");
  img.src = url;
  img.alt = "World mood board";
  img.style.cssText = "width:100%; max-height:340px; object-fit:cover; border:1px solid var(--border-line);";
  slot.replaceWith(img);
}

// ---------- Faction Mood Banner (dossier.html, factions only) ----------

// Renders a pending slot with Generate/Upload actions into `host` when
// this faction has no banner yet. Called from render.js's
// renderFactionBanner() in place of leaving the section empty.
function renderFactionBannerPendingSlot(host, factionId) {
  host.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "portrait-slot";
  wrap.id = "faction-banner-slot";

  const status = document.createElement("span");
  status.className = "sub";
  status.id = "faction-banner-status";
  status.textContent = "Faction Banner — not yet generated";
  wrap.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "portrait-actions";

  const genBtn = document.createElement("button");
  genBtn.type = "button";
  genBtn.className = "portrait-action-btn";
  genBtn.textContent = "Generate Image";
  genBtn.addEventListener("click", () => generateFactionBanner(factionId));
  actions.appendChild(genBtn);

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "portrait-action-btn portrait-upload-label";
  uploadLabel.textContent = "Upload Image";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", (e) => uploadFactionBanner(factionId, e.target));
  uploadLabel.appendChild(fileInput);
  actions.appendChild(uploadLabel);

  wrap.appendChild(actions);
  host.appendChild(wrap);
}

async function generateFactionBanner(factionId) {
  const statusEl = document.getElementById("faction-banner-status");
  const buttons = document.querySelectorAll("#faction-banner-slot .portrait-action-btn");
  buttons.forEach((b) => (b.disabled = true));
  if (statusEl) statusEl.textContent = "Generating — this can take up to 30 seconds…";

  try {
    const res = await authFetch(`/api/world-art/generate-faction-banner/${encodeURIComponent(factionId)}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed.");
    replaceFactionBannerSlotWithImage(data.imageUrl);
  } catch (err) {
    console.error("Faction banner generation failed:", err);
    if (statusEl) statusEl.textContent = `Generation failed: ${err.message}`;
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function uploadFactionBanner(factionId, inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const statusEl = document.getElementById("faction-banner-status");
  const buttons = document.querySelectorAll("#faction-banner-slot .portrait-action-btn");
  buttons.forEach((b) => (b.disabled = true));
  if (statusEl) statusEl.textContent = "Uploading…";

  try {
    const imageBase64 = await readFileAsDataUrl(file);
    const res = await authFetch(`/api/world-art/upload-faction-banner/${encodeURIComponent(factionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    replaceFactionBannerSlotWithImage(data.imageUrl);
  } catch (err) {
    console.error("Faction banner upload failed:", err);
    if (statusEl) statusEl.textContent = `Upload failed: ${err.message}`;
    buttons.forEach((b) => (b.disabled = false));
  }
}

function replaceFactionBannerSlotWithImage(url) {
  const slot = document.getElementById("faction-banner-slot");
  if (!slot) return;
  const img = document.createElement("img");
  img.src = url;
  img.alt = "Faction mood banner";
  img.style.cssText = "width:100%; max-height:280px; object-fit:cover; display:block; border-bottom: 1px solid var(--border-line-soft);";
  slot.replaceWith(img);
}

