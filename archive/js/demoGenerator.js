// archive/js/demoGenerator.js
//
// Drives archive/demo.html -- the unauthenticated demo generator (see
// session_addendum_demo_mode_scope.md). No auth.js/authFetch() here on
// purpose: this page has no session, and every /api/demo/* route is
// mounted outside resolveTenant specifically so it never needs one.
//
// These constants mirror lib/demoUsageRepo.js's DEMO_TEXT_CAP/
// DEMO_PORTRAIT_CAP -- purely for the "N left today" indicator text.
// They are NOT the real gate (the server enforces the actual cap on
// every request regardless of what this file displays) -- see the
// cookie-mirror comment below for why this can drift from the server's
// real count and why that's an accepted, harmless gap.
const DEMO_TEXT_CAP = 2;
const DEMO_PORTRAIT_CAP = 1;
const USAGE_COOKIE_NAME = "chronicled_demo_usage";

// Handoff key read by wizard-lore.html's init() after signup, to prefill
// the Import Existing panel with whatever setting text this visitor typed
// here -- see that file's comment for the reasoning. sessionStorage (not
// localStorage) matches the admin-view pattern in auth.js: this should
// only survive the current tab through signup, not linger indefinitely.
const DEMO_LORE_HANDOFF_KEY = "chronicled_demo_lore";

function getCustomSetting() {
  const val = document.getElementById("custom-setting").value.trim();
  return val || null;
}

let selectedPreset = null;
let selectedCategory = "npcs";
let currentResult = null; // { category, raw } from the last successful /generate — feeds /generate-portrait

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

// Client-side mirror of today's usage, purely for the "N left" indicator
// -- a short-lived cookie, never read by the server (the real cap check
// is lib/demoUsageRepo.js's hashed-IP lookup in Postgres). Trivially
// spoofable/clearable by the visitor; that's fine, since nothing server-
// side ever trusts it. Expires in 2 days so it never lingers as a
// long-term tracking cookie, while still surviving a visitor near a UTC
// day boundary long enough for the day-rollover check below to reset it
// cleanly on their next visit.
function readUsageCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${USAGE_COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch (e) {
    return null;
  }
}

function writeUsageCookie(usage) {
  document.cookie = `${USAGE_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(usage))}; max-age=172800; path=/; SameSite=Lax`;
}

function getUsage() {
  const stored = readUsageCookie();
  if (stored && stored.day === todayUtc()) return stored;
  return { day: todayUtc(), textUsed: 0, portraitUsed: 0 };
}

function bumpUsage(field) {
  const usage = getUsage();
  usage[field] += 1;
  writeUsageCookie(usage);
  renderUsageNote();
}

function renderUsageNote() {
  const usage = getUsage();
  const textLeft = Math.max(0, DEMO_TEXT_CAP - usage.textUsed);
  const portraitLeft = Math.max(0, DEMO_PORTRAIT_CAP - usage.portraitUsed);
  document.getElementById("usage-note").textContent =
    `${textLeft} of ${DEMO_TEXT_CAP} free generations left today · ${portraitLeft} of ${DEMO_PORTRAIT_CAP} free portrait left today`;
}

// Conversion wall (Phase 3) -- framed as an invitation, not a hard
// block, per the locked decision: hitting either cap or clicking
// "Save This" should read as "there's more if you sign up," never as a
// dead end. Hooks into the app's existing signup flow (login.html's
// own ?mode=signup handling, the same deep link the marketing site's
// CTAs already use -- see login.html's comment) rather than building
// any new auth UI here.
const WALL_COPY = {
  "cap-text": {
    headline: "You've hit today's free limit",
    copy: "You've used your 2 free demo generations for today. Sign up free to keep building — no daily limit in your own world, plus Factions, Items, Locations, and everything else Chronicled generates."
  },
  "cap-portrait": {
    headline: "You've used today's free portrait",
    copy: "Sign up free to generate as many portraits as your world needs, alongside everything else Chronicled builds for you."
  },
  save: {
    headline: "Save this to your own world",
    copy: "Create a free account and this character — plus everything else you generate — gets saved to your own living Archive instead of disappearing on refresh."
  }
};

