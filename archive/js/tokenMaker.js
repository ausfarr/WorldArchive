// archive/js/tokenMaker.js
//
// Client-side "Make VTT Token" tool: crops a generated/uploaded portrait
// into a circle/hex/shield token PNG, entirely in the browser (canvas +
// Image, no server round-trip, no AI spend). This has been sitting as a
// flagged-but-unactioned product idea across several
// claude_marketing/ACTION_ITEMS.md check-ins (CharGen's free "Token
// Maker" -- crop a portrait into a circle/hex/shield VTT token,
// browser-side, no signup) -- Chronicled already generates the raw
// portrait art this needs, the gap was purely presentation.
//
// Scoped to "character" portraits only (NPCs/Enemies/Survivors/Classes),
// not item renders or location art -- gated on data-label rather than a
// hardcoded category list so it stays correct if a new character-bearing
// category is added later (see each lib/*Template.js's portraitBlock,
// all of which set data-label="Character portrait" for the categories a
// VTT token actually makes sense for).
//
// Include this script on any page that renders entry bodyHtml (currently
// just dossier.html), after portraitActions.js -- portraits can appear
// after initial page load (generate/upload swaps portraitActions.js's
// pending slot for a real <img>), so this watches for new portraits
// rather than scanning once on load.

const TOKEN_EXPORT_SIZE = 512; // px square -- common VTT token resolutions (Foundry etc.) top out well under this; gives headroom without ballooning file size
const TOKEN_PREVIEW_SIZE = 320;
const TOKEN_ZOOM_MIN = 100;
const TOKEN_ZOOM_MAX = 300;

function tokenCirclePath(ctx, size) {
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
}

function tokenHexPath(ctx, size) {
  const r = size / 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
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
  hex: { label: "Hex", path: tokenHexPath },
  shield: { label: "Shield", path: tokenShieldPath }
};

let tokenMakerState = null;

function initTokenMakerButtons() {
  document.querySelectorAll('img.portrait-img[data-label="Character portrait"]').forEach(attachTokenMakerButton);
}

function attachTokenMakerButton(img) {
  if (img.dataset.tokenBtnAttached) return;
  img.dataset.tokenBtnAttached = "1";

  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex; justify-content:center; margin:-16px 0 24px;";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "portrait-action-btn";
  btn.textContent = "Make VTT Token";
  btn.addEventListener("click", () => openTokenMaker(img.src, img.alt || "token"));

  wrap.appendChild(btn);
  img.insertAdjacentElement("afterend", wrap);
}

// Portraits swapped in later (generate/upload replaces portraitActions.js's
// pending slot with a real <img>, see replacePortraitSlotWithImage) need
// the same treatment -- a MutationObserver picks those up without this
// file needing to know anything about that flow.
document.addEventListener("DOMContentLoaded", () => {
  initTokenMakerButtons();
  new MutationObserver(initTokenMakerButtons).observe(document.getElementById("sheet-body") || document.body, {
    childList: true,
    subtree: true
  });
});

