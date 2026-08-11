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
    const res = await authFetch(`/api/entries/${category}/${entryId}/generate-image`, { method: "POST" });
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
}
