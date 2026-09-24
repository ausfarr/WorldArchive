// archive/js/timeline.js
//
// Session Prep Companion, Phase 6 -- Timeline browse page. Pure
// read/render -- events were written at save/confirm time (see
// lib/timelineEvents.js); this lists and links them. The month-grid view
// is the Calendar page (calendarPage.js).
//
// Bug batch 1: redesigned from a flat list of cards into a vertical
// stream -- year markers, "N years later" gaps, color-coded source nodes
// (hollow + dashed for approximate lore dates), a "Today in your world"
// marker, source filter chips, and readable linked-entry pills.

function compareWorldDates(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a.year !== b.year) return a.year - b.year;
  if (a.monthIndex !== b.monthIndex) return a.monthIndex - b.monthIndex;
  return a.day - b.day;
}

const SOURCE_LABELS = {
  lore_date: "World Lore",
  chronicle: "Session Chronicle",
  log_date: "Log",
  regenerate: "Regenerate",
  entry_date: "Entry Date"
};

// Timeline redesign (bug batch 1): one accent per source type, drawn from
// the site's theme variables (so a world's Style Guide colors carry
// through) plus the fixed faction palette for the rest.
const SOURCE_COLORS = {
  entry_date: "var(--neon-cyan)",
  chronicle: "var(--neon-primary)",
  lore_date: "var(--the-board)",
  log_date: "var(--colony)",
  regenerate: "var(--glitch-kin)"
};
const SOURCE_ORDER = ["entry_date", "chronicle", "log_date", "lore_date", "regenerate"];

const CATEGORY_SINGULAR = {
  factions: "Faction", npcs: "NPC", survivors: "PC", items: "Item", logs: "Log",
  locations: "Location", enemies: "Bestiary", classes: "Class", spells: "Spell"
};

// Page state: fetched once per load, re-rendered on filter toggles.
const TL_STATE = { events: [], calendarConfig: null, factionLookup: {}, hidden: new Set() };