function openTokenMaker(imageSrc, altName) {
  const existing = document.getElementById("token-maker-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "token-maker-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; overflow:auto; padding:40px 20px;";
  overlay.innerHTML = `
    <div style="max-width:680px; margin:0 auto; background:var(--bg-panel); border:1px solid var(--border-line);">
      <div style="padding:20px 28px; border-bottom:1px solid var(--border-line-soft); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <h2 style="font-family:var(--font-display); text-transform:uppercase; margin:0; font-size:1.1rem;">Make VTT Token</h2>
        <button id="token-maker-close-x" type="button" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:6px 12px; cursor:pointer; font-family:var(--font-mono); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Cancel ✕</button>
      </div>
      <div style="padding:24px 28px; display:flex; gap:28px; flex-wrap:wrap; align-items:flex-start; justify-content:center;">
        <canvas id="token-maker-canvas" width="${TOKEN_PREVIEW_SIZE}" height="${TOKEN_PREVIEW_SIZE}" style="cursor:grab; touch-action:none; background:repeating-conic-gradient(#2a2a2e 0% 25%, #1c1c1f 0% 50%) 50% / 20px 20px;"></canvas>
        <div style="flex:1; min-width:220px; display:flex; flex-direction:column; gap:14px;">
          <div>
            <p style="font-family:var(--font-mono); font-size:0.7rem; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 8px;">Shape</p>
            <div id="token-maker-shapes" style="display:flex; gap:8px; flex-wrap:wrap;">
              ${Object.keys(TOKEN_SHAPES)
                .map(
                  (key) =>
                    `<button type="button" class="portrait-action-btn" data-shape="${key}" style="padding:6px 14px;">${TOKEN_SHAPES[key].label}</button>`
                )
                .join("")}
            </div>
          </div>
          <label style="font-family:var(--font-mono); font-size:0.7rem; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.05em;">
            Zoom
            <input id="token-maker-zoom" type="range" min="${TOKEN_ZOOM_MIN}" max="${TOKEN_ZOOM_MAX}" value="${TOKEN_ZOOM_MIN}" style="display:block; width:100%; margin-top:6px;">
          </label>
          <label style="font-family:var(--font-mono); font-size:0.75rem; color:var(--ink-dim); display:flex; align-items:center; gap:8px;">
            <input id="token-maker-border" type="checkbox" checked> Accent border ring
          </label>
          <p style="font-family:var(--font-mono); font-size:0.7rem; color:var(--ink-faint); margin:0;">Drag the portrait to reposition it in the frame.</p>
        </div>
      </div>
      <div style="padding:20px 28px; border-top:1px solid var(--border-line-soft); display:flex; gap:12px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
        <span id="token-maker-status" style="font-family: var(--font-mono); font-size:0.72rem; color: var(--ink-faint);"></span>
        <button id="token-maker-download" type="button" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer; font-weight:600;">Download Token</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    tokenMakerState = null;
  };
  document.getElementById("token-maker-close-x").onclick = close;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const canvas = document.getElementById("token-maker-canvas");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("token-maker-status");

  const img = new Image();
  // Portraits live in a public Supabase Storage bucket (open CORS) --
  // needed so canvas.toDataURL() below doesn't throw on a tainted canvas.
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const baseScale = Math.max(TOKEN_PREVIEW_SIZE / img.naturalWidth, TOKEN_PREVIEW_SIZE / img.naturalHeight);
    tokenMakerState = {
      img,
      shape: "circle",
      zoomPct: TOKEN_ZOOM_MIN,
      baseScale,
      offsetX: (TOKEN_PREVIEW_SIZE - img.naturalWidth * baseScale) / 2,
      offsetY: (TOKEN_PREVIEW_SIZE - img.naturalHeight * baseScale) / 2,
      border: true
    };
    drawTokenPreview(ctx);
  };
  img.onerror = () => {
    statusEl.textContent = "Couldn't load this image for cropping.";
  };
  img.src = imageSrc;

  const shapeButtons = overlay.querySelectorAll("#token-maker-shapes button");
  shapeButtons.forEach((b, i) => {
    if (i === 0) b.style.borderColor = "var(--neon-primary)";
    b.addEventListener("click", () => {
      shapeButtons.forEach((x) => (x.style.borderColor = "var(--border-line)"));
      b.style.borderColor = "var(--neon-primary)";
      if (tokenMakerState) tokenMakerState.shape = b.dataset.shape;
      drawTokenPreview(ctx);
    });
  });

  document.getElementById("token-maker-zoom").addEventListener("input", (e) => {
    setTokenZoom(Number(e.target.value));
    drawTokenPreview(ctx);
  });

  document.getElementById("token-maker-border").addEventListener("change", (e) => {
    if (tokenMakerState) tokenMakerState.border = e.target.checked;
    drawTokenPreview(ctx);
  });

  wireTokenMakerDrag(canvas, ctx);

  document.getElementById("token-maker-download").addEventListener("click", () => downloadToken(altName, statusEl));
}

// Keeps the frame's center point fixed in image space while zooming, so
// zooming in/out doesn't yank an off-center crop back to centered.
function setTokenZoom(pct) {
  if (!tokenMakerState) return;
  const s = tokenMakerState;
  const oldScale = s.baseScale * (s.zoomPct / 100);
  const newScale = s.baseScale * (pct / 100);
  const center = TOKEN_PREVIEW_SIZE / 2;
  const imgX = (center - s.offsetX) / oldScale;
  const imgY = (center - s.offsetY) / oldScale;
  s.zoomPct = pct;
  s.offsetX = center - imgX * newScale;
  s.offsetY = center - imgY * newScale;
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
    tokenMakerState.offsetX += e.clientX - lastX;
    tokenMakerState.offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    drawTokenPreview(ctx);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((evt) =>
    canvas.addEventListener(evt, () => {
      dragging = false;
      canvas.style.cursor = "grab";
    })
  );
}

function drawTokenPreview(ctx) {
  if (!tokenMakerState) return;
  renderTokenToCanvas(ctx, TOKEN_PREVIEW_SIZE, 1);
}

// scaleRatio lets one draw routine serve both the live preview canvas and
// the larger exported PNG without duplicating the shape/transform math --
// both just pass their own canvas size and a ratio (targetSize /
// TOKEN_PREVIEW_SIZE) so the pan/zoom/shape state lines up between the two.
function renderTokenToCanvas(ctx, canvasSize, scaleRatio) {
  const s = tokenMakerState;
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.save();
  TOKEN_SHAPES[s.shape].path(ctx, canvasSize);
  ctx.clip();
  const scale = s.baseScale * (s.zoomPct / 100) * scaleRatio;
  ctx.drawImage(
    s.img,
    s.offsetX * scaleRatio,
    s.offsetY * scaleRatio,
    s.img.naturalWidth * scale,
    s.img.naturalHeight * scale
  );
  ctx.restore();

  if (s.border) {
    ctx.save();
    TOKEN_SHAPES[s.shape].path(ctx, canvasSize);
    ctx.lineWidth = Math.max(2, canvasSize * 0.035);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--neon-primary").trim() || "#c9a24b";
    ctx.stroke();
    ctx.restore();
  }
}

function downloadToken(altName, statusEl) {
  if (!tokenMakerState) return;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = TOKEN_EXPORT_SIZE;
  exportCanvas.height = TOKEN_EXPORT_SIZE;
  renderTokenToCanvas(exportCanvas.getContext("2d"), TOKEN_EXPORT_SIZE, TOKEN_EXPORT_SIZE / TOKEN_PREVIEW_SIZE);

  let dataUrl;
  try {
    dataUrl = exportCanvas.toDataURL("image/png");
  } catch (err) {
    // A tainted canvas (e.g. a storage CORS misconfiguration) throws a
    // SecurityError here rather than anywhere earlier -- this is the one
    // way this purely-client-side tool can fail, so surface it plainly
    // instead of a silent no-op download.
    console.error("Token export failed:", err);
    if (statusEl) statusEl.textContent = "Couldn't export this image (a browser security restriction blocked it).";
    return;
  }

  const safeName = (altName || "token").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "token";
  const link = document.createElement("a");
  link.download = `${safeName}-token.png`;
  link.href = dataUrl;
  link.click();
  if (statusEl) statusEl.textContent = "Downloaded.";
}
