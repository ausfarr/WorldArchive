// archive/js/tokenMaker.js
//
// Client-side "Make VTT Token" tool: crops an entry's portrait into a
// circle / rounded-square / hex / shield token PNG entirely in the browser
// (canvas, no server route, no AI spend -- it reuses art the world already
// paid generation points for). Closes the competitor gap flagged across
// many claude_marketing/ check-ins: CharGen's free "Token Maker".
//
// This is the one token entry point on the dossier page. It replaces, and
// combines, three independent builds of the same idea:
//   - main's original one-click "Download as VTT Token" button
//     (portraitActions.js, removed): circle only, no framing control. Kept
//     from it: the fetch-to-blob image load (see loadTokenSource), the
//     faction-accent default ring color, and coverage of every category
//     that renders a portrait (items/locations included, not just
//     characters).
//   - claude/hopeful-rubin-fv5rv4: the base -- interactive pan/zoom so a
//     face can actually be framed inside a small token, which cover-fit
//     alone can't do.
//   - claude/hopeful-rubin-w83u0u: the "Rounded Square" shape, a border
//     color picker, and its flush border ring (see renderTokenToCanvas) --
//     fv5rv4's ring was stroked centered on the shape edge, so half of it
//     was cut off by the canvas edge (circle) or bled outside the
//     silhouette (hex/shield).
//
// Wired from render.js#renderDossier and
// portraitActions.js#replacePortraitSlotWithImage (after a Generate/Upload
// swaps a real <img> in) via wireTokenMakerButton(entryId) -- same two call
// sites the old button used.

const TOKEN_EXPORT_SIZE = 512; // px square -- common VTT token sizes top out well under this
const TOKEN_PREVIEW_SIZE = 320;
const TOKEN_ZOOM_MIN = 100; // % of cover-fit scale; below 100 the image couldn't fill the frame
const TOKEN_ZOOM_MAX = 300;
const TOKEN_BORDER_RATIO = 0.035; // ring width as a fraction of the token size

function tokenCirclePath(ctx, size) {
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
}

function tokenRoundedSquarePath(ctx, size) {
  const r = size * 0.12;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
}

function tokenHexPath(ctx, size) {
  const r = size / 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2; // pointy-top
    const x = r + r * Math.cos(angle);
    const y = r + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// A plain heater-shield silhouette (flat top, rounded shoulders, tapering
// to a point) -- close enough to the "shield token" shape other tools in
// this space ship, without needing an SVG asset.
function tokenShieldPath(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(size * 0.04, size * 0.08);
  ctx.lineTo(size * 0.96, size * 0.08);
  ctx.lineTo(size * 0.96, size * 0.48);
  ctx.quadraticCurveTo(size * 0.96, size * 0.74, size * 0.5, size * 0.98);
  ctx.quadraticCurveTo(size * 0.04, size * 0.74, size * 0.04, size * 0.48);
  ctx.closePath();
}

const TOKEN_SHAPES = {
  circle: { label: "Circle", path: tokenCirclePath },
  square: { label: "Rounded Square", path: tokenRoundedSquarePath },
  hex: { label: "Hex", path: tokenHexPath },
  shield: { label: "Shield", path: tokenShieldPath }
};

let tokenMakerState = null;

// Waits for the portrait to actually finish loading before adding the
// button -- a broken/404 portrait is swapped for the pending-generation
// slot by its own onerror handler, so there'd be nothing to crop and the
// button would be left pointing at a dead image.
function wireTokenMakerButton(entryId) {
  const img = document.getElementById(`portrait-img-${entryId}`);
  if (!img) return;
  const addIfLoaded = () => {
    if (img.naturalWidth > 0) addTokenMakerButton(img);
  };
  if (img.complete) addIfLoaded();
  else img.addEventListener("load", addIfLoaded, { once: true });
}

function addTokenMakerButton(img) {
  // portraitActions.js#attachRegenerateOverlay wraps an existing portrait
  // in .portrait-wrap (for its hover "Regenerate" overlay) -- anchor the
  // button below that wrapper, not inside it, whichever of the two runs
  // first. If the wrap happens after this, img.replaceWith(wrap) keeps the
  // wrapper in img's old position, so the button still ends up after it.
  const anchor = img.closest(".portrait-wrap") || img;
  // A re-render (e.g. history navigation back to the same dossier) can
  // call this twice for the same <img> -- skip if already wired.
  if (anchor.nextElementSibling && anchor.nextElementSibling.classList.contains("portrait-token-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "portrait-token-btn";
  btn.textContent = "Make VTT Token";
  btn.addEventListener("click", () => openTokenMaker(img, btn));
  anchor.insertAdjacentElement("afterend", btn);
}

// Fetch-to-blob instead of drawing the page's <img> (or a fresh
// crossOrigin Image) directly: portraits are served from Supabase's
// public storage bucket, a different origin, and a canvas fed straight
// from a cross-origin image is "tainted" unless CORS negotiation lines up
// exactly -- a page <img> loaded without crossorigin can even be reused
// from cache without CORS headers. A same-origin blob: URL can never taint
// the canvas, so toBlob() below can't hit a SecurityError. This is the
// approach main's original token button shipped with; both branch builds
// used crossOrigin="anonymous" instead, which is the less robust of the two.
async function loadTokenSource(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Couldn't fetch the portrait (HTTP ${res.status}).`);
  const objectUrl = URL.createObjectURL(await res.blob());
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("The portrait image couldn't be decoded."));
    el.src = objectUrl;
  });
  return { img, objectUrl };
}