// "the-iron-pact" -> "The Iron Pact": linked entries only carry
// { category, entryId }, and fetching every entry just for its display
// name isn't worth a round trip per category. Factions use their real
// name from the lookup this page already loads.
function humanizeEntryId(id) {
  return String(id || "").split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// `ref` is a decorated linked entry from GET /timeline-events
// (lib/timelineDecorate.js): { category, entryId, name, deleted }. A
// deleted entry renders as plain struck-through text, not a 404 link.
function timelineEntryLink(ref) {
  if (!ref || !ref.entryId) return "";
  const kind = CATEGORY_SINGULAR[ref.category] || ref.category;
  const name = ref.name || humanizeEntryId(ref.entryId);
  if (ref.deleted) {
    return `<span class="tl-pill tl-deleted" title="This entry was deleted"><span class="tl-pill-k">${escapeHtmlForSearch(kind)}</span>${escapeHtmlForSearch(name)}</span>`;
  }
  return `<a class="tl-pill" href="../dossier.html?category=${escapeHtmlForSearch(ref.category)}&id=${escapeHtmlForSearch(ref.entryId)}"><span class="tl-pill-k">${escapeHtmlForSearch(kind)}</span>${escapeHtmlForSearch(name)}</a>`;
}

function safeHex(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : null;
}

// Short in-card date: the year is already the section header, so cards
// show just the part of the date below it -- and honestly say when the
// lore only gave a year or month.
function shortDateLabel(date, calendarConfig) {
  if (!date) return "Undated";
  const months = (calendarConfig && calendarConfig.months) || [];
  const month = months[date.monthIndex];
  const monthName = month ? month.name : `Month ${(date.monthIndex ?? 0) + 1}`;
  if (date.precision === "year") return "Sometime this year";
  if (date.precision === "month") return monthName;
  return `${date.day} ${monthName}`;
}

function currentWorldDate(calendarConfig) {
  const cd = calendarConfig && calendarConfig.current_date;
  if (!cd || !Number.isInteger(cd.year)) return null;
  return { year: cd.year, monthIndex: cd.month_index || 0, day: cd.day || 1 };
}

function renderEventCard(e) {
  const { calendarConfig, factionLookup } = TL_STATE;
  const color = SOURCE_COLORS[e.sourceType] || "var(--ink-dim)";
  const approx = !!(e.worldDate && e.worldDate.approximate);
  const sourceHref = e.sourceType === "lore_date"
    ? "../world-info.html"
    : `../dossier.html?category=${escapeHtmlForSearch(e.sourceCategory)}&id=${escapeHtmlForSearch(e.sourceId)}`;
  const sourceLabel = escapeHtmlForSearch(SOURCE_LABELS[e.sourceType] || e.sourceType);
  const pills = [e.sourceDeleted
    ? `<span class="tl-pill tl-source tl-deleted" title="The source entry was deleted">${sourceLabel} · deleted</span>`
    : `<a class="tl-pill tl-source" href="${sourceHref}">${sourceLabel}</a>`];
  if (e.sessionNumber) pills.push(`<span class="tl-pill tl-session">Session ${Number(e.sessionNumber)}</span>`);
  // The source pill already links to an entry_date event's own entry --
  // don't repeat it as a "linked" pill.
  const linkedEntries = e.linkedEntries || (e.linkedEntryIds || []).map((ref) => ({ ...ref, name: null, deleted: false }));
  linkedEntries
    .filter((ref) => !(e.sourceType === "entry_date" && ref.category === e.sourceCategory && ref.entryId === e.sourceId))
    .forEach((ref) => pills.push(timelineEntryLink(ref)));
  const linkedFactions = e.linkedFactions || (e.linkedFactionIds || []).map((key) => ({ key, id: key, name: null, deleted: false }));
  linkedFactions.forEach((f) => {
    if (e.sourceType === "entry_date" && e.sourceCategory === "factions" && (e.sourceId === f.key || e.sourceId === f.id)) return;
    const fac = factionLookup[f.key];
    const accent = fac && safeHex(fac.accentColor);
    const name = f.name || (fac && fac.name) || humanizeEntryId(f.key);
    if (f.deleted) {
      pills.push(`<span class="tl-pill tl-deleted" title="This faction was deleted"><span class="tl-pill-k">Faction</span>${escapeHtmlForSearch(name)}</span>`);
      return;
    }
    pills.push(`<a class="tl-pill" href="../dossier.html?category=factions&id=${escapeHtmlForSearch(f.id)}"${accent ? ` style="border-color:${accent}"` : ""}><span class="tl-pill-k">Faction</span>${escapeHtmlForSearch(name)}</a>`);
  });
  // The Roundup-may-be-stale nudge only makes sense for events that
  // happened TO a faction in play (chronicles/logs/regenerates), not for
  // a member's birth date.
  const nudgeFactions = ["chronicle", "log_date", "regenerate"].includes(e.sourceType) ? linkedFactions.filter((f) => !f.deleted) : [];
  const nudge = nudgeFactions.map((f) => {
    const fac = factionLookup[f.key];
    return `⟳ <a href="../dossier.html?category=factions&id=${escapeHtmlForSearch(f.id)}">${escapeHtmlForSearch(f.name || (fac && fac.name) || humanizeEntryId(f.key))}</a>'s Roundup may be stale — regenerate?`;
  }).join(" · ");

  return `
    <div class="tl-event${approx ? " tl-approx" : ""}" style="--tl-c:${color}">
      <div class="tl-card">
        <p class="tl-date">${escapeHtmlForSearch(shortDateLabel(e.worldDate, calendarConfig))}${approx ? '<span class="tl-approx-tag">approximate</span>' : ""}</p>
        <p class="tl-summary">${escapeHtmlForSearch(e.summary)}</p>
        <div class="tl-meta">${pills.join("")}</div>
        ${nudge ? `<p class="tl-nudge">${nudge}</p>` : ""}
      </div>
    </div>`;
}

function renderOverview() {
  const host = document.getElementById("tl-overview");
  const { events, calendarConfig, hidden } = TL_STATE;
  const dated = events.filter((e) => e.worldDate);
  const eraName = calendarConfig && calendarConfig.era_name;
  let span = "";
  if (dated.length) {
    const first = dated[0].worldDate.year;
    const last = dated[dated.length - 1].worldDate.year;
    span = first === last ? ` in <strong>Year ${first}</strong>` : ` spanning <strong>${last - first}</strong> years (Year ${first}–${last})`;
  }
  const counts = {};
  events.forEach((e) => { counts[e.sourceType] = (counts[e.sourceType] || 0) + 1; });
  const chips = SOURCE_ORDER.filter((t) => counts[t]).concat(Object.keys(counts).filter((t) => !SOURCE_ORDER.includes(t)))
    .map((t) => `<button type="button" class="tl-chip" data-type="${escapeHtmlForSearch(t)}" aria-pressed="${hidden.has(t) ? "false" : "true"}" style="--tl-c:${SOURCE_COLORS[t] || "var(--ink-dim)"}">${escapeHtmlForSearch(SOURCE_LABELS[t] || t)} <span class="tl-chip-n">${counts[t]}</span></button>`)
    .join("");
  host.innerHTML = `
    <p class="tl-stats"><strong>${events.length}</strong> event${events.length === 1 ? "" : "s"}${span}${eraName ? ` · ${escapeHtmlForSearch(eraName)}` : ""}</p>
    ${chips ? `<div class="tl-filters" role="group" aria-label="Filter by source">${chips}</div>` : ""}`;
  host.style.display = "block";
  host.querySelectorAll(".tl-chip").forEach((chip) => chip.addEventListener("click", () => {
    const t = chip.dataset.type;
    if (hidden.has(t)) hidden.delete(t); else hidden.add(t);
    renderOverview();
    renderStream();
  }));
}

// Vertical stream: a diamond year marker per year, "N years later" gaps
// between distant years, and a pulsing "Today in your world" marker at the
// calendar's current date (future-dated events land after it).
function renderStream() {
  const host = document.getElementById("tl-list");
  const { events, calendarConfig, hidden } = TL_STATE;
  const visible = events.filter((e) => !hidden.has(e.sourceType));
  if (!visible.length) {
    host.innerHTML = '<p class="tl-empty-filter">No events match these filters.</p>';
    return;
  }
  const eraName = calendarConfig && calendarConfig.era_name;
  const now = currentWorldDate(calendarConfig);
  const nowHtml = now ? `
    <div class="tl-now">
      <span class="tl-now-label">Today in your world</span>
      <span class="tl-now-date">${escapeHtmlForSearch(formatWorldDateClient(now, calendarConfig))}</span>
      <span class="tl-now-line"></span>
    </div>` : "";
  const parts = [];
  let lastYear = null;
  let nowPlaced = !now;
  let undatedHeader = false;
  for (const e of visible) {
    if (!nowPlaced && e.worldDate && compareWorldDates(now, e.worldDate) < 0) {
      parts.push(nowHtml);
      nowPlaced = true;
    }
    if (!e.worldDate) {
      if (!undatedHeader) {
        if (!nowPlaced) { parts.push(nowHtml); nowPlaced = true; }
        parts.push('<div class="tl-year"><span class="tl-year-num">Undated</span></div>');
        undatedHeader = true;
      }
    } else if (e.worldDate.year !== lastYear) {
      if (lastYear !== null && e.worldDate.year - lastYear > 1) {
        const gap = e.worldDate.year - lastYear;
        parts.push(`<div class="tl-gap">${gap} years later</div>`);
      }
      parts.push(`<div class="tl-year"><span class="tl-year-num">Year ${e.worldDate.year}</span>${eraName ? `<span class="tl-year-era">${escapeHtmlForSearch(eraName)}</span>` : ""}</div>`);
      lastYear = e.worldDate.year;
    }
    parts.push(renderEventCard(e));
  }
  if (!nowPlaced) parts.push(nowHtml);
  host.innerHTML = parts.join("");
}

async function loadAndRenderTimeline() {
  const host = document.getElementById("tl-list");
  const empty = document.getElementById("tl-list-empty");
  try {
    const [eventsRes, calendarRes, factionLookup] = await Promise.all([
      authFetch("/api/timeline-events"),
      authFetch("/api/wizard/calendar-config"),
      getFactionLookup()
    ]);
    const eventsData = await eventsRes.json();
    const calendarData = await calendarRes.json();
    if (!eventsRes.ok) throw new Error(eventsData.error || "Failed to load Timeline.");
    const calendarConfig = calendarData.calendarConfig;

    const events = (eventsData.events || []).slice().sort((a, b) => compareWorldDates(a.worldDate, b.worldDate));
    // Bug batch 1, Phase 3: with the Settings calendar editor gone, the
    // empty Timeline is where a calendar-less, already-set-up world gets
    // pointed at wizard-calendar.html's edit mode.
    const hasCalendar = !!(calendarConfig && Array.isArray(calendarConfig.months) && calendarConfig.months.length);
    const noCal = document.getElementById("tl-no-calendar");
    if (noCal) noCal.style.display = hasCalendar ? "none" : "block";
    Object.assign(TL_STATE, { events, calendarConfig, factionLookup: factionLookup || {} });
    if (!events.length) {
      empty.style.display = "block";
      document.getElementById("tl-overview").style.display = "none";
      host.innerHTML = "";
      return;
    }
    empty.style.display = "none";
    renderOverview();
    renderStream();
  } catch (err) {
    console.error("Loading Timeline failed:", err);
    host.innerHTML = '<p class="tl-empty-filter">Could not load the Timeline. Try refreshing.</p>';
  }
}

// Thin client-side mirror of lib/calendar.js's formatWorldDate -- no
// server round-trip needed just to render a date string the page
// already has both halves of (the event's worldDate + the fetched
// calendarConfig).
function formatWorldDateClient(date, calendarConfig) {
  if (!date || typeof date.year !== "number") return "(date unknown)";
  const months = (calendarConfig && calendarConfig.months) || [];
  const month = months[date.monthIndex];
  const monthName = month ? month.name : `Month ${(date.monthIndex ?? 0) + 1}`;
  const eraName = calendarConfig && calendarConfig.era_name;
  const day = date.day;
  const lastTwo = Math.abs(day) % 100;
  let suffix = "th";
  if (!(lastTwo >= 11 && lastTwo <= 13)) {
    const lastDigit = Math.abs(day) % 10;
    if (lastDigit === 1) suffix = "st";
    else if (lastDigit === 2) suffix = "nd";
    else if (lastDigit === 3) suffix = "rd";
  }
  const eraPart = eraName ? ` of the ${eraName}` : "";
  // Precision/approximate (bug batch 1, Phase 4 -- lore-extracted dates),
  // mirroring lib/calendar.js#formatWorldDate.
  const approx = date.approximate ? "c. " : "";
  if (date.precision === "year") return `${approx}Year ${date.year}${eraPart}`;
  if (date.precision === "month") return `${approx}${monthName}, Year ${date.year}${eraPart}`;
  const dayPart = typeof day === "number" ? `the ${day}${suffix} of ` : "";
  return `${approx}${dayPart}${monthName}, Year ${date.year}${eraPart}`;
}

async function initTimelinePage() {
  const session = await requireAuth();
  if (!session) return;
  renderAuthStatus();
  applySpellsNavVisibility();
  applyCategoryConfig();
  applySiteTheme();
  applyAiEnabledGating(); // hides "Find dates in lore" (.ai-action) for AI-off accounts
  loadAndRenderTimeline();
}

// Bug batch 1, Phase 3 -- same back/forward-cache staleness fix as
// archive/js/calendarPage.js: this page renders once on load, so a page
// restored by Back/Forward after editing the calendar would show the old
// month names. Reload when restored from the bfcache.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

// Bug batch 1, Phase 4 -- "Sync timeline": POST /api/timeline/sync-entry-dates
// (lib/timelineEvents.js#backfillEntryDateEvents). Additive + idempotent,
// no AI cost; reports created / already-present / skipped-invalid counts
// and re-renders the list.
async function syncTimelineEntryDates() {
  const btn = document.getElementById("tl-sync-btn");
  const status = document.getElementById("tl-sync-status");
  if (!btn) return;
  btn.disabled = true;
  status.textContent = "Syncing…";
  try {
    const res = await authFetch("/api/timeline/sync-entry-dates", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sync failed.");
    const parts = [`${data.created} added`, `${data.alreadyPresent} already on the Timeline`];
    if (data.skippedInvalid) parts.push(`${data.skippedInvalid} skipped (${data.noCalendar ? "no calendar yet" : "don't fit the current calendar"})`);
    status.textContent = parts.join(" · ") + "." + (data.migrationRequired
      ? " Some dates couldn't be added yet -- the app needs a database update (migration 039). Try Sync again once it's applied."
      : "");
    if (data.created) await loadAndRenderTimeline();
  } catch (err) {
    console.error("Timeline sync failed:", err);
    status.textContent = "Something went wrong: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("tl-sync-btn");
  if (btn) btn.addEventListener("click", syncTimelineEntryDates);
});

// ---------- Find dates in lore (bug batch 1, Phase 4) ----------
// POST /api/timeline/extract-lore-dates costs one generation and returns
// proposals only; the DM ticks which to keep and POST
// /api/timeline/confirm-lore-dates writes just those (re-validated
// server-side). Possible duplicates of existing events start UNticked.
// Everything model-written goes through textContent, never innerHTML.

function tlEl(tag, props, children) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k === "text") node.textContent = v;
    else if (k === "style") node.style.cssText = v;
    else node[k] = v;
  });
  (children || []).forEach((c) => c && node.appendChild(c));
  return node;
}

