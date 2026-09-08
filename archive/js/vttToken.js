// archive/js/vttToken.js
//
// Client-side "crop this portrait into a VTT token" utility -- pure
// <canvas> work, no server round-trip and no Gemini spend, since the
// whole point is reusing art that's already been generated. Added in
// response to a repeated competitive-watch finding (see
// claude_marketing/ACTION_ITEMS.md/COMPETITOR_WATCH.md, first flagged
// 2026-08-27, reinforced almost every check-in since): CharGen ships a
// free, no-signup "Token Maker" (crop a portrait into a circle/hex/
// shield VTT token in-browser) and Chronicled already generates the raw
// portrait for every NPC/Enemy/Class/Item/Survivor/Location but had no
// way to turn one into a droppable token. This is the smallest
// shippable slice of that idea flagged repeatedly in the daily log:
// browser-side only, zero new AI cost, reuses art the world already
// paid generation points for.
//
// Include on dossier.html AFTER render.js (needs entry.name for the
// download filename) and portraitActions.js is NOT a dependency -- this
// only reads whatever <img class="portrait-img"> or .portrait-slot is
// currently in the DOM, it doesn't know or care how it got there.

const VTT_TOKEN_SIZE = 512; // square working canvas; downloaded PNG matches this
const VTT_TOKEN_BORDER_RATIO = 0.035; // border width as a fraction of VTT_TOKEN_SIZE
const VTT_TOKEN_DEFAULT_COLOR = "#d4af37"; // neutral brass/gold -- works across every world's palette without reading faction-accent-color CSS var indirection

function vttTokenRoundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function vttTokenHexagonPath(ctx, size) {
  const cx = size / 2, cy = size / 2, r = size / 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6; // flat-top hexagon
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Heater-shield silhouette: flat top, curved sides tapering to a point.
function vttTokenShieldPath(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(size * 0.04, size * 0.08);
  ctx.lineTo(size * 0.96, size * 0.08);
  ctx.lineTo(size * 0.96, size * 0.5);
  ctx.bezierCurveTo(size * 0.96, size * 0.78, size * 0.7, size * 0.92, size * 0.5, size * 0.98);
  ctx.bezierCurveTo(size * 0.3, size * 0.92, size * 0.04, size * 0.78, size * 0.04, size * 0.5);
  ctx.closePath();
}

const VTT_TOKEN_SHAPES = {
  circle: {
    label: "Circle",
    clip: (ctx, size) => { ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); }
  },
  square: {
    label: "Rounded Square",
    clip: (ctx, size) => vttTokenRoundedRectPath(ctx, 0, 0, size, size, size * 0.12)
  },
  hex: {
    label: "Hexagon",
    clip: (ctx, size) => vttTokenHexagonPath(ctx, size)
  },
  shield: {
    label: "Shield",
    clip: (ctx, size) => vttTokenShieldPath(ctx, size)
  }
};

