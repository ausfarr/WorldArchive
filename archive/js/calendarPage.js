// archive/js/calendarPage.js
//
// Session Prep Companion, Phase 8 -- Full Calendar Page (scope doc
// Section 4a-ii). A different *view* over data that already exists --
// Timeline events (Phase 6, GET /api/timeline-events) and calendar_config
// (Phase 2, GET /api/wizard/calendar-config) -- plus one new source,
// DM-added recurring notable dates (GET/POST/DELETE
// /api/calendar/notable-dates). No generation involved anywhere on this
// page.
//
// Weekday alignment is intentionally simple: each month's grid starts
// fresh at weekday column 0 on day 1, rather than continuously counting
// weekdays across month/year boundaries from some epoch. calendar_config
// has no stored "weekday of year 1, day 1" reference point to anchor a
// continuous count against, and nothing elsewhere in the app (Chronicle
// headers, Timeline entries) surfaces weekday names at all -- adding a
// fabricated epoch here would be inventing structure the DM never
// defined. Flagged in this phase's commit summary as a scope call, not
// an oversight.
//
// Multi-era/mid-campaign calendar resets are explicitly out of scope for
// this phase (scope doc's own note) -- not handled here.

let CAL_STATE = { calendarConfig: null, events: [], notableDates: [], year: null };

function calMonthLabel(m) {
  return escapeHtmlForSearch(m.name);
}

function calWeekdayHeaders(calendarConfig) {
  const n = calendarConfig.days_per_week || 7;
  const names = Array.isArray(calendarConfig.weekday_names) && calendarConfig.weekday_names.length === n
    ? calendarConfig.weekday_names
    : Array.from({ length: n }, (_, i) => `D${i + 1}`);
  return names.map((w) => `<div style="color:var(--ink-faint); text-align:center; font-family:var(--font-mono);">${escapeHtmlForSearch(w)}</div>`).join("");
}

// Groups this year's dated Timeline events by "monthIndex-day", and
// notable dates (recurring, no year) the same way -- one lookup a day
// cell can check for both kinds of marker.
function calBuildDayIndex(year) {
  const index = {};
  for (const e of CAL_STATE.events) {
    if (!e.worldDate || e.worldDate.year !== year) continue;
    const key = `${e.worldDate.monthIndex}-${e.worldDate.day}`;
    (index[key] = index[key] || { events: [], notableDates: [] }).events.push(e);
  }
  for (const nd of CAL_STATE.notableDates) {
    const key = `${nd.monthIndex}-${nd.day}`;
    (index[key] = index[key] || { events: [], notableDates: [] }).notableDates.push(nd);
  }
  return index;
}

function calRenderMonth(month, monthIndex, dayIndex, calendarConfig) {
  const daysPerWeek = calendarConfig.days_per_week || 7;
  const cells = [];
  for (let d = 1; d <= month.days; d++) {
    const key = `${monthIndex}-${d}`;
    const hit = dayIndex[key];
    const hasItems = hit && (hit.events.length || hit.notableDates.length);
    const isCurrent = calendarConfig.current_date && calendarConfig.current_date.month_index === monthIndex
      && calendarConfig.current_date.day === d && calendarConfig.current_date.year === CAL_STATE.year;
    const bg = hasItems ? "var(--neon-primary)" : "var(--bg-panel-raised)";
    const color = hasItems ? "var(--bg-void)" : "var(--ink-dim)";
    const border = isCurrent ? "2px solid var(--neon-cyan)" : "1px solid var(--border-line-soft)";
    cells.push(`<button type="button" class="cal-day-cell" data-month="${monthIndex}" data-day="${d}" ${hasItems ? "" : "disabled"}
      style="background:${bg}; color:${color}; border:${border}; padding:4px 0; font-family:var(--font-mono); font-size:0.72rem; cursor:${hasItems ? "pointer" : "default"};">${d}</button>`);
  }
  return `
    <div style="background: var(--bg-panel); border: 1px solid var(--border-line); padding: 12px;">
      <h3 style="margin:0 0 8px; font-family: var(--font-display); font-size:0.95rem; text-transform:uppercase;">${calMonthLabel(month)}</h3>
      <div style="display:grid; grid-template-columns: repeat(${daysPerWeek}, 1fr); gap:4px;">
        ${calWeekdayHeaders(calendarConfig)}
        ${cells.join("")}
      </div>
    </div>`;
}

