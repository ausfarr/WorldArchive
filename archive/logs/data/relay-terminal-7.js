window.ENTRY = {
  "category": "logs",
  "id": "relay-terminal-7",
  "name": "Relay Terminal 7 — Containment Log",
  "eyebrow": "Terminal Text — Found: East Platform, Subway Substructure",
  "subtitle": "Character(s): Automated Preservation containment unit (unnamed, unit designation only)",
  "faction": "preservation",
  "tags": [
    "<span class=\"tag\">Hex-Tongue Intercept</span>"
  ],
  "bodyHtml": `
<p class="flavor">A field terminal wedged into a maintenance alcove above the platform, still drawing trickle power off a dead rail line. The casing is scorched along one edge. Recovery is partial — a section of the log is corrupted past reconstruction at exactly the point it matters most.</p>
<h2>Terminal Text</h2>
<pre style="background: var(--bg-panel-raised); border: 1px solid var(--border-line); padding: 20px; font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.7; white-space: pre-wrap; color: var(--ink);">[PRESERVATION FIELD UNIT — AUTO-LOG // RELAY 7]
[CONTAINMENT EVENT — EAST PLATFORM, SUBSTRUCTURE SECTOR]
[TRANSMITTING TO: DIVISION CENTRAL // DIRECTOR'S OFFICE, PRIORITY ROUTE]

00:00:04 — Breach detected, East Platform maintenance corridor. Neon
saturation reading: elevated, non-critical. Deploying Stasis field per
Quarantine Directive, Section 4.

00:00:41 — Field holding. Subject count: one (1). Subject is mobile,
non-compliant. Advise: mobile subjects inside an active field are to be
held, not extracted, until saturation drops below containment threshold.
This is standard. This is correct procedure.

00:01:58 — Subject is attempting verbal contact through the field boundary.
Audio pickup active. Content not relevant to containment status. Logging
per protocol regardless.

00:02:15 — Requesting escalation to Division Central. Estimated field
integrity: 40 minutes remaining before saturation exceeds containment
tolerance.

00:04:33 — Escalation acknowledged, Division Central. Advised: hold
position, maintain field, await relief unit. Relief unit ETA not provided.

00:11:07 — Subject condition deteriorating within field parameters. This
unit notes for the record that current protocol does not authorize early
release regardless of subject condition, and this unit is not authorized
to deviate.

00:19:44 — Subject has stopped attempting verbal contact.

00:26:12 — 

[SEGMENT CORRUPTED — 00:26:12 TO 00:31:50 UNRECOVERABLE]
[FILE INTEGRITY: 61% — SECTOR DAMAGE CONSISTENT WITH DIRECT IMPACT]

00:31:51 — Relief unit arrived. Field integrity had already lapsed at time
of arrival. Subject status: [DATA UNRECOVERABLE]. This unit's audio buffer
from 00:26 onward is unrecoverable and will be flagged as such in the
formal report.

00:31:58 — This unit notes, outside of required reporting fields, that
relief arrived nine minutes after this unit's second escalation request
was logged, and eleven minutes after the first.

00:32:04 — End log. Filing to Division Central per standard procedure.
Subject identity redacted from field transmission per Containment Privacy
Clause 2, pending next-of-kin notification. Awaiting acknowledgment from
receiving office.

[TRANSMISSION RECEIVED — DIVISION CENTRAL]
[ACKNOWLEDGED — I. KASTRUP, RELIEF UNIT COMMANDER]
[NO FURTHER ENTRIES ON RECORD]</pre>
<h2>Intercepted Signal — Hex-Tongue (Glitch-Kin network traffic)</h2>
<table class="rel-table">
<tr><th>Translation Tier</th><th>Text</th></tr>
<tr><td>Unreadable</td><td>▖▓▚▛░▙▝</td></tr>
<tr><td>Keyword</td><td>▖held▘ ▚00:26▛ ▜▖▗ carbon▘▙</td></tr>
<tr><td>Phrase</td><td>"Field breach at 00:26. Carbon signature detected inside boundary. Resuming saturation."</td></tr>
</table>
<p class="flavor"><strong>Human interpretation (in-fiction):</strong> the field alarm's dying shriek, picked up as ambient noise by the terminal's audio pickup in the same window as the corrupted segment.</p>
<p class="flavor"><strong>Linguist interpretation:</strong> a Glitch-Kin swarm status ping logging the exact moment the Stasis field failed and something inside it registered as a carbon-based target — timestamped to the same minute the human audio log goes dark.</p>
<h2>Design Notes</h2>
<p>The corrupted segment isn't a production accident — it's the point. This is the transcript Director Kastrup has read "more times than she'd admit," and the file's own damage is what keeps the identity of the person she lost unrecoverable even to her, matching her NPC file's standing secret exactly. The nine-minute gap between escalation and relief is left as bare fact with no editorializing, in keeping with Preservation's clinical logging voice — the horror is in what the unit doesn't say. The sign-off confirms Kastrup was the relief unit commander on record without confirming anything else, and the Hex-Tongue intercept times a swarm carbon-detection ping to the exact minute the human log corrupts, implying (without stating) what breached containment.</p>
`,
  "footer": [
    "Faction: <a href=\"dossier.html?category=factions&id=the-preservation\">The Preservation</a>",
    "Referenced by: <a href=\"dossier.html?category=npcs&id=imelda-kastrup\">Director Imelda Kastrup</a> (relief unit commander of record)",
    "Source: log_relay_terminal_7.md"
  ]
};
