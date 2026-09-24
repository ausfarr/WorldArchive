// archive/js/timeline.js
//
// Session Prep Companion, Phase 6 -- basic Timeline browse page. Pure
// read/render -- all three trigger sources already wrote their events at
// confirm-time (see lib/timelineEvents.js); this just lists and links
// them. The rich calendar view (overlaying these on an actual month
// grid) is Phase 8 -- this is intentionally just a chronological list.

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

function timelineEntryLink(ref) {
  if (!ref || !ref.entryId) return "";
  return `<a href="../dossier.html?category=${escapeHtmlForSearch(ref.category)}&id=${escapeHtmlForSearch(ref.entryId)}">${escapeHtmlForSearch(ref.category)}: ${escapeHtmlForSearch(ref.entryId)}</a>`;
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
    if (!events.length) {
      empty.style.display = "block";
      host.innerHTML = "";
      return;
    }
    empty.style.display = "none";

    host.innerHTML = events.map((e) => {
      const dateLabel = e.worldDate ? formatWorldDateClient(e.worldDate, calendarConfig) : "(undated)";
      // lore_date events (Phase 4) come from World Lore prose, not an
      // entry -- link to World Info rather than a dossier that doesn't exist.
      const sourceHref = e.sourceType === "lore_date"
        ? "../world-info.html"
        : `../dossier.html?category=${escapeHtmlForSearch(e.sourceCategory)}&id=${escapeHtmlForSearch(e.sourceId)}`;
      const sourceLink = `<a href="${sourceHref}">${escapeHtmlForSearch(SOURCE_LABELS[e.sourceType] || e.sourceType)}</a>`;
      const sessionBadge = e.sessionNumber ? `<span class="tag">Session ${e.sessionNumber}</span>` : "";
      const linkedEntries = (e.linkedEntryIds || []).map(timelineEntryLink).filter(Boolean).join(", ");
      const factionNudges = (e.linkedFactionIds || []).map((fk) => {
        const fac = factionLookup[fk];
        const name = fac ? fac.name : fk;
        return `<span style="color:var(--ink-faint);">⟳ <a href="../dossier.html?category=factions&id=${escapeHtmlForSearch(fk)}">${escapeHtmlForSearch(name)}</a> Roundup may be stale — regenerate?</span>`;
      }).join(" ");

      return `
        <div class="entry-card">
          <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:baseline;">
            <strong>${escapeHtmlForSearch(dateLabel)}</strong>
            ${sessionBadge}
          </div>
          <p style="margin:6px 0;">${escapeHtmlForSearch(e.summary)}</p>
          <p style="color:var(--ink-faint); font-size:0.8rem; margin:0;">Source: ${sourceLink}${linkedEntries ? ` — Linked: ${linkedEntries}` : ""}</p>
          ${factionNudges ? `<p style="font-size:0.78rem; margin:6px 0 0;">${factionNudges}</p>` : ""}
        </div>`;
    }).join("");
  } catch (err) {
    console.error("Loading Timeline failed:", err);
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
