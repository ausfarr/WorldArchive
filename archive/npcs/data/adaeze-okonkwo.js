window.ENTRY = {
  "category": "npcs",
  "id": "adaeze-okonkwo",
  "name": "Adaeze Okonkwo",
  "eyebrow": "NPC Dossier — Faction Leader",
  "subtitle": "\"The Foreman\"",
  "faction": "ferro_kings",
  "tags": [
    "<span class=\"tag\">Faction Leader</span>"
  ],
  "bodyHtml": `
<img class="portrait-img" src="images/adaeze-okonkwo.png" alt="Adaeze Okonkwo" onerror="this.outerHTML='&lt;div class=&quot;portrait-slot&quot;&gt;Character portrait — pending&lt;span class=&quot;sub&quot;&gt;art prompt not yet generated&lt;/span&gt;&lt;/div&gt;'">
<div class="quote-block">"I didn't build this. I just refused to let it fall."</div>
<p class="flavor">Broad-shouldered and weathered, she still wears an actual foreman's hard hat — battered, re-strapped, plated on one side with scavenged steel. She carries a clipboard she rarely writes on anymore; it's mostly for pointing. People straighten up when she walks a line, the way you would for an inspection, even now.</p>
<h2>Personality</h2>
<p><strong>Traits:</strong> Pragmatic, demanding, fiercely protective of "her people"</p>
<p><strong>The Contradiction:</strong> She runs the most brutal faction in the city — and refuses to let anyone go hungry. Outsiders who show up starving get fed first, no questions asked, and put to work second. Everyone assumes it's strategy. It isn't, entirely.</p>
<h2>Motivation</h2>
<p><strong>Wants:</strong> Keep the factories running and her people fed and armed.</p>
<p><strong>Actually needs:</strong> Proof that the old world's chain of command — the one that made her someone, not just a body on a line — still means something in this one.</p>
<h2>Speech Pattern</h2>
<p><strong>Register:</strong> Factory-floor foreman language — quotas, shifts, safety violations, repurposed as social judgment.</p>
<p><strong>Rhythm:</strong> Short, declarative. Orders come out as statements, never requests.</p>
<p><strong>Tic:</strong> Ends her read of a person with a one-word verdict — "Solid." "Soft." "Wasted."</p>
<p><strong>Would never say:</strong> Sorry. Apologizing for a decision once made reads as weakness on the floor, and she's spent thirty years unlearning weakness.</p>
<h2>Relationships</h2>
<table class="rel-table">
<tr><th>Connection</th><th>To</th><th>Why</th></tr>
<tr><td>Faction allegiance</td><td><a href="dossier.html?category=factions&id=the-ferro-kings">The Ferro-Kings</a></td><td>Leads it.</td></tr>
<tr><td>Chain of command</td><td><a href="dossier.html?category=enemies&id=the-press-ganger">The Press-Ganger</a></td><td>Pulled him off the line and promoted him herself after the collapse; he answers to her directly and it shows.</td></tr>
<tr><td>Rivalry</td><td><a href="dossier.html?category=npcs&id=aldric-voss">Aldric Voss</a>, The Board</td><td>He's offered her a "full acquisition package" for the Ferro-Kings' factories more times than either bothers to count; her flat, repeated refusal is a standing thorn in his worldview.</td></tr>
</table>
<h2>Sample Dialogue</h2>
<div class="dialogue-block">
<span class="speaker">Adaeze Okonkwo:</span> "You're either useful or you're in the way. Which is it?"
      </div>
<span class="branch-label">If you respond respectfully/direct — "I want to help however I can."</span>
<div class="dialogue-block">
<span class="speaker">Adaeze Okonkwo:</span> "Good. Solid. Go see the Press-Ganger — he'll put you to work."
      </div>
<span class="branch-label">If you push back/refuse to be sized up — "I don't answer to a hard hat."</span>
<div class="dialogue-block">
<span class="speaker">Adaeze Okonkwo:</span> <em>(a pause, then almost approving)</em> "...Soft, that mouth. But it's got teeth. Might survive the week."
      </div>
<h2>Quest Hook</h2>
<p>She wants a shipment of stolen tools recovered from a Board-held outpost — on paper, it's about the tools. Underneath, it's about making the Board answer for walking into Ferro-Kings territory unchallenged, and she needs someone outside her own chain of command to do it quietly.</p>
<h2>Design Notes</h2>
<p>First Ferro-Kings Faction Leader generated — no role+faction collision. Ties directly into the <a href="dossier.html?category=enemies&id=the-press-ganger">Press-Ganger</a> as his former shift supervisor, giving both characters more weight than either had alone.</p>
`,
  "footer": [
    "Faction: <a href=\"dossier.html?category=factions&id=the-ferro-kings\">The Ferro-Kings</a>",
    "Chain of command: <a href=\"dossier.html?category=enemies&id=the-press-ganger\">The Press-Ganger</a>",
    "Source: npc_adaeze_okonkwo.md"
  ]
};