function calRenderGrid() {
  const { calendarConfig, year } = CAL_STATE;
  document.getElementById("cal-year-label").textContent = `Year ${year}${calendarConfig.era_name ? ` of the ${calendarConfig.era_name}` : ""}`;
  const dayIndex = calBuildDayIndex(year);
  const host = document.getElementById("cal-months-grid");
  host.innerHTML = calendarConfig.months.map((m, i) => calRenderMonth(m, i, dayIndex, calendarConfig)).join("");
  host.querySelectorAll(".cal-day-cell:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => calShowDayDetail(Number(btn.dataset.month), Number(btn.dataset.day), dayIndex));
  });
  document.getElementById("cal-day-detail").style.display = "none";
}

function calTimelineEntryLink(ref) {
  if (!ref || !ref.entryId) return "";
  return `<a href="../dossier.html?category=${escapeHtmlForSearch(ref.category)}&id=${escapeHtmlForSearch(ref.entryId)}">${escapeHtmlForSearch(ref.category)}: ${escapeHtmlForSearch(ref.entryId)}</a>`;
}

const CAL_SOURCE_LABELS = { chronicle: "Session Chronicle", log_date: "Log", regenerate: "Regenerate", entry_date: "Entry Date" };

function calShowDayDetail(monthIndex, day, dayIndex) {
  const hit = dayIndex[`${monthIndex}-${day}`] || { events: [], notableDates: [] };
  const monthName = CAL_STATE.calendarConfig.months[monthIndex].name;
  const panel = document.getElementById("cal-day-detail");
  const eventsHtml = hit.events.map((e) => {
    const sourceLink = `<a href="../dossier.html?category=${escapeHtmlForSearch(e.sourceCategory)}&id=${escapeHtmlForSearch(e.sourceId)}">${escapeHtmlForSearch(CAL_SOURCE_LABELS[e.sourceType] || e.sourceType)}</a>`;
    const linked = (e.linkedEntryIds || []).map(calTimelineEntryLink).filter(Boolean).join(", ");
    return `<div style="margin-bottom:10px;"><p style="margin:0 0 4px;">${escapeHtmlForSearch(e.summary)}</p><p style="color:var(--ink-faint); font-size:0.78rem; margin:0;">Source: ${sourceLink}${linked ? ` — Linked: ${linked}` : ""}</p></div>`;
  }).join("");
  const notableHtml = hit.notableDates.map((nd) => `<div style="margin-bottom:8px;"><strong>${escapeHtmlForSearch(nd.name)}</strong>${nd.note ? ` — ${escapeHtmlForSearch(nd.note)}` : ""}</div>`).join("");
  panel.innerHTML = `<h3 style="margin:0 0 12px; font-family:var(--font-display); text-transform:uppercase; font-size:0.95rem;">${escapeHtmlForSearch(monthName)} ${day}</h3>${eventsHtml}${notableHtml}`;
  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function calRenderNotableList() {
  const host = document.getElementById("cal-notable-list");
  if (!CAL_STATE.notableDates.length) {
    host.innerHTML = `<p style="color:var(--ink-faint); font-size:0.85rem;">No notable dates added yet.</p>`;
    return;
  }
  host.innerHTML = CAL_STATE.notableDates.map((nd) => {
    const monthName = (CAL_STATE.calendarConfig.months[nd.monthIndex] || {}).name || `Month ${nd.monthIndex + 1}`;
    return `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-line-soft);">
      <span><strong>${escapeHtmlForSearch(nd.name)}</strong> — ${escapeHtmlForSearch(monthName)} ${nd.day}${nd.note ? ` <span style="color:var(--ink-faint);">(${escapeHtmlForSearch(nd.note)})</span>` : ""}</span>
      <button type="button" class="cal-nd-delete" data-id="${escapeHtmlForSearch(nd.id)}" style="background:none; border:1px solid var(--border-line); color:var(--ink-dim); padding:4px 10px; cursor:pointer; font-size:0.75rem;">Remove</button>
    </div>`;
  }).join("");
  host.querySelectorAll(".cal-nd-delete").forEach((btn) => {
    btn.addEventListener("click", () => calDeleteNotableDate(btn.dataset.id));
  });
}

async function calDeleteNotableDate(id) {
  try {
    const res = await authFetch(`/api/calendar/notable-dates/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Delete failed."); }
    CAL_STATE.notableDates = CAL_STATE.notableDates.filter((nd) => nd.id !== id);
    calRenderNotableList();
    calRenderGrid();
  } catch (err) {
    alert("Removing notable date failed: " + err.message);
  }
}

function calPopulateMonthSelect() {
  const sel = document.getElementById("cal-nd-month");
  sel.innerHTML = CAL_STATE.calendarConfig.months.map((m, i) => `<option value="${i}">${escapeHtmlForSearch(m.name)}</option>`).join("");
}

async function calHandleNotableFormSubmit(evt) {
  evt.preventDefault();
  const status = document.getElementById("cal-notable-status");
  const name = document.getElementById("cal-nd-name").value.trim();
  const monthIndex = Number(document.getElementById("cal-nd-month").value);
  const day = Number(document.getElementById("cal-nd-day").value);
  const note = document.getElementById("cal-nd-note").value.trim();
  try {
    const res = await authFetch("/api/calendar/notable-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, monthIndex, day, note: note || undefined })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Adding notable date failed.");
    CAL_STATE.notableDates.push(data.date);
    CAL_STATE.notableDates.sort((a, b) => (a.monthIndex - b.monthIndex) || (a.day - b.day));
    calRenderNotableList();
    calRenderGrid();
    document.getElementById("cal-notable-form").reset();
    status.textContent = "Added.";
  } catch (err) {
    status.textContent = "Error: " + err.message;
  }
}

async function initCalendarPage() {
  const session = await requireAuth();
  if (!session) return;
  renderAuthStatus();
  applySpellsNavVisibility();
  applyCategoryConfig();
  applySiteTheme();

  try {
    const [calRes, eventsRes, notableRes] = await Promise.all([
      authFetch("/api/wizard/calendar-config"),
      authFetch("/api/timeline-events"),
      authFetch("/api/calendar/notable-dates")
    ]);
    const calData = await calRes.json();
    const eventsData = await eventsRes.json();
    const notableData = await notableRes.json();

    const calendarConfig = calData.calendarConfig;
    document.getElementById("cal-loading").style.display = "none";
    if (!calendarConfig || !Array.isArray(calendarConfig.months) || !calendarConfig.months.length) {
      document.getElementById("cal-no-calendar").style.display = "block";
      return;
    }

    CAL_STATE.calendarConfig = calendarConfig;
    CAL_STATE.events = eventsData.events || [];
    CAL_STATE.notableDates = notableData.dates || [];
    CAL_STATE.year = (calendarConfig.current_date && calendarConfig.current_date.year) || 1;

    document.getElementById("cal-content").style.display = "block";
    calPopulateMonthSelect();
    calRenderNotableList();
    calRenderGrid();

    document.getElementById("cal-prev-year").addEventListener("click", () => { CAL_STATE.year -= 1; calRenderGrid(); });
    document.getElementById("cal-next-year").addEventListener("click", () => { CAL_STATE.year += 1; calRenderGrid(); });
    document.getElementById("cal-notable-form").addEventListener("submit", calHandleNotableFormSubmit);
  } catch (err) {
    console.error("Loading Calendar page failed:", err);
    document.getElementById("cal-loading").textContent = "Failed to load calendar.";
  }
}