function renderLoreProposals(result) {
  const panel = document.getElementById("tl-lore-review");
  panel.innerHTML = "";
  panel.style.display = "block";
  const proposals = result.proposals || [];
  panel.appendChild(tlEl("h2", { text: "Dates found in your lore", style: "font-family: var(--font-display); text-transform: uppercase; font-size: 1rem; margin: 0 0 6px;" }));
  const notes = [];
  if (!proposals.length) notes.push("No new datable events found.");
  else notes.push("Tick the ones to add. Nothing is saved until you click Add. \"c.\" marks an approximate date.");
  if (result.truncated) notes.push("Your lore is long, so only the first part was read.");
  if (result.droppedCount) notes.push(`${result.droppedCount} suggestion${result.droppedCount === 1 ? " was" : "s were"} dropped because the date didn't fit your calendar or the quote couldn't be found in your lore.`);
  panel.appendChild(tlEl("p", { text: notes.join(" "), style: "color: var(--ink-faint); font-size: 0.82rem; margin: 0 0 12px;" }));

  const rows = proposals.map((p, i) => {
    const box = tlEl("input", { type: "checkbox", checked: !p.possibleDuplicateOf, id: `tl-lore-${i}` });
    const summaryInput = tlEl("input", { type: "text", value: p.summary, style: "flex:1; min-width: 200px; background: var(--bg-panel); border: 1px solid var(--border-line); color: var(--ink); padding: 6px 8px;" });
    const meta = tlEl("div", { style: "font-size: 0.78rem; color: var(--ink-faint); margin: 4px 0 0 26px;" }, [
      tlEl("span", { text: p.quote ? `“${p.quote}”` : "" }),
      tlEl("span", { text: p.sectionTitle ? ` — ${p.sectionTitle}` : "" })
    ]);
    const dup = p.possibleDuplicateOf
      ? tlEl("div", { text: `Possible duplicate of: ${p.possibleDuplicateOf}`, style: "font-size: 0.78rem; color: var(--neon-primary); margin: 2px 0 0 26px;" })
      : null;
    const row = tlEl("div", { style: "padding: 10px 0; border-bottom: 1px solid var(--border-line-soft);" }, [
      tlEl("div", { style: "display:flex; gap:10px; align-items:center; flex-wrap:wrap;" }, [
        box,
        tlEl("strong", { text: p.dateLabel, style: "font-family: var(--font-mono); font-size: 0.8rem; min-width: 180px;" }),
        summaryInput
      ]),
      meta,
      dup
    ]);
    return { row, box, summaryInput, proposal: p };
  });
  rows.forEach((r) => panel.appendChild(r.row));

  const status = tlEl("span", { style: "font-family: var(--font-mono); font-size: 0.78rem; color: var(--ink-faint);" });
  const addBtn = tlEl("button", { type: "button", text: "Add selected to Timeline", style: "background: var(--neon-primary); color: var(--bg-void); border: none; padding: 9px 16px; font-family: var(--font-display); text-transform: uppercase; font-size: 0.8rem; cursor: pointer; font-weight: 600;" });
  const closeBtn = tlEl("button", { type: "button", text: "Close", style: "background: none; border: 1px solid var(--border-line); color: var(--ink-dim); padding: 8px 14px; font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; cursor: pointer;" });
  closeBtn.addEventListener("click", () => { panel.style.display = "none"; panel.innerHTML = ""; });
  if (!proposals.length) addBtn.style.display = "none";
  addBtn.addEventListener("click", async () => {
    const events = rows.filter((r) => r.box.checked).map((r) => ({
      summary: r.summaryInput.value,
      worldDate: r.proposal.worldDate,
      sectionTitle: r.proposal.sectionTitle
    }));
    if (!events.length) { status.textContent = "Nothing ticked."; return; }
    addBtn.disabled = true;
    status.textContent = "Adding…";
    try {
      const res = await authFetch("/api/timeline/confirm-lore-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Adding failed.");
      const extra = [];
      if (data.skippedDuplicate) extra.push(`${data.skippedDuplicate} already there`);
      if (data.skippedInvalid) extra.push(`${data.skippedInvalid} no longer valid`);
      status.textContent = `Added ${data.created}.${extra.length ? ` (${extra.join(", ")})` : ""}`;
      rows.forEach((r) => { if (r.box.checked) { r.box.checked = false; r.box.disabled = true; } });
      await loadAndRenderTimeline();
    } catch (err) {
      console.error("Adding lore dates failed:", err);
      status.textContent = "Something went wrong: " + err.message;
    } finally {
      addBtn.disabled = false;
    }
  });
  panel.appendChild(tlEl("div", { style: "display:flex; gap:12px; align-items:center; margin-top: 14px; flex-wrap: wrap;" }, [addBtn, closeBtn, status]));
}

async function findLoreDates() {
  const btn = document.getElementById("tl-lore-btn");
  const status = document.getElementById("tl-sync-status");
  btn.disabled = true;
  status.textContent = "Reading your lore for dates (uses 1 generation)…";
  if (typeof showGenerationOverlay === "function") showGenerationOverlay(["Reading your lore…", "Looking for dates…", "Checking them against your calendar…", "Almost there…"]);
  try {
    const res = await authFetch("/api/timeline/extract-lore-dates", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(typeof formatGenerationError === "function" ? formatGenerationError(data, { asHtml: false }) : (data.message || data.error));
    status.textContent = "";
    renderLoreProposals(data);
  } catch (err) {
    console.error("Finding lore dates failed:", err);
    status.textContent = err.message;
  } finally {
    if (typeof hideGenerationOverlay === "function") hideGenerationOverlay();
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("tl-lore-btn");
  if (btn) btn.addEventListener("click", findLoreDates);
});
