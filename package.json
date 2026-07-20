const NAV_LINKS = [
  ["factions", "Factions"],
  ["npcs", "NPCs"],
  ["enemies", "Bestiary"],
  ["classes", "Classes"],
  ["items", "Items"],
  ["logs", "Logs"],
  ["survivors", "Survivors"]
];

const CATEGORY_META = {
  factions: { label: "Factions", manifestVar: "MANIFEST_FACTIONS", dek: "The four powers of the Dome, plus what lives in the gaps between them." },
  npcs: { label: "NPCs", manifestVar: "MANIFEST_NPCS", dek: "Faction leaders, rivals, quest-givers, informants — named and accounted for." },
  enemies: { label: "Bestiary", manifestVar: "MANIFEST_ENEMIES", dek: "Trash, Elite, and Boss-tier threats. Stat blocks, ability kits, combat notes." },
  classes: { label: "Classes", manifestVar: "MANIFEST_CLASSES", dek: "Professions turned combat. Full 1–99 progression trees and Level 50 evolutions." },
  items: { label: "Items", manifestVar: "MANIFEST_ITEMS", dek: "Found gear, crafted recipes, consumables, and relics." },
  logs: { label: "Logs", manifestVar: "MANIFEST_LOGS", dek: "Data drives, terminal records, and intercepted Hex-Tongue traffic." },
  survivors: { label: "Survivors", manifestVar: "MANIFEST_SURVIVORS", dek: "Colony roster — recruits, quirks, and short backstories." }
};

