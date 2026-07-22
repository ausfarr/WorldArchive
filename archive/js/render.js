// The Archive — shared rendering engine
// Works entirely from small .js data files (not fetch/JSON) so the site
// keeps working when opened directly from disk (file://), where fetch()
// of local files is blocked by browser CORS rules.

const FACTION_COLORS = {
  preservation: { name: "Preservation", varName: "--preservation" },
  ferro_kings: { name: "Ferro-Kings", varName: "--ferro-kings" },
  the_board: { name: "The Board", varName: "--the-board" },
  colony: { name: "Colony", varName: "--colony" },
  glitch_kin: { name: "Glitch-Kin", varName: "--glitch-kin" }
};

const CATEGORY_LABELS = {
  factions: "Factions",
  npcs: "NPCs",
  enemies: "Bestiary",
  classes: "Classes",
  items: "Items",
  logs: "Logs",
  survivors: "Survivors"
};

// Categories where a locked/greyed-out placeholder can be filled in by the
// generator, and which API endpoint handles it. Survivors has no locked
// placeholders (the roster only ever grows via fresh generation), so it's
// intentionally absent here.
const FILL_IN_ENDPOINTS = {
  npcs: "/api/generate-npc",
  enemies: "/api/generate-enemy",
  items: "/api/generate-item",
  classes: "/api/generate-class",
  logs: "/api/generate-log",
  factions: "/api/generate-faction"
};

// Categories where an ALREADY-FILLED entry can be regenerated (revised in
// place). Unlike FILL_IN_ENDPOINTS, this includes survivors (no locked
// state, but any existing survivor can still be revised) and factions
// (no locked state either — factions are always "regenerate," never "fill").
const REGENERATE_ENDPOINTS = {
  npcs: "/api/generate-npc",
  enemies: "/api/generate-enemy",
  items: "/api/generate-item",
  classes: "/api/generate-class",
  logs: "/api/generate-log",
  survivors: "/api/generate-survivor",
  factions: "/api/generate-faction"
};

function facColorVar(factionKey) {
  if (factionKey && FACTION_COLORS[factionKey]) return `var(${FACTION_COLORS[factionKey].varName})`;
  return "var(--neon-cyan)";
}

// Called from a locked card's "Fill In" button. POSTs { fillExistingId }
// to the category's generate endpoint and reloads the page on success.
async function fillInEntry(categoryPath, id, btnEl) {
  const endpoint = FILL_IN_ENDPOINTS[categoryPath];
  if (!endpoint) return;
  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Generating…";
  try {
    const res = await authFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillExistingId: id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed");
    btnEl.textContent = "Done!";
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
    alert("Fill-in failed: " + err.message);
  }
}

// Called from an already-filled card's "Regenerate" button. POSTs
// { fillExistingId } to the category's generate endpoint. The backend
// treats any non-locked existing id as a regenerate and returns a preview
// (never writes immediately) — this opens that preview for review rather
// than reloading the page right away.
async function regenerateEntry(categoryPath, id, btnEl) {
  const endpoint = REGENERATE_ENDPOINTS[categoryPath];
  if (!endpoint) return;
  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Generating…";
  try {
    const res = await authFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillExistingId: id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed");
    btnEl.disabled = false;
    btnEl.textContent = originalText;
    if (data.preview) {
      showRegeneratePreview(data);
    } else {
      // Shouldn't normally happen for an already-filled entry, but handle
      // gracefully rather than silently doing nothing.
      window.location.reload();
    }
  } catch (err) {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
    alert("Regenerate failed: " + err.message);
  }
}

