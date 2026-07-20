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

function facColorVar(factionKey) {
  if (factionKey && FACTION_COLORS[factionKey]) return `var(${FACTION_COLORS[factionKey].varName})`;
  return "var(--neon-cyan)";
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
      return `
        <div class="entry-card locked" style="--fac-color: ${facColor};">
          <h3>${entry.name}</h3>
          <p class="role">${entry.subtitle || ""}</p>
          <div class="tags">${facTag}${tagsHtml}</div>
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