// v1 scope: generators live on NPCs and Bestiary pages only.
const GENERATOR_PANELS = {
  npcs: `
<div class="sheet" style="margin: 0 0 40px; padding: 24px 32px;">
  <p class="sheet-eyebrow" style="margin: 0 0 8px;">Generate New Entry</p>
  <form id="gen-form" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
    <div style="flex: 1; min-width: 160px;">
      <label for="gen-name" style="display:block; font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-faint); margin-bottom: 4px;">NAME (optional)</label>
      <input id="gen-name" type="text" placeholder="leave blank to generate" style="width: 100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
    </div>
    <div style="flex: 1; min-width: 160px;">
      <label for="gen-field-2" style="display:block; font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-faint); margin-bottom: 4px;">ROLE</label>
      <select id="gen-field-2" style="width: 100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px;">
        <option value="">Let it choose</option>
        <option>Faction Leader</option>
        <option>Quest-Giver</option>
        <option>Colony VIP</option>
        <option>Rival</option>
        <option>Informant/Fixer</option>
        <option>Merchant</option>
      </select>
    </div>
    <div style="flex: 1; min-width: 160px;">
      <label for="gen-field-3" style="display:block; font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-faint); margin-bottom: 4px;">FACTION</label>
      <select id="gen-field-3" style="width: 100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px;">
        <option value="">Let it choose</option>
        <option value="preservation">The Preservation</option>
        <option value="ferro_kings">The Ferro-Kings</option>
        <option value="the_board">The Board</option>
        <option value="glitch_kin">Glitch-Kin</option>
        <option value="unaligned">Unaligned</option>
      </select>
    </div>
    <button type="submit" id="gen-submit" style="background: var(--neon-primary); color: var(--bg-void); border: none; padding: 10px 20px; font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; font-weight: 600;">Generate NPC</button>
  </form>
  <p id="gen-status" style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-faint); margin: 12px 0 0; display: none;"></p>
</div>
<script>
document.getElementById('gen-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('gen-submit');
  const status = document.getElementById('gen-status');
  btn.disabled = true; btn.textContent = 'Generating…';
  status.style.display = 'block'; status.textContent = 'Calling the generator — this can take a bit for content + art…';
  try {
    const res = await fetch('/api/generate-npc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('gen-name').value,
        role: document.getElementById('gen-field-2').value,
        faction: document.getElementById('gen-field-3').value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');
    status.textContent = \`Generated: \${data.name} (\${data.roleArchetype} — \${data.faction})\`;
    setTimeout(() => window.location.reload(), 1200);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Generate NPC';
  }
});
</script>
`,
  enemies: `
<div class="sheet" style="margin: 0 0 40px; padding: 24px 32px;">
  <p class="sheet-eyebrow" style="margin: 0 0 8px;">Generate New Entry</p>
  <form id="gen-form" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
    <div style="flex: 1; min-width: 160px;">
      <label for="gen-name" style="display:block; font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-faint); margin-bottom: 4px;">NAME (optional)</label>
      <input id="gen-name" type="text" placeholder="leave blank to generate" style="width: 100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body);">
    </div>
    <div style="flex: 1; min-width: 160px;">
      <label for="gen-field-2" style="display:block; font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-faint); margin-bottom: 4px;">TIER</label>
      <select id="gen-field-2" style="width: 100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px;">
        <option value="">Let it choose</option>
        <option>Trash</option>
        <option>Elite</option>
        <option>Boss</option>
      </select>
    </div>
    <div style="flex: 1; min-width: 160px;">
      <label for="gen-field-3" style="display:block; font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-faint); margin-bottom: 4px;">FACTION</label>
      <select id="gen-field-3" style="width: 100%; background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px;">
        <option value="">Let it choose</option>
        <option value="glitch_kin">Glitch-Kin</option>
        <option value="preservation">The Preservation</option>
        <option value="ferro_kings">The Ferro-Kings</option>
        <option value="the_board">The Board</option>
      </select>
    </div>
    <button type="submit" id="gen-submit" style="background: var(--neon-primary); color: var(--bg-void); border: none; padding: 10px 20px; font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; font-weight: 600;">Generate Enemy</button>
  </form>
  <p id="gen-status" style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-faint); margin: 12px 0 0; display: none;"></p>
</div>
<script>
document.getElementById('gen-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('gen-submit');
  const status = document.getElementById('gen-status');
  btn.disabled = true; btn.textContent = 'Generating…';
  status.style.display = 'block'; status.textContent = 'Calling the generator — this can take a bit for content + art…';
  try {
    const res = await fetch('/api/generate-enemy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('gen-name').value,
        tier: document.getElementById('gen-field-2').value,
        faction: document.getElementById('gen-field-3').value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');
    status.textContent = \`Generated: \${data.name} (\${data.tier} — \${data.faction})\${data.attributeBudgetWarning ? ' — note: ' + data.attributeBudgetWarning : ''}\`;
    setTimeout(() => window.location.reload(), 1200);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Generate Enemy';
  }
});
</script>
`
};

function categoryPageHtml(categoryKey) {
  const meta = CATEGORY_META[categoryKey];
  const navHtml = NAV_LINKS.map(([key, label]) =>
    `<a href="../${key}/index.html">${label}</a>`
  ).join("\n      ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${meta.label} — The Archive</title>
<link rel="stylesheet" href="../css/style.css">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <div class="site-title"><a href="../index.html">The <span class="accent">Archive</span></a></div>
    <nav class="site-nav">
      ${navHtml}
    </nav>
  </div>
</header>

<div class="wrap">
  <div class="crumb"><a href="../index.html">Archive</a><span class="sep">/</span><span>${meta.label}</span></div>
  <h1 style="font-family: var(--font-display); text-transform: uppercase; margin: 20px 0 8px;">${meta.label}</h1>
  <p style="color: var(--ink-dim); max-width: 640px; margin: 0 0 24px;">${meta.dek}</p>

  ${GENERATOR_PANELS[categoryKey] || ""}

  <div class="entry-grid" id="entry-grid"></div>
</div>

<footer class="site-footer">
  <div class="wrap">ECHOES OF THE NEON — INTERNAL ARCHIVE BUILD</div>
</footer>

<script src="manifest.js"></script>
<script src="../js/render.js"></script>
<script>
  renderCategoryIndex(window.${meta.manifestVar}, "${categoryKey}");
</script>

</body>
</html>
`;
}

module.exports = { categoryPageHtml, CATEGORY_META };