// Renders a full-screen overlay comparing the live entry to the freshly
// generated (not-yet-saved) version, with Confirm/Discard actions. Nothing
// is written to disk until "Save This Version" is clicked, which POSTs the
// exact previewed entry to /api/confirm-entry.
function showRegeneratePreview(data) {
  const existing = document.getElementById("regen-preview-overlay");
  if (existing) existing.remove();

  const oldPanel = data.oldBodyHtmlPreview
    ? data.oldBodyHtmlPreview
    : `<p style="color: var(--ink-faint); font-style: italic;">No prior structured content on record for this entry (it predates the regenerate feature) — only the new version is shown below.</p>`;

  const overlay = document.createElement("div");
  overlay.id = "regen-preview-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,11,13,0.92); z-index:1000; overflow:auto; padding:40px 20px;";
  overlay.innerHTML = `
    <div style="max-width:1200px; margin:0 auto; background:var(--bg-panel); border:1px solid var(--border-line);">
      <div style="padding:20px 28px; border-bottom:1px solid var(--border-line-soft); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <h2 style="font-family:var(--font-display); text-transform:uppercase; margin:0; font-size:1.1rem;">Regenerate Preview — ${data.name}</h2>
        <button id="regen-discard-x" type="button" style="background:none; border:1px solid var(--ink-faint); color:var(--ink-dim); padding:6px 12px; cursor:pointer; font-family:var(--font-mono); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Discard ✕</button>
      </div>
      <div style="display:flex; gap:0; flex-wrap:wrap;">
        <div style="flex:1; min-width:320px; padding:24px 28px; border-right:1px solid var(--border-line-soft);">
          <p style="font-family:var(--font-mono); font-size:0.68rem; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 16px;">Current (Live)</p>
          <div>${oldPanel}</div>
        </div>
        <div style="flex:1; min-width:320px; padding:24px 28px;">
          <p style="font-family:var(--font-mono); font-size:0.68rem; color:var(--neon-cyan); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 16px;">New (Preview — not saved yet)</p>
          <div>${data.newBodyHtmlPreview}</div>
        </div>
      </div>
      <div style="padding:20px 28px; border-top:1px solid var(--border-line-soft); display:flex; gap:12px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
        <p id="regen-status" style="font-family:var(--font-mono); font-size:0.72rem; color:var(--ink-faint); margin:0; display:none;"></p>
        <button id="regen-discard" type="button" style="background:var(--bg-panel-raised); border:1px solid var(--border-line); color:var(--ink-dim); padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer;">Discard</button>
        <button id="regen-confirm" type="button" style="background:var(--neon-primary); color:var(--bg-void); border:none; padding:10px 20px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:0.04em; cursor:pointer; font-weight:600;">Save This Version</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("regen-discard").onclick = close;
  document.getElementById("regen-discard-x").onclick = close;
  document.getElementById("regen-confirm").onclick = async () => {
    const confirmBtn = document.getElementById("regen-confirm");
    const status = document.getElementById("regen-status");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Saving…";
    status.style.display = "block";
    status.textContent = "Writing to the archive…";
    try {
      const res = await authFetch("/api/confirm-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: data.category, entry: data.entry })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Save failed");
      status.textContent = "Saved — reloading…";
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Save This Version";
      status.textContent = "Error: " + err.message;
    }
  };
}


// Replaces the old <script src="manifest.js"> + renderCategoryIndex(window.MANIFEST_X, ...)
// pattern -- fetches this world's entries for the category from the API
// (see routes/entries.js) and renders them. Category pages now call this
// directly instead of loading a manifest.js file.
async function loadAndRenderCategoryIndex(categoryPath) {
  const grid = document.getElementById("entry-grid");
  try {
    const res = await authFetch(`/api/entries/${categoryPath}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load entries.");
    renderCategoryIndex(data.entries, categoryPath);
  } catch (err) {
    console.error(`Failed to load ${categoryPath} entries:`, err);
    if (grid) grid.innerHTML = `<p style="color: var(--ink-faint);">Could not load entries: ${err.message}</p>`;
  }
}

function renderCategoryIndex(manifest, categoryPath) {
  const grid = document.getElementById("entry-grid");
  if (!grid) return;
  grid.innerHTML = manifest.map(entry => {
    const facColor = facColorVar(entry.faction);
    const tagsHtml = (entry.tags || []).join("");
    const facTag = entry.faction && FACTION_COLORS[entry.faction]
      ? `<span class="tag fac">${FACTION_COLORS[entry.faction].name}</span>` : "";
    if (entry.locked && categoryPath !== "factions") {
      const canFill = !!FILL_IN_ENDPOINTS[categoryPath];
      const fillBtn = canFill
        ? `<button type="button" class="fill-in-btn" onclick="fillInEntry('${categoryPath}', '${entry.id}', this)" style="margin-top: 10px; background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Fill In</button>`
        : "";
      return `
        <div class="entry-card locked" style="--fac-color: ${facColor};">
          <h3>${entry.name}</h3>
          <p class="role">${entry.subtitle || ""}</p>
          <div class="tags">${facTag}${tagsHtml}</div>
          ${fillBtn}
        </div>`;
    }
    return `
      <div class="entry-card" style="--fac-color: ${facColor}; position: relative;">
        <h3>${entry.name}</h3>
        <p class="role">${entry.subtitle || ""}</p>
        <div class="tags">${facTag}${tagsHtml}</div>
        <a class="card-link" href="../dossier.html?category=${categoryPath}&id=${entry.id}"></a>
        ${REGENERATE_ENDPOINTS[categoryPath] ? `<button type="button" class="regen-btn" onclick="event.stopPropagation(); regenerateEntry('${categoryPath}', '${entry.id}', this)" style="position: relative; z-index: 2; margin-top: 10px; background: var(--bg-panel); border: 1px solid var(--ink-faint); color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 12px; cursor: pointer;">Regenerate</button>` : ""}
      </div>`;
  }).join("");
}

