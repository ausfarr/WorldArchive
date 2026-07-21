const { computeDerivedStats } = require("./statFormulas");

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

const FACTION_CATEGORY_ID = {
  glitch_kin: "glitch-kin",
  preservation: "the-preservation",
  ferro_kings: "the-ferro-kings",
  the_board: "the-board"
};

const FACTION_LABEL = {
  glitch_kin: "Glitch-Kin",
  preservation: "The Preservation",
  ferro_kings: "The Ferro-Kings",
  the_board: "The Board"
};

const TIER_TAG_CLASS = {
  Trash: "tag",
  Elite: "tag tier-elite",
  Boss: "tag tier-boss"
};

function buildEnemyBodyHtml(enemy) {
  const name = escapeHtml(enemy.name);
  const derived = computeDerivedStats(enemy.attributes, enemy.tier);

  const portraitBlock = `<img class="portrait-img" src="images/${enemy.id}.png" alt="${name}" onerror="this.outerHTML='&lt;div class=&quot;portrait-slot&quot;&gt;Character portrait — pending&lt;span class=&quot;sub&quot;&gt;art prompt not yet generated&lt;/span&gt;&lt;/div&gt;'">`;

  const quoteBlock = enemy.signatureQuote
    ? `<div class="quote-block">"${escapeHtml(enemy.signatureQuote)}"</div>\n`
    : "";

  const abilitiesHtml = (enemy.abilities || [])
    .map((a) => `<div class="ability">
<p class="ability-name">${escapeHtml(a.name)} <span class="kind">${escapeHtml(a.kind)}</span></p>
<p class="flavor">${escapeHtml(a.flavor)}</p>
<p><span class="eff-label">Effect:</span> ${escapeHtml(a.effect)}</p>
<p><span class="eff-label">Scaling:</span> ${escapeHtml(a.scaling)}</p>
</div>`)
    .join("\n");

  const phaseChangeBlock = enemy.tier === "Boss" && enemy.phaseChange
    ? `<h2>🔺 Phase Change — Below ${escapeHtml(enemy.phaseChange.hpThreshold)}% HP</h2>
<p>${escapeHtml(enemy.phaseChange.description)}</p>
`
    : "";

  const hexTongueBlock = enemy.faction === "glitch_kin" && enemy.hexTongue
    ? `<h2>Hex-Tongue Intent</h2>
<table class="rel-table">
<tr><th>Translation Tier</th><th>What the Player Sees</th></tr>
<tr><td>Unreadable</td><td>${escapeHtml(enemy.hexTongue.unreadable)}</td></tr>
<tr><td>Keyword</td><td>${escapeHtml(enemy.hexTongue.keyword)}</td></tr>
<tr><td>Phrase</td><td>"${escapeHtml(enemy.hexTongue.phrase)}"</td></tr>
</table>
`
    : "";

  return `
${portraitBlock}
${quoteBlock}<p class="flavor">${escapeHtml(enemy.flavor)}</p>
<h2>Stat Block</h2>
<table class="stat-table">
<tr><th>BODY</th><th>REFLEX</th><th>KNOWLEDGE</th><th>PRESENCE</th><th>SANITY</th><th>FATE</th></tr>
<tr><td>${enemy.attributes.body}</td><td>${enemy.attributes.reflex}</td><td>${enemy.attributes.knowledge}</td><td>${enemy.attributes.presence}</td><td>${enemy.attributes.sanity}</td><td>${enemy.attributes.fate}</td></tr>
</table>
<h2>Derived Stats</h2>
<table class="derived-table">
<tr><th>Stat</th><th>Value</th><th>Formula</th></tr>
<tr><td>Max Health</td><td>${derived.maxHealth}</td><td class="formula">((BODY×2)+(SANITY×2))+BASE</td></tr>
<tr><td>Max Energy</td><td>${derived.maxEnergy}</td><td class="formula">((KNOWLEDGE×2)+(FATE×2))+BASE</td></tr>
<tr><td>Dodge Chance</td><td>${derived.dodgeChance}%</td><td class="formula">BASE+(REFLEX/4)+(ATHLETICS/4)</td></tr>
<tr><td>Crit Chance</td><td>${derived.critChance}%</td><td class="formula">BASE+(FATE/3)+(BIOLOGY/5)</td></tr>
<tr><td>Accuracy</td><td>${derived.accuracy}%</td><td class="formula">BASE+(REFLEX/2)+(WEAPON SKILL/2)</td></tr>
<tr><td>Move Speed</td><td>${derived.moveSpeed}</td><td class="formula">BASE+(REFLEX/5)+(ATHLETICS/10)</td></tr>
</table>
<p class="flavor">BASE = ${derived.base} (provisional). Effective skill inputs (Athletics/Weapon Skill/Biology) approximated at ${derived.effectiveSkill}, per ${enemy.tier}-tier baseline.</p>
<h2>Abilities</h2>
${abilitiesHtml}
${phaseChangeBlock}${hexTongueBlock}<h2>Combat Notes</h2>
<p><strong>Positioning:</strong> ${escapeHtml(enemy.combatNotes.positioning)}</p>
<p><strong>Applies:</strong> ${escapeHtml(enemy.combatNotes.applies)}</p>
<p><strong>Vulnerable to:</strong> ${escapeHtml(enemy.combatNotes.vulnerableTo)}</p>
<p><strong>Drops:</strong> ${escapeHtml(enemy.combatNotes.drops)}</p>
<h2>Design Notes</h2>
<p>${escapeHtml(enemy.designNotes)}</p>
`;
}

function escapeForTemplateLiteral(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildEnemyEntryFileContent(enemy) {
  const bodyHtml = buildEnemyBodyHtml(enemy);
  const safeBodyHtml = escapeForTemplateLiteral(bodyHtml);
  const factionId = FACTION_CATEGORY_ID[enemy.faction];
  const factionLink = `<a href="dossier.html?category=factions&id=${factionId}">${FACTION_LABEL[enemy.faction]}</a>`;

  const entryMeta = {
    category: "enemies",
    id: enemy.id,
    name: enemy.name,
    eyebrow: `Bestiary Entry — ${enemy.tier} Tier`,
    subtitle: enemy.role,
    faction: enemy.faction,
    tier: enemy.tier,
    role: enemy.role,
    tags: [`<span class="${TIER_TAG_CLASS[enemy.tier]}">${enemy.tier}</span>`],
    raw: enemy,
    footer: [
      `Faction: ${factionLink}`,
      `Source: generated via World Forge pipeline`
    ]
  };

  const metaJson = JSON.stringify(entryMeta, null, 2);
  const withBodyHtml = metaJson.replace(
    /\n\}$/,
    `,\n  "bodyHtml": \`${safeBodyHtml}\`\n}`
  );

  return `window.ENTRY = ${withBodyHtml};\n`;
}

function buildEnemyManifestEntry(enemy) {
  return {
    id: enemy.id,
    name: enemy.name,
    subtitle: `${enemy.tier} — ${FACTION_LABEL[enemy.faction]}`,
    tags: [],
    faction: enemy.faction,
    tier: enemy.tier,
    locked: false
  };
}

module.exports = {
  buildEnemyBodyHtml,
  buildEnemyEntryFileContent,
  buildEnemyManifestEntry,
  slugify,
  escapeForTemplateLiteral
};
