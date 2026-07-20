window.ENTRY = {
  "category": "items",
  "id": "scrap-shiv",
  "name": "Scrap Shiv",
  "eyebrow": "Item Sheet — Common Light Weapon",
  "subtitle": "Weapon Skill: Light Weapons — Weapon Type: Shiv",
  "faction": null,
  "tags": [
    "<span class=\"tag\">Common</span>"
  ],
  "bodyHtml": `
<img class="portrait-img" src="images/scrap-shiv.png" alt="Scrap Shiv" onerror="this.outerHTML='&lt;div class=&quot;portrait-slot&quot;&gt;Item render — pending&lt;span class=&quot;sub&quot;&gt;art prompt not yet generated&lt;/span&gt;&lt;/div&gt;'">
<p class="flavor">A length of scavenged sheet metal or a broken box-cutter blade, hilt wrapped in whatever cloth or tape was closest to hand. Nobody's proud of carrying one — it's what you pick up when there's nothing better in reach, and in the Dome, there usually isn't.</p>
<h2>Stats</h2>
<table class="derived-table">
<tr><th>Stat</th><th>Value</th><th>Formula</th></tr>
<tr><td>Damage</td><td>21.2</td><td class="formula">(WEAPON_ROLL × (1 + (RELEVANT_STAT/25))) + (SKILL_LEVEL/2) = (7 × (1 + (15/25))) + (20/2) — WEAPON_ROLL 7, RELEVANT_STAT REFLEX 15, SKILL_LEVEL 20</td></tr>
<tr><td>Applies</td><td>—</td><td class="formula">No inherent status; a clean, unmodified blade</td></tr>
</table>
<p><strong>Rarity Effect:</strong> None — Common rarity carries no bonus effect, base stats only.</p>
<h2>Design Notes</h2>
<p>Baseline starter-tier Light Weapon — the default "found nothing better" option a new Colony recruit or Courier might carry before their first real upgrade. No overlap with any Legendary unique effect on record, and no naming collision with any enemy, NPC, or crafting recipe in the master roster.</p>
`,
  "footer": [
    "Source: item_scrap_shiv.md"
  ]
};
