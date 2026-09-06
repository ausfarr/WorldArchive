// archive/js/portraitActions.js
//
// Handles the "no portrait yet" state on any dossier page. Portrait
// generation is no longer bundled into entry creation (see the same-
// session backend change) -- every portrait-bearing category's <img>
// now has onerror="handlePortraitError(this)" instead of the old
// inline HTML-string placeholder, since building a fallback WITH
// interactive buttons as an escaped string-inside-an-attribute got
// unmanageable fast. This file builds that fallback via normal DOM
// methods instead.
//
// Include this script on any page that can render entry bodyHtml
// (currently just dossier.html) AFTER auth.js, since it uses authFetch().

// Fires when a portrait <img>'s src 404s -- either because no portrait
// was ever generated (imageUrl was null at save time) or the image was
// deleted. Replaces the broken <img> with a "pending" slot offering
// Generate/Upload actions.
function handlePortraitError(imgEl) {
  const category = imgEl.dataset.category;
  const entryId = imgEl.dataset.entryId;
  const label = imgEl.dataset.label || "Portrait";

  const wrap = document.createElement("div");
  wrap.className = "portrait-slot";
  wrap.id = `portrait-slot-${entryId}`;

  const status = document.createElement("span");
  status.className = "sub";
  status.id = `portrait-status-${entryId}`;
  status.textContent = `${label} — pending`;
  wrap.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "portrait-actions";

  const genBtn = document.createElement("button");
  genBtn.type = "button";
  // ai-action (not shared with the Upload button below) is what
  // body.ai-disabled targets in css/style.css to hide AI generation
  // controls when the account has turned AI features off in Settings --
  // Upload has no AI spend and must keep working regardless.
  genBtn.className = "portrait-action-btn ai-action";
  genBtn.textContent = "Generate Image";
  genBtn.addEventListener("click", () => generatePortrait(category, entryId));
  actions.appendChild(genBtn);

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "portrait-action-btn portrait-upload-label";
  uploadLabel.textContent = "Upload Image";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", (e) => uploadPortrait(category, entryId, e.target));
  uploadLabel.appendChild(fileInput);
  actions.appendChild(uploadLabel);

  wrap.appendChild(actions);

  imgEl.replaceWith(wrap);
}