// Adds the "Make VTT Token" button next to Download PDF, but only for
// categories that actually render portrait art (npcs/enemies/classes/
// items/survivors/locations) -- factions/logs/etc. never render a
// .portrait-img or .portrait-slot at all, so this is a reliable check
// without hardcoding the category list here too.
function wireVttTokenTool(entry) {
  const zone = document.getElementById("entry-export-zone");
  if (!zone) return;
  if (!document.querySelector(".portrait-img") && !document.querySelector(".portrait-slot")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "make-token-btn";
  btn.textContent = "Make VTT Token";
  btn.style.cssText = "background: var(--bg-panel-raised); color: var(--ink); border: 1px solid var(--border-line); padding: 8px 16px; font-family: var(--font-display); text-transform: uppercase; font-size: 0.78rem; cursor: pointer;";
  btn.addEventListener("click", () => openVttTokenModal(entry));
  zone.appendChild(btn);
}

function openVttTokenModal(entry) {
  const existing = document.getElementById("vtt-token-modal-overlay");
  if (existing) existing.remove();

  const imgEl = document.querySelector(".portrait-img");
  if (!imgEl || !imgEl.naturalWidth) {
    alert("No portrait to crop yet -- generate or upload one first, then come back to make a token.");
    return;
  }

  // Load a fresh Image with crossOrigin set rather than drawing imgEl
  // directly -- the live <img> was never given crossOrigin, so a canvas
  // drawn from it would be tainted (no toBlob/toDataURL) even though
  // the Supabase Storage bucket portraits live in is public and does
  // send permissive CORS headers. If some future portrait host doesn't,
  // redraw()'s try/catch below surfaces that instead of crashing.
  const sourceImg = new Image();
  sourceImg.crossOrigin = "anonymous";
  sourceImg.onload = () => buildVttTokenModal(entry, sourceImg);
  sourceImg.onerror = () => alert("Couldn't reload this portrait for token cropping. Try again in a moment.");
  sourceImg.src = imgEl.src;
}

function drawVttToken(canvas, sourceImg, shapeKey, borderColor) {
  const size = VTT_TOKEN_SIZE;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const shape = VTT_TOKEN_SHAPES[shapeKey] || VTT_TOKEN_SHAPES.circle;

  ctx.save();
  shape.clip(ctx, size);
  ctx.clip();
  // Cover-fit crop: scale so the shorter source dimension fills the
  // square, centering the overflow on the longer axis -- same behavior
  // as the .portrait-img CSS class's object-fit: cover, so the token
  // matches what the dossier page itself already shows as "the
  // portrait."
  const sw = sourceImg.naturalWidth, sh = sourceImg.naturalHeight;
  const scale = Math.max(size / sw, size / sh);
  const dw = sw * scale, dh = sh * scale;
  ctx.drawImage(sourceImg, (size - dw) / 2, (size - dh) / 2, dw, dh);
  ctx.restore();

  const borderWidth = size * VTT_TOKEN_BORDER_RATIO;
  if (borderWidth > 0) {
    ctx.save();
    shape.clip(ctx, size);
    // Stroke centered on the clip path, but the outer half is clipped
    // away by the still-active clip region above -- doubling lineWidth
    // leaves a clean ring flush with the token's edge instead of a
    // half-width line, without needing a second inset path per shape.
    ctx.lineWidth = borderWidth * 2;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
    ctx.restore();
  }
}

function vttTokenSlug(name) {
  const plain = (typeof stripHtml === "function" ? stripHtml(name) : String(name || "")).toLowerCase();
  return plain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "token";
}

function buildVttTokenModal(entry, sourceImg) {
  const overlay = document.createElement("div");
  overlay.id = "vtt-token-modal-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; overflow:auto; padding:40px 20px;";
  overlay.innerHTML = `
    <div style="max-width:480px; margin:0 auto; background:var(--bg-panel); border:1px solid var(--border-line);">
      <div style="padding:20px 28px; border-bottom:1px solid var(--border-line-soft); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <h2 style="font-family:var(--font-display); text-transform:uppercase; margin:0; font-size:1.1rem;">Make VTT Token</h2>
        <button id="vtt-token-close-x" type="button" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:6px 12px; cursor:pointer; font-family:var(--font-mono); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Cancel ✕</button>
      </div>
      <div style="padding:24px 28px; text-align:center;">
        <canvas id="vtt-token-canvas" width="${VTT_TOKEN_SIZE}" height="${VTT_TOKEN_SIZE}" style="width:220px; height:220px; margin-bottom:18px; background: repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 50% / 20px 20px;"></canvas>
        <div id="vtt-token-shapes" style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin-bottom:16px;"></div>
        <label style="display:flex; align-items:center; justify-content:center; gap:10px; font-family:var(--font-mono); font-size:0.75rem; color:var(--ink-dim);">
          Border color
          <input type="color" id="vtt-token-color" value="${VTT_TOKEN_DEFAULT_COLOR}" style="width:36px; height:28px; padding:0; border:1px solid var(--border-line); background:none; cursor:pointer;">
        </label>
      </div>
      <div style="padding:20px 28px; border-top:1px solid var(--border-line-soft); display:flex; gap:12px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
        <p id="vtt-token-error" style="color: var(--danger, #c0392b); font-family: var(--font-mono); font-size: 0.72rem; margin: 0; display:none; flex: 1 0 auto; text-align:left;"></p>
        <button id="vtt-token-cancel" type="button" style="background:var(--bg-panel-raised); border:1px solid var(--border-line); color:var(--ink-dim); padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer;">Cancel</button>
        <a id="vtt-token-download" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer; font-weight:600; text-decoration:none; display:inline-block;">Download Token</a>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const canvas = document.getElementById("vtt-token-canvas");
  const colorInput = document.getElementById("vtt-token-color");
  const downloadLink = document.getElementById("vtt-token-download");
  const shapesHost = document.getElementById("vtt-token-shapes");
  const errorEl = document.getElementById("vtt-token-error");

  let currentShape = "circle";

  Object.keys(VTT_TOKEN_SHAPES).forEach((key) => {
    const shapeBtn = document.createElement("button");
    shapeBtn.type = "button";
    shapeBtn.textContent = VTT_TOKEN_SHAPES[key].label;
    shapeBtn.dataset.shape = key;
    shapeBtn.className = "portrait-action-btn";
    shapeBtn.style.borderColor = key === currentShape ? "var(--neon-primary)" : "";
    shapeBtn.addEventListener("click", () => {
      currentShape = key;
      shapesHost.querySelectorAll("button").forEach((b) => {
        b.style.borderColor = b.dataset.shape === currentShape ? "var(--neon-primary)" : "";
      });
      redraw();
    });
    shapesHost.appendChild(shapeBtn);
  });

  function setError(message) {
    if (message) {
      errorEl.textContent = message;
      errorEl.style.display = "block";
    } else {
      errorEl.style.display = "none";
    }
    downloadLink.style.pointerEvents = message ? "none" : "";
    downloadLink.style.opacity = message ? "0.5" : "";
  }

  function redraw() {
    try {
      drawVttToken(canvas, sourceImg, currentShape, colorInput.value);
      canvas.toBlob((blob) => {
        if (!blob) { setError("Couldn't export this token -- try a different shape or reload the page."); return; }
        if (downloadLink.dataset.blobUrl) URL.revokeObjectURL(downloadLink.dataset.blobUrl);
        const url = URL.createObjectURL(blob);
        downloadLink.dataset.blobUrl = url;
        downloadLink.href = url;
        downloadLink.download = `${vttTokenSlug(entry.name)}-token-${currentShape}.png`;
        setError(null);
      }, "image/png");
    } catch (err) {
      console.error("VTT token render failed:", err);
      setError("Couldn't process this portrait for cropping (likely a cross-origin restriction on the image host). Try right-click → Save Image on the portrait and crop it in an external tool instead.");
    }
  }

  colorInput.addEventListener("input", redraw);
  redraw();

  const close = () => {
    if (downloadLink.dataset.blobUrl) URL.revokeObjectURL(downloadLink.dataset.blobUrl);
    overlay.remove();
  };
  document.getElementById("vtt-token-close-x").onclick = close;
  document.getElementById("vtt-token-cancel").onclick = close;
}
