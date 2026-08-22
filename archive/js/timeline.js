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
  chronicle: "Session Chronicle",
  log_date: "Log",
  regenerate: "Regenerate"
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
    if (!events.length) {
      empty.style.display = "block";
      host.innerHTML = "";
      return;
    }
    empty.style.display = "none";

    host.innerHTML = events.map((e) => {
      const dateLabel = e.worldDate ? formatWorldDateClient(e.worldDate, calendarConfig) : "(undated)";
      const sourceLink = `<a href="../dossier.html?category=${escapeHtmlForSearch(e.sourceCategory)}&id=${escapeHtmlForSearch(e.sourceId)}">${escapeHtmlForSearch(SOURCE_LABELS[e.sourceType] || e.sourceType)}</a>`;
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
  const dayPart = typeof day === "number" ? `the ${day}${suffix} of ` : "";
  const eraPart = eraName ? ` of the ${eraName}` : "";
  return `${dayPart}${monthName}, Year ${date.year}${eraPart}`;
}

async function initTimelinePage() {
  const session = await requireAuth();
  if (!session) return;
  renderAuthStatus();
  applySpellsNavVisibility();
  applyCategoryConfig();
  applySiteTheme();
  loadAndRenderTimeline();
}
