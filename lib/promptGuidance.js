// lib/promptGuidance.js
//
// Shared guidance for any prompt field that asks for a punchy line
// (signature quote, tagline, capstone quote, overview quote). Pulled
// into one file because the failure mode is identical everywhere it
// showed up: without explicit steering, the model defaults hard to a
// single rhetorical crutch -- "I don't X -- I Y" / "They did A, but I
// did B" antithesis -- for nearly every quote, across NPCs, enemies,
// classes, and factions alike. It's a real rhetorical tool, but reads
// as generic and interchangeable the moment it's the ONLY tool used.
//
// The reference lines below are from this project's own archive
// (Austin's own IP, not a swiped example), chosen specifically because
// they each use a DIFFERENT rhetorical move from each other -- the
// point being variety, not "use this exact template instead."

const QUOTE_CRAFT_GUIDANCE = `QUOTE CRAFT: a signature line is what a player actually remembers about this entry -- it deserves more than a formula. Do NOT default to the "I don't X -- I Y" or "They did A, but I did B" antithesis structure as your go-to move; it's a real rhetorical tool but becomes flat and interchangeable the moment it's used for nearly every quote, which is a known failure pattern to actively avoid here. Reach for genuine variety instead -- some real moves that work, each doing something structurally different from the others:
- A mortality/time twist: "I lived a whole lifetime before you pulled that trigger."
- Blunt finality through repetition, not contrast: "You don't get past me. Not today. Not ever."
- A concrete image/metaphor that turns menacing: "Everything is connected. And I am holding the scissors."
- An admission of cost or sacrifice: "I can fix them. But it will cost me everything."
- Technical/bureaucratic register turned threatening: "I have updated the parameters of this engagement. You lose."
- A mythic identity claim: "Nature always wins. And I am Nature."
Pick whichever move actually fits this specific character/faction's voice and contradiction -- don't force one of these verbatim, they're illustrations of variety, not a menu to copy from. The real test: does the line land ONE clear idea or image hard, or does it read like a rhetorical template filled in with setting-flavored nouns? If you can picture five other characters saying the same sentence structure with different words swapped in, it's not specific enough -- rewrite it.`;

module.exports = { QUOTE_CRAFT_GUIDANCE };