// ---------- Dossier page: render one full entry from its data file ----------
function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return tmp.textContent || tmp.innerText || "";
}

function renderDossier(entry) {
  document.title = `${stripHtml(entry.name)} — The Archive`;
  const facColor = facColorVar(entry.faction);
  document.documentElement.style.setProperty("--fac-color-override", facColor);
  const styleTag = document.createElement("style");
  styleTag.textContent = `:root { --fac-color: ${facColor}; }`;
  document.head.appendChild(styleTag);

  document.getElementById("crumb-category").textContent = CATEGORY_LABELS[entry.category] || entry.category;
  document.getElementById("crumb-category").href = `${entry.category}/index.html`;
  document.getElementById("crumb-name").textContent = entry.name;

  document.getElementById("sheet-eyebrow").textContent = entry.eyebrow || "";
  document.getElementById("sheet-title").innerHTML = entry.name;
  document.getElementById("sheet-subtitle").textContent = entry.subtitle || "";

  const facTag = entry.faction && FACTION_COLORS[entry.faction]
    ? `<span class="tag fac">${FACTION_COLORS[entry.faction].name}</span>` : "";
  const extraTags = (entry.tags || []).join("");
  document.getElementById("sheet-tags").innerHTML = facTag + extraTags;

  document.getElementById("sheet-body").innerHTML = entry.bodyHtml || "";

  const footerEl = document.getElementById("sheet-footer");
  footerEl.innerHTML = (entry.footer || []).map(f => `<span>${f}</span>`).join("");
}

// Resolves ?category=X&id=Y and fetches the matching entry from the API
// (see routes/entries.js), then renders it. Replaces the old
// <script src="{category}/data/{id}.js"> injection pattern.
async function loadAndRenderDossier() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const id = params.get("id");
  if (!category || !id) {
    document.getElementById("sheet-body").innerHTML = "<p>No entry specified.</p>";
    return;
  }
  try {
    const res = await authFetch(`/api/entries/${category}/${id}`);
    if (res.status === 404) {
      document.getElementById("sheet-body").innerHTML = "<p>Entry not found.</p>";
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load entry.");
    renderDossier(data.entry);
  } catch (err) {
    console.error("Failed to load entry:", err);
    document.getElementById("sheet-body").innerHTML = "<p>Entry not found.</p>";
  }
}

// Fetches all 7 categories' entries from the API and renders homepage
// counts. Replaces the old pattern of loading 7 manifest.js files via
// <script> tags and passing window.MANIFEST_X objects directly.
async function loadAndRenderHomepageCounts() {
  const categories = Object.keys(CATEGORY_LABELS);
  try {
    const results = await Promise.all(categories.map(async (cat) => {
      const res = await authFetch(`/api/entries/${cat}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to load ${cat}`);
      return [cat, data.entries || []];
    }));
    renderHomepageCounts(Object.fromEntries(results));
  } catch (err) {
    console.error("Failed to load homepage counts:", err);
  }
}