// The entry's own faction accent (set on :root by render.js#renderDossier)
// as the default ring color, so a token exported from this world reads as
// "from this world" -- carried over from main's original button. The
// color input needs a #rrggbb value, so anything else falls back.
function defaultTokenBorderColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--fac-color").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#d4af37";
}

function tokenSlug() {
  const title = document.getElementById("sheet-title");
  const plain = title ? (typeof stripHtml === "function" ? stripHtml(title.innerHTML) : title.textContent) : "";
  return (plain || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "token";
}

async function openTokenMaker(pageImg, btn) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Loading…";
  let source;
  try {
    source = await loadTokenSource(pageImg.src);
  } catch (err) {
    console.error("Token maker: loading the portrait failed:", err);
    alert(`Couldn't open the token maker: ${err.message}`);
    return;
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
  buildTokenMakerOverlay(source);
}

function buildTokenMakerOverlay(source) {
  const existing = document.getElementById("token-maker-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "token-maker-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Make VTT Token");
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; overflow:auto; padding:40px 16px;";
  overlay.innerHTML = `
    <div style="max-width:680px; margin:0 auto; background:var(--bg-panel); border:1px solid var(--border-line);">
      <div style="padding:20px 24px; border-bottom:1px solid var(--border-line-soft); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <h2 style="font-family:var(--font-display); text-transform:uppercase; margin:0; font-size:1.1rem;">Make VTT Token</h2>
        <button id="token-maker-close-x" type="button" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:6px 12px; cursor:pointer; font-family:var(--font-mono); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Cancel ✕</button>
      </div>
      <div style="padding:24px; display:flex; gap:28px; flex-wrap:wrap; align-items:flex-start; justify-content:center;">
        <canvas id="token-maker-canvas" width="${TOKEN_PREVIEW_SIZE}" height="${TOKEN_PREVIEW_SIZE}" style="width:${TOKEN_PREVIEW_SIZE}px; max-width:100%; height:auto; cursor:grab; touch-action:none; background:repeating-conic-gradient(#2a2a2e 0% 25%, #1c1c1f 0% 50%) 50% / 20px 20px;"></canvas>
        <div style="flex:1; min-width:220px; display:flex; flex-direction:column; gap:14px;">
          <div>
            <p style="font-family:var(--font-mono); font-size:0.7rem; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 8px;">Shape</p>
            <div id="token-maker-shapes" style="display:flex; gap:8px; flex-wrap:wrap;">
              ${Object.keys(TOKEN_SHAPES).map((key) => `<button type="button" class="portrait-token-btn" data-shape="${key}" aria-pressed="${key === "circle"}" style="margin:0; width:auto; display:inline-block;">${TOKEN_SHAPES[key].label}</button>`).join("")}
            </div>
          </div>
          <label style="font-family:var(--font-mono); font-size:0.7rem; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.05em;">
            Zoom
            <input id="token-maker-zoom" type="range" min="${TOKEN_ZOOM_MIN}" max="${TOKEN_ZOOM_MAX}" value="${TOKEN_ZOOM_MIN}" style="display:block; width:100%; margin-top:6px;">
          </label>
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-family:var(--font-mono); font-size:0.75rem; color:var(--ink-dim);">
            <label style="display:flex; align-items:center; gap:8px;"><input id="token-maker-border" type="checkbox" checked> Border ring</label>
            <input id="token-maker-color" type="color" value="${defaultTokenBorderColor()}" aria-label="Border color" style="width:36px; height:28px; padding:0; border:1px solid var(--border-line); background:none; cursor:pointer;">
          </div>
          <p style="font-family:var(--font-mono); font-size:0.7rem; color:var(--ink-faint); margin:0;">Drag the portrait to reposition it in the frame.</p>
        </div>
      </div>
      <div style="padding:20px 24px; border-top:1px solid var(--border-line-soft); display:flex; gap:12px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
        <span id="token-maker-status" style="font-family:var(--font-mono); font-size:0.72rem; color:var(--ink-faint); flex:1 0 auto;"></span>
        <button id="token-maker-download" type="button" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer; font-weight:600;">Download Token</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const onKey = (e) => { if (e.key === "Escape") close(); };
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    URL.revokeObjectURL(source.objectUrl);
    tokenMakerState = null;
  };
  document.getElementById("token-maker-close-x").onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);

  const canvas = document.getElementById("token-maker-canvas");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("token-maker-status");
  const img = source.img;

  const baseScale = Math.max(TOKEN_PREVIEW_SIZE / img.naturalWidth, TOKEN_PREVIEW_SIZE / img.naturalHeight);
  tokenMakerState = {
    img,
    shape: "circle",
    zoomPct: TOKEN_ZOOM_MIN,
    baseScale,
    offsetX: (TOKEN_PREVIEW_SIZE - img.naturalWidth * baseScale) / 2,
    offsetY: (TOKEN_PREVIEW_SIZE - img.naturalHeight * baseScale) / 2,
    border: true,
    borderColor: defaultTokenBorderColor()
  };
  drawTokenPreview(ctx);

  const shapeButtons = overlay.querySelectorAll("#token-maker-shapes button");
  const markActive = (active) => shapeButtons.forEach((x) => {
    x.setAttribute("aria-pressed", String(x === active));
    x.style.borderColor = x === active ? "var(--neon-primary)" : "";
    x.style.color = x === active ? "var(--ink)" : "";
  });
  markActive(shapeButtons[0]);
  shapeButtons.forEach((b) => b.addEventListener("click", () => {
    markActive(b);
    tokenMakerState.shape = b.dataset.shape;
    drawTokenPreview(ctx);
  }));

  document.getElementById("token-maker-zoom").addEventListener("input", (e) => {
    setTokenZoom(Number(e.target.value));
    drawTokenPreview(ctx);
  });
  document.getElementById("token-maker-border").addEventListener("change", (e) => {
    tokenMakerState.border = e.target.checked;
    drawTokenPreview(ctx);
  });
  document.getElementById("token-maker-color").addEventListener("input", (e) => {
    tokenMakerState.borderColor = e.target.value;
    drawTokenPreview(ctx);
  });

  wireTokenMakerDrag(canvas, ctx);
  document.getElementById("token-maker-download").addEventListener("click", () => downloadToken(statusEl));
}

// Keeps the image covering the whole frame -- fv5rv4 let a drag pull the
// portrait off one edge, which exports a token with a transparent gap
// inside its shape. Zoom never goes below cover-fit, so there is always a
// valid range.
function clampTokenOffsets() {
  const s = tokenMakerState;
  const scale = s.baseScale * (s.zoomPct / 100);
  const w = s.img.naturalWidth * scale;
  const h = s.img.naturalHeight * scale;
  s.offsetX = Math.min(0, Math.max(TOKEN_PREVIEW_SIZE - w, s.offsetX));
  s.offsetY = Math.min(0, Math.max(TOKEN_PREVIEW_SIZE - h, s.offsetY));
}

// Keeps the frame's center point fixed in image space while zooming, so
// zooming in/out doesn't yank an off-center crop back to centered.
function setTokenZoom(pct) {
  const s = tokenMakerState;
  if (!s) return;
  const oldScale = s.baseScale * (s.zoomPct / 100);
  const newScale = s.baseScale * (pct / 100);
  const center = TOKEN_PREVIEW_SIZE / 2;
  const imgX = (center - s.offsetX) / oldScale;
  const imgY = (center - s.offsetY) / oldScale;
  s.zoomPct = pct;
  s.offsetX = center - imgX * newScale;
  s.offsetY = center - imgY * newScale;
  clampTokenOffsets();
}

function wireTokenMakerDrag(canvas, ctx) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || !tokenMakerState) return;
    // The canvas can be CSS-shrunk on narrow screens (max-width:100%), so
    // convert screen-pixel drag distance into canvas pixels.
    const ratio = TOKEN_PREVIEW_SIZE / canvas.getBoundingClientRect().width;
    tokenMakerState.offsetX += (e.clientX - lastX) * ratio;
    tokenMakerState.offsetY += (e.clientY - lastY) * ratio;
    lastX = e.clientX;
    lastY = e.clientY;
    clampTokenOffsets();
    drawTokenPreview(ctx);
  });
  ["pointerup", "pointercancel"].forEach((evt) => canvas.addEventListener(evt, () => {
    dragging = false;
    canvas.style.cursor = "grab";
  }));
}

function drawTokenPreview(ctx) {
  if (tokenMakerState) renderTokenToCanvas(ctx, TOKEN_PREVIEW_SIZE, 1);
}

// scaleRatio lets one draw routine serve both the live preview and the
// larger exported PNG -- both pass their own canvas size and a ratio
// (targetSize / TOKEN_PREVIEW_SIZE), so pan/zoom/shape line up exactly.
function renderTokenToCanvas(ctx, canvasSize, scaleRatio) {
  const s = tokenMakerState;
  const shape = TOKEN_SHAPES[s.shape] || TOKEN_SHAPES.circle;
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.save();
  shape.path(ctx, canvasSize);
  ctx.clip();
  const scale = s.baseScale * (s.zoomPct / 100) * scaleRatio;
  ctx.drawImage(s.img, s.offsetX * scaleRatio, s.offsetY * scaleRatio, s.img.naturalWidth * scale, s.img.naturalHeight * scale);

  // Ring flush with the token's edge: stroke centered on the same path
  // while the clip is still active, at double width -- the outer half is
  // clipped away, leaving a full-width ring entirely inside the shape
  // (w83u0u's approach; works for every shape without an inset path).
  if (s.border) {
    shape.path(ctx, canvasSize);
    ctx.lineWidth = canvasSize * TOKEN_BORDER_RATIO * 2;
    ctx.strokeStyle = s.borderColor;
    ctx.stroke();
  }
  ctx.restore();
}

function downloadToken(statusEl) {
  if (!tokenMakerState) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = TOKEN_EXPORT_SIZE;
  exportCanvas.height = TOKEN_EXPORT_SIZE;
  renderTokenToCanvas(exportCanvas.getContext("2d"), TOKEN_EXPORT_SIZE, TOKEN_EXPORT_SIZE / TOKEN_PREVIEW_SIZE);

  const fail = (err) => {
    // The blob: source means the canvas shouldn't ever be tainted, but
    // toBlob() is still the one place a browser security restriction
    // would surface -- say so plainly instead of a silent no-op download.
    console.error("Token export failed:", err);
    statusEl.textContent = "Couldn't export this image (the browser blocked it).";
  };
  try {
    exportCanvas.toBlob((blob) => {
      if (!blob) return fail(new Error("toBlob returned null"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tokenSlug()}-token.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      statusEl.textContent = "Downloaded.";
    }, "image/png");
  } catch (err) {
    fail(err);
  }
}
