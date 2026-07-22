// archive/js/wizardSession.js
//
// Detects whether the current browser tab is continuing an existing
// wizard session (survives page navigation + the Back button within the
// same tab) or starting a fresh one (a new tab, or this tab was closed
// and reopened). Uses sessionStorage, which persists across page loads
// in the same tab but is cleared the moment the tab/browser closes.
//
// KNOWN TRADEOFF: there is no way to distinguish "the user closed this on
// purpose" from "the browser crashed" -- both look identical (the flag is
// just gone either way), and both wipe all wizard progress, including
// already-generated lore/factions, not just typed-in form fields. This
// was a deliberate, explicit choice -- see project chat/scope doc for the
// full reasoning -- prioritizing "reopening the wizard always starts
// clean" over crash-resilience for in-progress wizard state.
//
// Include this AFTER auth.js on every wizard-*.html page.

const WIZARD_SESSION_KEY = "worldforge_wizard_session_active";

// Call at the top of every wizard page's init(), BEFORE loading any
// draft/lore/factions data. If this is a new session, wipes all wizard
// progress server-side first -- the page's normal "load saved data" calls
// that follow will then naturally return empty, so no separate
// render-blank code path is needed anywhere else.
async function ensureWizardSession() {
  const isContinuing = sessionStorage.getItem(WIZARD_SESSION_KEY) === "1";
  if (!isContinuing) {
    try {
      await authFetch("/api/wizard/reset", { method: "POST" });
    } catch (err) {
      console.error("Wizard auto-reset failed:", err);
    }
    sessionStorage.setItem(WIZARD_SESSION_KEY, "1");
  }
  return !isContinuing; // true if this call just performed a reset
}

// Explicit "Start Over" action, wired to a button on each wizard page.
// Wipes progress regardless of current session state, then sends the
// user back to Step 1.
async function startOverWizard() {
  const confirmed = confirm(
    "This will erase everything generated so far in this world's setup " +
    "(seed fields, lore, factions). This can't be undone. Continue?"
  );
  if (!confirmed) return;
  try {
    await authFetch("/api/wizard/reset", { method: "POST" });
  } catch (err) {
    console.error("Start Over failed:", err);
  }
  sessionStorage.setItem(WIZARD_SESSION_KEY, "1");
  window.location.href = "wizard.html";
}