// Applies category_config_json (Wizard Step 7) to the live nav and
// homepage: relabels categories, hides disabled ones. Every archive page
// gets id="nav-{category}" on its nav link; index.html additionally gets
// id="card-{category}" on its homepage card; category index pages get
// id="page-title" and id="crumb-label" for their own heading/breadcrumb.
async function applyCategoryConfig() {
  try {
    const res = await authFetch("/api/wizard/category-config");
    const { categoryConfig } = await res.json();
    if (!categoryConfig) return;

    Object.entries(categoryConfig).forEach(([key, cfg]) => {
      const navLink = document.getElementById(`nav-${key}`);
      if (navLink) {
        if (cfg.enabled === false) navLink.style.display = "none";
        else if (cfg.label) navLink.textContent = cfg.label;
      }
      const card = document.getElementById(`card-${key}`);
      if (card) {
        if (cfg.enabled === false) {
          card.style.display = "none";
        } else if (cfg.label) {
          const h2 = card.querySelector("h2");
          if (h2) h2.textContent = cfg.label;
        }
      }
      const pageTitle = document.getElementById("page-title");
      const crumbLabel = document.getElementById("crumb-label");
      if (document.body.dataset.category === key && cfg.label) {
        if (pageTitle) pageTitle.textContent = cfg.label;
        if (crumbLabel) crumbLabel.textContent = cfg.label;
        document.title = document.title.replace(/^[^—]+/, `${cfg.label} `);
      }
    });
  } catch (err) {
    console.error("Failed to apply category config:", err);
  }
}

function googleFontLinkTag(fontName) {
  const family = encodeURIComponent(fontName).replace(/%20/g, "+");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap">`;
}

// Applies style_guide_json's literal color/font fields (Wizard Step 6) as
// a runtime CSS override -- injects a <style id="world-theme-override">
// tag with :root custom-property overrides plus font-family rules, and
// loads any needed Google Fonts. Prose fields on the style guide
// (renderingStyle, lighting, textureAndWear, etc.) are for a future
// art-prompt generator, not applied here -- only the literal
// hex-color/font-name fields affect the site itself.
//
// KNOWN SIMPLIFICATION: this runs after the page has already painted with
// the default theme (it's an async fetch gated on auth), so there's a
// brief flash of the default look before the world's theme applies.
// Acceptable for now; revisit if this becomes a real product page rather
// than a dev/admin tool.
async function applySiteTheme() {
  try {
    const res = await authFetch("/api/wizard/style-guide");
    const { styleGuide } = await res.json();
    if (!styleGuide) return;

    const hex = /^#[0-9a-fA-F]{6}$/;
    const overrides = [];
    if (hex.test(styleGuide.backgroundColor)) overrides.push(`--bg-void: ${styleGuide.backgroundColor};`);
    if (hex.test(styleGuide.panelColor)) overrides.push(`--bg-panel: ${styleGuide.panelColor}; --bg-panel-raised: ${styleGuide.panelColor};`);
    if (hex.test(styleGuide.inkColor)) overrides.push(`--ink: ${styleGuide.inkColor};`);
    if (hex.test(styleGuide.primaryColor)) overrides.push(`--neon-primary: ${styleGuide.primaryColor};`);
    if (hex.test(styleGuide.secondaryColor)) overrides.push(`--neon-cyan: ${styleGuide.secondaryColor};`);

    let fontLinks = "";
    let fontCss = "";
    if (styleGuide.fontDisplay) {
      fontLinks += googleFontLinkTag(styleGuide.fontDisplay);
      fontCss += `.flicker-title, .site-title, h1, h2, .sheet-header h1, .category-card h2, .entry-card h3 { font-family: '${styleGuide.fontDisplay}', sans-serif; }\n`;
    }
    if (styleGuide.fontBody) {
      fontLinks += googleFontLinkTag(styleGuide.fontBody);
      fontCss += `body { font-family: '${styleGuide.fontBody}', sans-serif; }\n`;
    }

    if (fontLinks) document.head.insertAdjacentHTML("beforeend", fontLinks);

    if (overrides.length || fontCss) {
      const styleTag = document.createElement("style");
      styleTag.id = "world-theme-override";
      styleTag.textContent = `:root { ${overrides.join(" ")} }\n${fontCss}`;
      document.head.appendChild(styleTag);
    }
  } catch (err) {
    console.error("Failed to apply site theme:", err);
  }
}

// ---------- Homepage: compute archived counts from each manifest ----------
function renderHomepageCounts(manifests) {
  Object.keys(manifests).forEach(category => {
    const list = manifests[category] || [];
    const archived = list.filter(e => !e.locked).length;
    const el = document.getElementById(`count-${category}`);
    if (el) el.textContent = `${archived} / ${list.length} archived`;
  });
}
