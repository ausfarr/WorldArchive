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
    const res = await fetch(endpoint, {
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

// ---------- Category index page: render the grid of entry-cards ----------
function renderCategoryIndex(manifest, categoryPath) {
  const grid = document.getElementById("entry-grid");
  if (!grid) return;
  grid.innerHTML = manifest.map(entry => {
    const facColor = facColorVar(entry.faction);
    const tagsHtml = (entry.tags || []).join("");
    const facTag = entry.faction && FACTION_COLORS[entry.faction]
      ? `<span class="tag fac">${FACTION_COLORS[entry.faction].name}</span>` : "";
    if (entry.locked) {
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
      <div class="entry-card" style="--fac-color: ${facColor};">
        <h3>${entry.name}</h3>
        <p class="role">${entry.subtitle || ""}</p>
        <div class="tags">${facTag}${tagsHtml}</div>
        <a class="card-link" href="../dossier.html?category=${categoryPath}&id=${entry.id}"></a>
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

// Resolves ?category=X&id=Y, injects the matching data/*.js file, then renders.
function loadAndRenderDossier() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const id = params.get("id");
  if (!category || !id) {
    document.getElementById("sheet-body").innerHTML = "<p>No entry specified.</p>";
    return;
  }
  const script = document.createElement("script");
  script.src = `${category}/data/${id}.js`;
  script.onload = () => {
    if (window.ENTRY) renderDossier(window.ENTRY);
  };
  script.onerror = () => {
    document.getElementById("sheet-body").innerHTML = "<p>Entry not found.</p>";
  };
  document.body.appendChild(script);
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
