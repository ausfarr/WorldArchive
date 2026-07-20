window.ENTRY = {
  "category": "enemies",
  "id": "the-press-ganger",
  "name": "The Press-Ganger",
  "eyebrow": "Bestiary Entry — Elite Tier",
  "subtitle": "Squad Buffer / Frontline Tank",
  "faction": "ferro_kings",
  "tags": [
    "<span class=\"tag tier-elite\">Elite</span>"
  ],
  "bodyHtml": `
<img class="portrait-img" src="images/the-press-ganger.png" alt="The Press-Ganger" onerror="this.outerHTML='&lt;div class=&quot;portrait-slot&quot;&gt;Character portrait — pending&lt;span class=&quot;sub&quot;&gt;art prompt not yet generated&lt;/span&gt;&lt;/div&gt;'">
<div class="quote-block">"You're on my line now. Line doesn't fall behind."</div>
<p class="flavor">A chain-link flail looped twice around one fist, foreman's vest re-plated with scavenged sheet steel over the heart. He doesn't fight to win a duel — he fights to hold a line and drag everyone else's performance up to meet his. <a href="dossier.html?category=npcs&id=adaeze-okonkwo">Adaeze Okonkwo</a> pulled him off the factory floor and promoted him herself after the collapse, and he still runs a fight the way she runs a shift: quotas, not glory.</p>
<h2>Stat Block</h2>
<table class="stat-table">
<tr><th>BODY</th><th>REFLEX</th><th>KNOWLEDGE</th><th>PRESENCE</th><th>SANITY</th><th>FATE</th></tr>
<tr><td>16</td><td>9</td><td>6</td><td>12</td><td>8</td><td>6</td></tr>
</table>
<h2>Derived Stats</h2>
<table class="derived-table">
<tr><th>Stat</th><th>Value</th><th>Formula</th></tr>
<tr><td>Max Health</td><td>58</td><td class="formula">((BODY×2)+(SANITY×2))+BASE = (32+16)+10</td></tr>
<tr><td>Max Energy</td><td>34</td><td class="formula">((KNOWLEDGE×2)+(FATE×2))+BASE = (12+12)+10</td></tr>
<tr><td>Dodge Chance</td><td>20.5%</td><td class="formula">BASE+(REFLEX/4)+(ATHLETICS/4) = 10+2.25+8.25</td></tr>
<tr><td>Crit Chance</td><td>18.6%</td><td class="formula">BASE+(FATE/3)+(BIOLOGY/5) = 10+2+6.6</td></tr>
<tr><td>Accuracy</td><td>31%</td><td class="formula">BASE+(REFLEX/2)+(WEAPON SKILL/2) = 10+4.5+16.5</td></tr>
<tr><td>Move Speed</td><td>15.1</td><td class="formula">BASE+(REFLEX/5)+(ATHLETICS/10) = 10+1.8+3.3</td></tr>
</table>
<p class="flavor">BASE = 10 (provisional). Effective skill inputs (Athletics/Weapon Skill/Biology) approximated at 33, per Elite-tier baseline (~60% of the 57-point attribute budget). BODY-heavy, PRESENCE-secondary split — a tank whose real value is what he does for the squad around him, not raw personal damage.</p>
<h2>Abilities</h2>
<div class="ability">
<p class="ability-name">Mark for the Line <span class="kind">Active</span></p>
<p class="flavor">A grease-pencil "X" slapped on a shoulder plate, or just a shout with a name attached. Either way, everyone on the floor knows who's getting the next hit.</p>
<p><span class="eff-label">Effect:</span> Marks one enemy target. Marked targets take bonus damage from all Ferro-Kings allies for 2 turns.</p>
<p><span class="eff-label">Scaling:</span> Bonus damage % = BASE(10%) + (PRESENCE/10) ≈ 11.2%.</p>
</div>
<div class="ability">
<p class="ability-name">Rally the Floor <span class="kind">Active</span></p>
<p class="flavor">"Pick it up!" isn't a suggestion when he says it. Nearby crew square their shoulders and swing harder, whether or not they meant to.</p>
<p><span class="eff-label">Effect:</span> All nearby Ferro-Kings allies gain +Damage for 2 turns.</p>
<p><span class="eff-label">Scaling:</span> Buff % = BASE(10%) + (PRESENCE/10) ≈ 11.2%.</p>
</div>
<div class="ability">
<p class="ability-name">Shop-Floor Bulwark <span class="kind">Passive</span></p>
<p class="flavor">He plants his feet the way he was trained to stand under a failing gantry — and doesn't move until the job's done.</p>
<p><span class="eff-label">Effect:</span> Reduces incoming damage to the Press-Ganger by a flat 10% while any other Ferro-Kings ally is present in the encounter (there's always someone else's line to hold).</p>
<p><span class="eff-label">Scaling:</span> N/A — flat reduction, contingent on ally presence.</p>
</div>
<h2>Combat Notes</h2>
<p><strong>Positioning:</strong> Front Row — melee tank, holds the line rather than chasing targets.</p>
<p><strong>Applies:</strong> Mark (bonus-damage debuff via Mark for the Line).</p>
<p><strong>Vulnerable to:</strong> Blind (Mark for the Line requires a direct line of sight to tag a target).</p>
<p><strong>Drops:</strong> Scrap, occasional Neon Vial, rare Data Drive (shift-log filler).</p>
<h2>Design Notes</h2>
<p>Referenced by Adaeze Okonkwo (former shift supervisor who promoted him) and the <a href="dossier.html?category=enemies&id=middle-manager">Middle Manager's</a> design notes (explicit contrast: physical squad-buffing tank vs. pure back-row support). Distinct from Middle Manager (Board, back-row-only, buff+single-target debuff) by fighting in melee alongside the allies he buffs, and distinct from <a href="dossier.html?category=enemies&id=stasis-marshal">Stasis Marshal</a> (Preservation, single-target hard control) by working entirely through squad-wide buffs/marks rather than isolating one target.</p>
`,
  "footer": [
    "Faction: <a href=\"dossier.html?category=factions&id=the-ferro-kings\">The Ferro-Kings</a>",
    "Created by: <a href=\"dossier.html?category=npcs&id=adaeze-okonkwo\">Adaeze Okonkwo</a> (promotion/chain of command)",
    "Source: enemy_the_press_ganger.md"
  ]
};