async function generatePortrait(category, entryId) {
  const statusEl = document.getElementById(`portrait-status-${entryId}`);
  const buttons = document.querySelectorAll(`#portrait-slot-${entryId} .portrait-action-btn`);
  buttons.forEach((b) => (b.disabled = true));
  if (statusEl) statusEl.textContent = "Generating image — this can take up to 30 seconds…";

  try {
    // keepLikeness is always false here -- there's no existing portrait
    // yet for this entry (that's why this pending-slot flow is showing at
    // all), so there's nothing to reuse as a reference image. See
    // regenerateExistingPortrait() below for the flow that actually uses it.
    const res = await authFetch(`/api/entries/${category}/${entryId}/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepLikeness: false })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Image generation failed.");
    replacePortraitSlotWithImage(entryId, category, data.imageUrl);
  } catch (err) {
    console.error("Portrait generation failed:", err);
    if (statusEl) statusEl.textContent = `Generation failed: ${err.message}`;
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function uploadPortrait(category, entryId, inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const statusEl = document.getElementById(`portrait-status-${entryId}`);
  const buttons = document.querySelectorAll(`#portrait-slot-${entryId} .portrait-action-btn`);
  buttons.forEach((b) => (b.disabled = true));
  if (statusEl) statusEl.textContent = "Uploading…";

  try {
    const imageBase64 = await readFileAsDataUrl(file);
    const res = await authFetch(`/api/entries/${category}/${entryId}/upload-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Image upload failed.");
    replacePortraitSlotWithImage(entryId, category, data.imageUrl);
  } catch (err) {
    console.error("Portrait upload failed:", err);
    if (statusEl) statusEl.textContent = `Upload failed: ${err.message}`;
    buttons.forEach((b) => (b.disabled = false));
  }
}

// Swaps the pending slot back out for a real <img>, wired the same way
// the server-rendered one is (same data attributes, same onerror), so a
// future 404 (e.g. the portrait gets deleted some other way) falls back
// to this same pending UI again instead of just breaking silently.
function replacePortraitSlotWithImage(entryId, category, imageUrl) {
  const slot = document.getElementById(`portrait-slot-${entryId}`);
  if (!slot) return;
  const img = document.createElement("img");
  img.className = "portrait-img";
  img.id = `portrait-img-${entryId}`;
  img.src = imageUrl;
  img.alt = "";
  img.dataset.category = category;
  img.dataset.entryId = entryId;
  img.setAttribute("onerror", "handlePortraitError(this)");
  slot.replaceWith(img);
  initExistingPortraitControls();
}

// Regenerate hook for a portrait that ALREADY exists -- rendered directly
// by the server (lib/*Template.js's portraitBlock) and never routed
// through handlePortraitError above, so until now there was no UI path to
// a fresh portrait short of deleting the Storage object out from under
// the entry and letting the resulting 404 fall through to the pending-
// slot flow. "Keep likeness" (checked by default -- the common case is
// wanting a tweak, not an unrelated new face) feeds the entry's CURRENT
// portrait back to Gemini as a reference image (see routes/
// generateEntryImage.js's keepLikeness option) so a stat/lore edit or a
// "try a different pose" regenerate doesn't lose the character's
// established look -- see claude_marketing/ACTION_ITEMS.md's 2026-08-31
// entry on CharGen's "Character Reference Workflow" for the competitive
// gap this closes.
function initExistingPortraitControls() {
  document.querySelectorAll("img.portrait-img[data-entry-id]").forEach((img) => {
    if (img.dataset.regenWired) return;
    img.dataset.regenWired = "1";
    const attach = () => attachRegenerateOverlay(img);
    // A portrait <img> already on the page when this script runs may or
    // may not have finished loading yet -- .complete/.naturalWidth catches
    // the already-loaded (or already-broken, handled by onerror separately)
    // case; the load listener catches one still in flight.
    if (img.complete && img.naturalWidth > 0) attach();
    else img.addEventListener("load", attach, { once: true });
  });
}

function attachRegenerateOverlay(img) {
  // handlePortraitError() may have already swapped this exact <img> out
  // for the pending slot by the time the load listener above fires (a
  // portrait can load fine and still 404 a moment later from an unrelated
  // cause) -- nothing to wrap onto a detached element.
  if (!img.isConnected || img.closest(".portrait-wrap")) return;

  const wrap = document.createElement("div");
  wrap.className = "portrait-wrap";
  img.replaceWith(wrap);
  wrap.appendChild(img);

  const overlay = document.createElement("div");
  // ai-action (same class the Generate button above uses) is what
  // body.ai-disabled targets in css/style.css to hide AI controls when
  // the account has AI features turned off in Settings.
  overlay.className = "portrait-regen-overlay ai-action";

  const label = document.createElement("label");
  label.className = "portrait-regen-label";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode("Keep likeness"));

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "portrait-regen-btn";
  btn.textContent = "⟳ Regenerate";
  btn.addEventListener("click", () => regenerateExistingPortrait(img, overlay, btn, checkbox));

  overlay.appendChild(label);
  overlay.appendChild(btn);
  wrap.appendChild(overlay);
}

async function regenerateExistingPortrait(img, overlay, btn, checkbox) {
  const category = img.dataset.category;
  const entryId = img.dataset.entryId;
  const keepLikeness = checkbox.checked;
  btn.disabled = true;
  checkbox.disabled = true;
  overlay.classList.add("is-busy");
  const originalText = btn.textContent;
  btn.textContent = "Generating…";
  btn.title = "";

  try {
    const res = await authFetch(`/api/entries/${category}/${entryId}/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepLikeness })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Image generation failed.");
    // Cache-bust: lib/fileWriter.js's saveImage() upserts the SAME Storage
    // object path every time, so the browser's cached copy of the old
    // image would otherwise stick around under the unchanged URL.
    img.src = `${data.imageUrl}${data.imageUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
  } catch (err) {
    console.error("Portrait regeneration failed:", err);
    btn.title = `Regeneration failed: ${err.message}`;
  } finally {
    btn.disabled = false;
    checkbox.disabled = false;
    overlay.classList.remove("is-busy");
    btn.textContent = originalText;
  }
}

document.addEventListener("DOMContentLoaded", initExistingPortraitControls);
