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
  wirePortraitTokenButton(entryId);
}

// ---------- VTT token export ----------
//
// CharGen's "Token Maker" (crop a portrait to a circle/hex/shield VTT
// token, browser-side, no signup) kept coming up in competitor checks
// as a small, low-cost gap: Chronicled already generates the raw
// portrait for 6 categories, it just never turned that into a
// drop-in-a-VTT token. This is the smallest shippable slice of that --
// pure client-side canvas work, no server route, no AI spend, so it
// carries none of the generation-cap/billing complexity a "keep this
// face on regenerate" feature (the harder half of that same competitor
// gap) would.
//
// Called once per dossier render (see render.js#renderDossier) and again
// after a Generate/Upload swaps a fresh <img> in above. Waits for the
// image to actually finish loading before adding the button -- if it's
// a broken/404 portrait, the existing onerror handler already replaces
// the <img> with the pending-generation slot, so there's nothing to
// wire and no orphan button left pointing at a dead image.
function wirePortraitTokenButton(entryId) {
  const img = document.getElementById(`portrait-img-${entryId}`);
  if (!img) return;
  const addIfLoaded = () => {
    if (img.naturalWidth > 0) addTokenDownloadButton(img);
  };
  if (img.complete) {
    addIfLoaded();
  } else {
    img.addEventListener("load", addIfLoaded, { once: true });
  }
}

function addTokenDownloadButton(img) {
  // Re-render (e.g. navigating back to the same dossier via history)
  // can call this twice for the same <img> -- skip if already wired.
  if (img.nextElementSibling && img.nextElementSibling.classList.contains("portrait-token-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "portrait-token-btn";
  btn.textContent = "⬇ Download as VTT Token";
  btn.addEventListener("click", () => downloadPortraitAsToken(img, btn));
  img.insertAdjacentElement("afterend", btn);
}

async function downloadPortraitAsToken(img, btn) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Rendering token…";

  let sourceObjectUrl = null;
  let downloadObjectUrl = null;
  try {
    // Fetch-to-blob instead of drawing the <img> directly: the portrait
    // is served from Supabase's public storage bucket (a different
    // origin), and a canvas fed by a cross-origin <img> without an
    // explicit crossorigin negotiation gets marked "tainted" -- toBlob()
    // would throw a SecurityError even though the bucket is public. A
    // same-origin blob: URL sidesteps that entirely.
    const res = await fetch(img.src);
    if (!res.ok) throw new Error("Could not fetch the portrait image.");
    const sourceBlob = await res.blob();
    sourceObjectUrl = URL.createObjectURL(sourceBlob);
    const bitmap = await loadImageElement(sourceObjectUrl);

    const SIZE = 512; // standard-enough resolution for a VTT token
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    const radius = SIZE / 2;
    const borderWidth = Math.round(SIZE * 0.035);

    // --fac-color is this entry's own faction accent (set on :root by
    // render.js#renderDossier right before this runs) -- using it for
    // the ring means a token exported from this world reads as "from
    // this world" at a glance, same grounding idea the rest of the app
    // leans on, instead of a generic default border color.
    const facColor = getComputedStyle(document.documentElement).getPropertyValue("--fac-color").trim() || "#39ff88";

    ctx.save();
    ctx.beginPath();
    ctx.arc(radius, radius, radius - borderWidth, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    ctx.drawImage(bitmap, (SIZE - drawW) / 2, (SIZE - drawH) / 2, drawW, drawH);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(radius, radius, radius - borderWidth / 2, 0, Math.PI * 2);
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = facColor;
    ctx.stroke();

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) throw new Error("Could not render the token image.");

    downloadObjectUrl = URL.createObjectURL(pngBlob);
    const nameSource = document.getElementById("sheet-title");
    const slug = slugifyForFilename(nameSource ? stripHtml(nameSource.innerHTML) : "token");
    const a = document.createElement("a");
    a.href = downloadObjectUrl;
    a.download = `${slug}-token.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error("VTT token export failed:", err);
    alert(`Couldn't create a VTT token: ${err.message}`);
  } finally {
    if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
    if (downloadObjectUrl) URL.revokeObjectURL(downloadObjectUrl);
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Image failed to load."));
    el.src = src;
  });
}

function slugifyForFilename(name) {
  const slug = (name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "token";
}
