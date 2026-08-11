// scripts/ingestSrdPf2e.js
//
// BLOCKED -- do not populate srd_library with PF2e content until the
// question below is resolved with a real answer, not a guess. See
// SESSION_LOG.md's Phase 2 entry for the full research trail; this
// comment is the short version.
//
// This project's scope requires PF2e content released under the ORC
// license specifically -- not Paizo's Community Use Policy (CUP), which
// is a separate, more restrictive fan-content license. The most complete
// structured PF2e dataset found while researching this (Pf2ools/pf2ools-data)
// explicitly reproduces Paizo's own rules text under CUP, not ORC -- its
// README's Legal section states "Content published by Paizo Inc. is
// reproduced in accordance with the Community Use Policy." CUP terms are
// typically incompatible with a paid commercial product (non-commercial-use
// / revenue-cap restrictions are standard in this kind of fan-content
// policy) -- shipping it here would risk exactly the legal exposure this
// project's scope doc warns about.
//
// No other freely-redistributable, ORC-licensed, structured (or even
// plain-text) PF2e reference document equivalent to Wizards' CC-BY-4.0
// SRD PDF could be located or verified from this environment --
// paizo.com itself is unreachable from this sandbox's network egress
// policy, so Paizo's own /licenses page (the authoritative source for
// what Paizo has actually released under ORC vs. CUP) could not be
// checked directly.
//
// Open question for Austin (or a lawyer) before this script can do
// anything: has Paizo released actual Player Core / GM Core / Monster
// Core rules TEXT under the ORC license itself -- as opposed to just
// publishing the ORC license as a legal template other publishers can
// apply to their OWN original content? Those are two different things.
// If yes, get the official source/download location directly from
// paizo.com/licenses. If the answer turns out to be "no such release
// exists," the fallback is the same shape as the 5e path: license PF2e
// core rulebooks Austin already owns are NOT a substitute (see this
// project's hard constraint against using owned books as a data source
// -- owning a book grants no redistribution rights) -- it would mean
// Pathfinder 2e support ships with Homebrew-tier generation only, no
// canonical import library, until a genuinely ORC-licensed source turns up.
//
// Run with: node scripts/ingestSrdPf2e.js -- exits immediately with this
// explanation rather than ingesting anything.

async function main() {
  console.error(
    [
      "scripts/ingestSrdPf2e.js is intentionally not implemented.",
      "",
      "No PF2e content source could be verified as safely ORC-licensed",
      "for a commercial product from this environment -- see this file's",
      "header comment and SESSION_LOG.md's Phase 2 entry for the full",
      "research trail and the open question that needs a real answer.",
      "",
      "Do NOT ingest pf2ools-data (or anything derived from Archives of",
      "Nethys) into srd_library without new, explicit ORC-license",
      "verification straight from paizo.com/licenses -- everything",
      "checked so far turned out to be Community Use Policy content,",
      "not ORC."
    ].join("\n")
  );
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = { main };
