function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function abilityRow(a) {
  return `<tr><td>${a.level}</td><td>${escapeHtml(a.name)} <em>(${escapeHtml(a.kind)})</em></td><td>${escapeHtml(a.effectText)}</td></tr>`;
}

function tierTable(tier) {
  return `<table class="rel-table">
<tr><th>Lvl</th><th>Ability</th><th>Effect</th></tr>
${tier.abilities.map(abilityRow).join("\n")}
</table>`;
}

function buildClassBodyHtml(cls) {
  const portraitBlock = `<img class="portrait-img" src="images/${cls.id}.png" alt="${escapeHtml(cls.baseName)}" onerror="this.outerHTML='&lt;div class=&quot;portrait-slot&quot;&gt;Character portrait — pending&lt;span class=&quot;sub&quot;&gt;art prompt not yet generated&lt;/span&gt;&lt;/div&gt;'">`;

  const whyItWorksHtml = cls.whyItWorks
    .map((w) => `<p><strong>${escapeHtml(w.label)}:</strong> ${escapeHtml(w.text)}</p>`)
    .join("\n");

  return `
${portraitBlock}
<div class="quote-block">"${escapeHtml(cls.tagline)}"</div>
<h2>Overview</h2>
<p><strong>Core Resource:</strong> ${escapeHtml(cls.coreResourceName)} — ${escapeHtml(cls.coreResourceDescription)}</p>
<p><strong>Evolution:</strong> At Level 50, becomes <strong>${escapeHtml(cls.evolvedName)}</strong>.</p>
<p><strong>Primary Attribute:</strong> ${escapeHtml(cls.primaryAttribute)}  ·  <strong>Secondary Attribute:</strong> ${escapeHtml(cls.secondaryAttribute)}</p>
<h2>Skill Efficiency</h2>
<table class="rel-table">
<tr><th>Weight</th><th>Skills</th></tr>
<tr><td>Major (1.0x)</td><td>${escapeHtml(cls.skillEfficiency.major)}</td></tr>
<tr><td>Minor (0.5x)</td><td>${escapeHtml(cls.skillEfficiency.minor)}</td></tr>
<tr><td>Misc (0.2x)</td><td>${escapeHtml(cls.skillEfficiency.misc)}</td></tr>
</table>
<h2>Tier 1 — ${escapeHtml(cls.tier1.title)} (Levels 1–20)</h2>
<p class="flavor">${escapeHtml(cls.tier1.theme)}</p>
${tierTable(cls.tier1)}
<h2>Tier 2 — ${escapeHtml(cls.tier2.title)} (Levels 21–49)</h2>
<p class="flavor">${escapeHtml(cls.tier2.theme)}</p>
${tierTable(cls.tier2)}
<h2>⚡ Evolution Event — Level 50</h2>
<table class="rel-table">
<tr><th>Requirement</th><td>${escapeHtml(cls.evolutionEvent.requirement)}</td></tr>
<tr><th>Cost</th><td>${escapeHtml(cls.evolutionEvent.cost)}</td></tr>
<tr><th>Location</th><td>${escapeHtml(cls.evolutionEvent.location)}</td></tr>
<tr><th>Visual Shift</th><td>${escapeHtml(cls.evolutionEvent.visualShift)}</td></tr>
</table>
<p style="text-align:center; font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.05em; color: var(--neon-primary); margin: 16px 0;">Name Change → ${escapeHtml(cls.evolvedName)}</p>
<h2>Tier 3 — ${escapeHtml(cls.tier3.title)} (Levels 50–75)</h2>
<p class="flavor">${escapeHtml(cls.tier3.theme)}</p>
${tierTable(cls.tier3)}
<h2>Tier 4 — ${escapeHtml(cls.tier4.title)} (Levels 76–99)</h2>
<p class="flavor">${escapeHtml(cls.tier4.theme)}</p>
${tierTable(cls.tier4)}
<div class="quote-block">"${escapeHtml(cls.capstoneQuote)}"</div>
<h2>Why This Progression Works</h2>
${whyItWorksHtml}
`;
}

function escapeForTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildClassEntryFileContent(cls) {
  const bodyHtml = buildClassBodyHtml(cls);
  const safeBodyHtml = escapeForTemplateLiteral(bodyHtml);

  const entryMeta = {
    category: "classes",
    id: cls.id,
    name: `${cls.baseName} <span style="color: var(--ink-dim); font-weight: 400;">→ ${cls.evolvedName}</span>`,
    eyebrow: "Class Sheet — Full 1–99 Progression",
    subtitle: cls.archetype,
    faction: null,
    baseName: cls.baseName,
    evolvedName: cls.evolvedName,
    tags: [`<span class="tag">Generated Class</span>`],
    raw: cls,
    footer: [`Source: generated via World Forge pipeline`]
  };

  const metaJson = JSON.stringify(entryMeta, null, 2);
  const withBodyHtml = metaJson.replace(
    /\n\}$/,
    `,\n  "bodyHtml": \`${safeBodyHtml}\`\n}`
  );

  return `window.ENTRY = ${withBodyHtml};\n`;
}

function buildClassManifestEntry(cls) {
  return {
    id: cls.id,
    name: `${cls.baseName} → ${cls.evolvedName}`,
    subtitle: cls.archetype,
    tags: [],
    faction: null,
    locked: false
  };
}

module.exports = {
  buildClassBodyHtml,
  buildClassEntryFileContent,
  buildClassManifestEntry,
  slugify,
  escapeForTemplateLiteral
};
