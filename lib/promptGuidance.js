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

// Same "defaults hard to one crutch without explicit steering" failure
// mode as QUOTE_CRAFT_GUIDANCE below, applied to physical description
// fields instead of quotes. Observed pattern in this archive's NPCs was a
// recurring mismatched/scarred/replaced eye as the one "distinctive
// feature" -- framed here around the GENERAL failure (fixating on a
// single striking feature as a substitute for an actually distinct
// physical presence), not just eyes specifically, so it still holds if
// the model fixates on something else next. Currently only wired into
// prompts/npcContentPrompt.js -- enemies/classes/survivors don't have a
// physicalDescription-style field in their schemas (checked during
// session_addendum_beta_feedback_batch3.md's Fix 5); wire this in if one
// of them ever gains one.
const PHYSICAL_DESCRIPTION_GUIDANCE = `PHYSICAL DESCRIPTION CRAFT: without explicit steering, generated descriptions default hard to the same crutch -- ONE conspicuous "distinctive feature" (often facial, often an eye) bolted onto an otherwise generic frame, standing in for an actually distinct physical presence.

THE FAILURE PATTERN TO ELIMINATE: a description built as [generic build/height] + [one striking feature] and nothing else load-bearing. If the SAME kind of feature (an eye, a scar, a tattoo) is doing all the "memorable" work across multiple NPCs in a row, that's the tell -- a reader should be able to picture each character from a DIFFERENT part of the description, not the same anatomical slot every time.

MECHANICAL SELF-CHECK, apply before finalizing: does this description lean on one striking feature to do all the memorable work? If yes, cut it or demote it to a supporting detail, and build the description around at least one different category below instead.

Reach for genuine variety across categories like these -- pick whichever 2-3 actually suit the character, not the same category every time:
- Posture/carriage: how they hold themselves at rest (hunched over an old injury, unnervingly still, always angled toward the exit)
- Hands: calluses, a missing finger, a tremor, restless fidgeting, ink- or grease-stained
- Gait/movement: a limp, a deliberate economy of motion, restless pacing
- Clothing/gear wear: what's patched, what's pristine and out of place, what they clearly maintain obsessively vs. let go
- A physical habit or tic (not spoken -- that's the speech field's job): cracking knuckles, chewing something, never quite making eye contact
- Scarring or marking placed somewhere OTHER than the face when it fits the character at all
- Build/texture tied to their actual life (a laborer's forearms, a scholar's stoop from years hunched over pages) rather than a generic "athletic" or "wiry" default

Facial features, including eyes, are still fair game when they genuinely fit the character -- the fix is variety and proportion, not a ban on any one detail. The test: if you swapped this description onto a different character in the same roster, would anyone notice? If not, it's leaning too hard on one generic crutch.`;

const QUOTE_CRAFT_GUIDANCE = `QUOTE CRAFT: a signature line is what a player actually remembers about this entry -- it deserves more than a formula.

THE #1 FAILURE PATTERN TO ELIMINATE: any line shaped as [negate/deny/dismiss one thing] + [dash, comma, or "but"] + [assert a different, fancier-sounding thing]. This is a STRUCTURAL pattern, not a literal phrase -- avoiding the exact words "I don't" or "I'm not" is NOT enough if the sentence still has this skeleton underneath different wording. All of these are the SAME forbidden pattern, even though none share the same words: "I don't hunt what breaks the rules -- I hunt what the rules are breaking to hide," "I'm not breaking free from the story -- I'm rewriting it by pulling the seams apart," "They see a monster. I see what made me one." Every one of these negates something in the first half purely to set up a reframe in the second half, and every one reads as an AI-generated template with the nouns swapped -- this is the single most common way a generated quote fails to land, and it is not fixed by rephrasing the negation, only by removing it.

MECHANICAL SELF-CHECK, apply to every quote field before finalizing: does the first half of the line negate, deny, correct, or dismiss something ("not X," "don't X," "they think X," "isn't just X") in order to pivot to a second half? If yes, DELETE the first half entirely and rewrite the line as ONE direct statement. The setup is almost never needed -- the payoff usually hits harder alone, with the word count you just freed up spent making that one idea sharper instead.

Reach for genuine variety instead -- some real moves that work, each doing something structurally different, and notice most of these are a SINGLE clause or image, not a two-part contrast:
- A mortality/time twist: "I lived a whole lifetime before you pulled that trigger."
- Blunt finality through repetition, not contrast: "You don't get past me. Not today. Not ever."
- A concrete image/metaphor that turns menacing: "Everything is connected. And I am holding the scissors."
- An admission of cost or sacrifice: "I can fix them. But it will cost me everything."
- Technical/bureaucratic register turned threatening: "I have updated the parameters of this engagement. You lose."
- A mythic identity claim: "Nature always wins. And I am Nature."
- A flat declarative fact that needs no justification or contrast to land: "The last thing I loved, I buried myself."
- A question aimed at the listener that isn't really a question: "You want to know what's left of me? So do I."

Pick whichever move actually fits this specific character/faction's voice and contradiction -- don't force one of these verbatim, they're illustrations of variety and of HITTING HARD, not a menu to copy from. Apply this test, in order: (1) Does the first half negate or deny something purely to set up the second half? If yes, cut it and start over -- this check alone catches most weak lines. (2) Does the line land ONE clear idea or image hard, in as few words as possible? (3) If you can picture five other characters saying the same sentence structure with different words swapped in, it's not specific enough -- rewrite it.`;

module.exports = { QUOTE_CRAFT_GUIDANCE, PHYSICAL_DESCRIPTION_GUIDANCE };