function showSignupWall(reason) {
  const wall = document.getElementById("signup-wall");
  const copy = WALL_COPY[reason] || WALL_COPY["cap-text"];
  document.getElementById("wall-headline").textContent = copy.headline;
  document.getElementById("wall-copy").textContent = copy.copy;
  wall.style.display = "block";
  wall.scrollIntoView({ behavior: "smooth", block: "center" });

  // Hand off whatever setting text this visitor typed so wizard-lore.html
  // can prefill it after signup instead of making them retype it -- see
  // that file's init() for the read side. Only worth stashing if they
  // actually wrote their own setting; the fixed genre presets aren't
  // theirs to carry forward.
  const customSetting = getCustomSetting();
  if (customSetting) {
    try {
      sessionStorage.setItem(DEMO_LORE_HANDOFF_KEY, customSetting);
    } catch (err) {
      // Private browsing / storage disabled -- fine, they just retype it.
    }
  }
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loadPresets() {
  const container = document.getElementById("preset-cards");
  try {
    const res = await fetch("/api/demo/presets");
    const data = await res.json();
    (data.presets || []).forEach((preset, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-card preset-card" + (i === 0 ? " selected" : "");
      btn.dataset.preset = preset.key;
      btn.innerHTML = `<strong>${escapeHtml(preset.label)}</strong>`;
      btn.addEventListener("click", () => selectPreset(preset.key));
      container.appendChild(btn);
      if (i === 0) selectedPreset = preset.key;
    });
  } catch (err) {
    container.textContent = "Couldn't load genre presets — try refreshing.";
  }
}

function selectPreset(key) {
  selectedPreset = key;
  document.querySelectorAll(".preset-card").forEach((el) => {
    el.classList.toggle("selected", el.dataset.preset === key);
  });
}

function selectCategory(category) {
  selectedCategory = category;
  document.querySelectorAll(".category-card").forEach((el) => {
    el.classList.toggle("selected", el.dataset.category === category);
  });
}

document.querySelectorAll(".category-card").forEach((el) => {
  el.addEventListener("click", () => selectCategory(el.dataset.category));
});

// Mirrors the exact eyebrow/subtitle text the real save paths would
// produce (lib/fileWriter.js's saveNpcEntry; lib/rulesets/5e/enemyRepo.js's
// save5eEnemyEntry + its buildEnemyManifestEntry) -- nothing demo-specific
// invented here, just computed client-side since there's no save step.
function eyebrowAndSubtitle(category, raw) {
  if (category === "npcs") {
    return { eyebrow: `NPC Dossier — ${raw.roleArchetype || "Character"}`, subtitle: raw.callsign ? `"${raw.callsign}"` : "" };
  }
  const cr = raw.challengeRating || {};
  return {
    eyebrow: `Bestiary Entry — CR ${cr.cr != null ? cr.cr : "?"}`,
    subtitle: `${raw.size || ""} ${raw.type || ""} — CR ${cr.cr != null ? cr.cr : "?"}`.trim()
  };
}

async function handleGenerate() {
  const btn = document.getElementById("generate-btn");
  const status = document.getElementById("status");
  btn.disabled = true;
  status.textContent = "Generating — this can take up to 20 seconds…";
  document.getElementById("result-sheet").style.display = "none";
  document.getElementById("signup-wall").style.display = "none";

  try {
    const customSetting = getCustomSetting();
    const res = await fetch("/api/demo/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        customSetting
          ? { category: selectedCategory, customSetting }
          : { category: selectedCategory, preset: selectedPreset }
      )
    });
    const data = await res.json();

    if (res.status === 429) {
      status.textContent = data.error || "You've used your free demo generations for today.";
      const usage = getUsage();
      usage.textUsed = DEMO_TEXT_CAP; // sync the client mirror to the server's authoritative "capped" state
      writeUsageCookie(usage);
      renderUsageNote();
      showSignupWall("cap-text");
      return;
    }
    if (!res.ok) throw new Error(data.error || "Generation failed.");

    currentResult = { category: data.category, raw: data.raw };
    renderResult(data);
    bumpUsage("textUsed");
    status.textContent = "";
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function renderResult(data) {
  const { eyebrow, subtitle } = eyebrowAndSubtitle(data.category, data.raw);
  document.getElementById("result-eyebrow").textContent = eyebrow;
  document.getElementById("result-title").textContent = data.raw.name || "";
  document.getElementById("result-subtitle").textContent = subtitle;

  const body = document.getElementById("result-body");
  body.innerHTML = data.bodyHtml;

  // The real templates (lib/entryTemplate.js / lib/rulesets/generic/
  // enemyTemplate.js) render a portrait <img> pointing at
  // images/<id>.png with an onerror fallback meant for the authenticated
  // dossier page (archive/js/portraitActions.js, not loaded here). There
  // is no such image and no handlePortraitError() defined on this page,
  // so hide the placeholder entirely until a real portrait comes back
  // from the "Generate Portrait" button below.
  const portraitImg = body.querySelector(".portrait-img");
  if (portraitImg) {
    portraitImg.removeAttribute("onerror");
    portraitImg.style.display = "none";
  }

  document.getElementById("portrait-btn").disabled = false;
  document.getElementById("portrait-status").textContent = "";
  document.getElementById("result-sheet").style.display = "block";
}

async function handleGeneratePortrait() {
  if (!currentResult) return;
  const btn = document.getElementById("portrait-btn");
  const status = document.getElementById("portrait-status");
  btn.disabled = true;
  status.textContent = "Generating portrait — this can take up to 30 seconds…";

  try {
    const res = await fetch("/api/demo/generate-portrait", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: currentResult.category, subjectJson: currentResult.raw })
    });
    const data = await res.json();

    if (res.status === 429) {
      status.textContent = data.error || "You've used your free demo portrait for today.";
      const usage = getUsage();
      usage.portraitUsed = DEMO_PORTRAIT_CAP;
      writeUsageCookie(usage);
      renderUsageNote();
      showSignupWall("cap-portrait");
      return;
    }
    if (!res.ok) throw new Error(data.error || "Portrait generation failed.");

    const portraitImg = document.querySelector("#result-body .portrait-img");
    if (portraitImg) {
      portraitImg.src = data.imageDataUrl;
      portraitImg.style.display = "";
    }
    bumpUsage("portraitUsed");
    status.textContent = "";
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    btn.disabled = false;
  }
}

document.getElementById("generate-btn").addEventListener("click", handleGenerate);
document.getElementById("portrait-btn").addEventListener("click", handleGeneratePortrait);
document.getElementById("save-this-btn").addEventListener("click", () => showSignupWall("save"));

loadPresets();
renderUsageNote();
