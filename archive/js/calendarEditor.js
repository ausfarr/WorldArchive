// archive/js/calendarEditor.js
//
// Bug batch 1, Phase 3 (session_addendum_bug_batch_1.md): the World
// Calendar editor, extracted from archive/settings.html (where it lived
// as ~130 lines of page-specific markup + JS) into one shared module.
// Its one host today is archive/wizard-calendar.html, in both of that
// page's modes: the required wizard step (between Lore and Factions) and
// the post-setup "edit" mode every already-completed world reaches from
// the Calendar/Timeline/World Info pages. The Settings section is gone.
//
// Usage:
//   const editor = createCalendarEditor(hostElement, { onChange });
//   await editor.init();              // loads presets + saved calendar
//   editor.isValid() / editor.validationError()
//   editor.isDirty()
//   await editor.save()               // impact warning -> POST; returns saved config or null if the DM backed out
//
// Escape discipline (unchanged from the Settings version): every DM/model
// string (month, era, weekday names) goes in and out through
// <input>.value / <option>.textContent -- never interpolated into
// innerHTML.
//
// Client-side validation below MIRRORS lib/calendar.js's
// validateCalendarConfigShape (no build step to share it). It only drives
// the Continue/Save button state and inline messages; the server
// re-validates on save and is the real gate.
//
// Weekday names are one input per day (they used to be a single
// comma-separated field). That's what makes the "Day 6" placeholders
// that routes/wizardCalendar.js pads a short AI list with visibly
// highlightable, and it removes the old failure mode where changing
// "Days per week" silently left a mismatched comma list that the server
// then rejected.

(function () {
  const PLACEHOLDER_WEEKDAY_RE = /^Day \d+$/; // lib/calendar.js#WEEKDAY_PLACEHOLDER_RE

  const STYLE_ID = "cal-editor-styles";
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cal-ed-section { margin-top: 22px; }
      .cal-ed-h { font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-dim); margin: 0 0 8px; }
      .cal-ed-input, .cal-ed-select { background: var(--bg-panel-raised); border: 1px solid var(--border-line); color: var(--ink); padding: 8px 10px; font-family: var(--font-body); font-size: 0.9rem; }
      .cal-ed-input.cal-ed-flag { border-color: var(--neon-primary); box-shadow: 0 0 0 1px var(--neon-primary) inset; }
      .cal-ed-label { display: flex; flex-direction: column; gap: 4px; font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-faint); }
      .cal-ed-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
      .cal-ed-month { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
      .cal-ed-month .cal-ed-idx { font-family: var(--font-mono); font-size: 0.72rem; color: var(--ink-faint); width: 22px; text-align: right; }
      .cal-ed-weekdays { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
      .cal-ed-btn { background: none; border: 1px solid var(--border-line); color: var(--ink-dim); padding: 7px 12px; font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; }
      .cal-ed-btn:disabled { opacity: 0.5; cursor: default; }
      .cal-ed-btn.cal-ed-ai { border-color: var(--neon-cyan); color: var(--neon-cyan); }
      .cal-ed-remove { background: none; border: none; color: var(--ink-faint); cursor: pointer; font-size: 1rem; padding: 2px 8px; }
      .cal-ed-remove:hover { color: var(--neon-primary); }
      .cal-ed-note { font-size: 0.8rem; color: var(--ink-faint); margin: 6px 0 0; line-height: 1.45; }
      .cal-ed-warn { font-size: 0.8rem; color: var(--neon-primary); margin: 6px 0 0; }
      .cal-ed-templates { background: var(--bg-panel-raised); border: 1px solid var(--border-line-soft); padding: 14px 16px; }
    `;
    document.head.appendChild(style);
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === "className") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  // Mirror of lib/calendar.js#validateCalendarConfigShape -- see header.
  function validateCalendarClient(cfg) {
    if (!cfg || !Array.isArray(cfg.months) || cfg.months.length === 0) return "Add at least one month.";
    for (let i = 0; i < cfg.months.length; i++) {
      const m = cfg.months[i];
      if (!m.name || !m.name.trim()) return `Month ${i + 1} needs a name.`;
      if (!Number.isInteger(m.days) || m.days < 1) return `"${m.name}" needs a whole number of days (1 or more).`;
    }
    if (!Number.isInteger(cfg.days_per_week) || cfg.days_per_week < 1) return "Days per week must be a whole number (1 or more).";
    if (cfg.weekday_names != null) {
      if (cfg.weekday_names.length !== cfg.days_per_week) return "Every day of the week needs a name (or leave them all blank).";
      if (cfg.weekday_names.some((w) => !w || !w.trim())) return "Every day of the week needs a name (or leave them all blank).";
    }
    const cd = cfg.current_date;
    if (!cd || !Number.isInteger(cd.year)) return "Set the current year.";
    if (!Number.isInteger(cd.month_index) || cd.month_index < 0 || cd.month_index >= cfg.months.length) return "Pick the current month.";
    const month = cfg.months[cd.month_index];
    if (!Number.isInteger(cd.day) || cd.day < 1 || cd.day > month.days) return `The current day must be between 1 and ${month.days} for ${month.name || "that month"}.`;
    return null;
  }

  function sameStructure(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Did the change touch anything stored dates depend on? (month count/
  // lengths, or the current year -- lib/calendar.js#validateWorldDate
  // bounds dates relative to it). Renames alone can't invalidate a date,
  // so they skip the impact round trip.
  function datesCouldBeAffected(prev, next) {
    if (!prev) return false;
    const prevDays = (prev.months || []).map((m) => m.days);
    const nextDays = (next.months || []).map((m) => m.days);
    const prevYear = prev.current_date && prev.current_date.year;
    const nextYear = next.current_date && next.current_date.year;
    return !sameStructure(prevDays, nextDays) || prevYear !== nextYear;
  }

  function createCalendarEditor(host, { onChange } = {}) {
    injectStyles();
    let savedConfig = null;      // last config known to be persisted
    let savedSnapshot = null;    // JSON of the editor's config at last load/save
    let presets = [];
    let suppressChange = false;

    // ---------- skeleton ----------
    const status = el("p", { className: "cal-ed-note", "aria-live": "polite" });

    // flex-basis + min-width:0 so the long "Label — description" option
    // text can't push the select past its panel.
    const templateSelect = el("select", { className: "cal-ed-select", "aria-label": "Calendar template", style: "flex: 1 1 260px; min-width: 0; max-width: 100%;" });
    const templateBtn = el("button", { type: "button", className: "cal-ed-btn", text: "Use template" });
    const generateBtn = el("button", { type: "button", className: "cal-ed-btn cal-ed-ai ai-action", text: "Generate for me" });
    const templates = el("div", { className: "cal-ed-templates" }, [
      el("p", { className: "cal-ed-h", text: "Start from a template" }),
      el("div", { className: "cal-ed-row" }, [templateSelect, templateBtn, generateBtn]),
      el("p", { className: "cal-ed-note", text: "Templates and Generate only fill in the editor below -- nothing is saved until you save. Edit anything afterward." })
    ]);

    const eraInput = el("input", { type: "text", className: "cal-ed-input", placeholder: "e.g. Age of Ash (optional)", style: "width: 240px;" });
    const dpwInput = el("input", { type: "number", className: "cal-ed-input", min: "1", max: "20", style: "width: 90px;" });
    const basics = el("div", { className: "cal-ed-section" }, [
      el("div", { className: "cal-ed-row" }, [
        el("label", { className: "cal-ed-label" }, [document.createTextNode("Era name"), eraInput]),
        el("label", { className: "cal-ed-label" }, [document.createTextNode("Days per week"), dpwInput])
      ])
    ]);

    const monthsList = el("div", {});
    const addMonthBtn = el("button", { type: "button", className: "cal-ed-btn", text: "+ Add month", style: "margin-top: 6px;" });
    const monthsSection = el("div", { className: "cal-ed-section" }, [
      el("p", { className: "cal-ed-h", text: "Months" }), monthsList, addMonthBtn,
      el("p", { className: "cal-ed-note", text: "No leap years or extra festival days -- every year has exactly these months. Add festivals as Notable Dates on the Calendar page instead." })
    ]);

    const weekdaysGrid = el("div", { className: "cal-ed-weekdays" });
    const weekdayWarn = el("p", { className: "cal-ed-warn", style: "display:none;" });
    const weekdaysSection = el("div", { className: "cal-ed-section" }, [
      el("p", { className: "cal-ed-h", text: "Days of the week" }), weekdaysGrid, weekdayWarn
    ]);

    const yearInput = el("input", { type: "number", className: "cal-ed-input", style: "width: 110px;" });
    const monthSelect = el("select", { className: "cal-ed-select" });
    const dayInput = el("input", { type: "number", className: "cal-ed-input", min: "1", style: "width: 80px;" });
    const currentSection = el("div", { className: "cal-ed-section" }, [
      el("p", { className: "cal-ed-h", text: "Current world date (where your campaign starts)" }),
      el("div", { className: "cal-ed-row" }, [
        el("label", { className: "cal-ed-label" }, [document.createTextNode("Year"), yearInput]),
        el("label", { className: "cal-ed-label" }, [document.createTextNode("Month"), monthSelect]),
        el("label", { className: "cal-ed-label" }, [document.createTextNode("Day"), dayInput])
      ])
    ]);

    const validationMsg = el("p", { className: "cal-ed-warn", style: "display:none;" });

    host.innerHTML = "";
    [templates, basics, monthsSection, weekdaysSection, currentSection, validationMsg, status].forEach((n) => host.appendChild(n));

    // ---------- months ----------
    function monthRow(month) {
      const idx = el("span", { className: "cal-ed-idx" });
      const name = el("input", { type: "text", className: "cal-ed-input cal-ed-month-name", placeholder: "Month name", value: month.name || "", style: "flex: 1; min-width: 140px;" });
      const days = el("input", { type: "number", className: "cal-ed-input cal-ed-month-days", min: "1", value: month.days != null ? String(month.days) : "30", style: "width: 80px;" });
      const remove = el("button", { type: "button", className: "cal-ed-remove", title: "Remove month", "aria-label": "Remove month", text: "✕" });
      const row = el("div", { className: "cal-ed-month" }, [idx, name, days, el("span", { className: "cal-ed-note", text: "days", style: "margin:0;" }), remove]);
      remove.addEventListener("click", () => {
        if (monthsList.children.length <= 1) return; // a calendar needs at least one month
        row.remove();
        refreshMonthDependents();
      });
      name.addEventListener("input", refreshMonthDependents);
      days.addEventListener("input", refreshMonthDependents);
      return row;
    }

    function readMonths() {
      return Array.from(monthsList.children).map((row) => ({
        name: row.querySelector(".cal-ed-month-name").value.trim(),
        days: parseInt(row.querySelector(".cal-ed-month-days").value, 10)
      }));
    }

    function refreshMonthDependents() {
      Array.from(monthsList.children).forEach((row, i) => { row.querySelector(".cal-ed-idx").textContent = `${i + 1}.`; });
      const prev = monthSelect.value;
      monthSelect.innerHTML = "";
      readMonths().forEach((m, i) => {
        monthSelect.appendChild(el("option", { value: String(i), text: m.name || `Month ${i + 1}` }));
      });
      if (prev !== "" && Number(prev) < monthSelect.options.length) monthSelect.value = prev;
      refreshDayMax();
      changed();
    }

    function refreshDayMax() {
      const m = readMonths()[Number(monthSelect.value)];
      if (m && Number.isInteger(m.days)) dayInput.max = String(m.days);
    }

    // ---------- weekdays ----------
    function renderWeekdays(names) {
      const n = parseInt(dpwInput.value, 10);
      const count = Number.isInteger(n) && n > 0 ? Math.min(n, 20) : 0;
      const existing = names || readWeekdayInputs();
      weekdaysGrid.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const input = el("input", { type: "text", className: "cal-ed-input cal-ed-weekday", placeholder: `Day ${i + 1} name`, value: existing[i] || "" });
        input.addEventListener("input", () => { flagPlaceholders(); changed(); });
        weekdaysGrid.appendChild(input);
      }
      flagPlaceholders();
    }

    function readWeekdayInputs() {
      return Array.from(weekdaysGrid.querySelectorAll(".cal-ed-weekday")).map((i) => i.value.trim());
    }

    // Highlights "Day 6"-style placeholders (a short AI list padded by
    // routes/wizardCalendar.js) so the DM renames them.
    function flagPlaceholders() {
      let flagged = 0;
      weekdaysGrid.querySelectorAll(".cal-ed-weekday").forEach((input) => {
        const isPlaceholder = PLACEHOLDER_WEEKDAY_RE.test(input.value.trim());
        input.classList.toggle("cal-ed-flag", isPlaceholder);
        if (isPlaceholder) flagged++;
      });
      weekdayWarn.style.display = flagged ? "block" : "none";
      weekdayWarn.textContent = flagged
        ? `${flagged} weekday name${flagged === 1 ? " is a placeholder" : "s are placeholders"} (highlighted) -- rename ${flagged === 1 ? "it" : "them"} if you like.`
        : "";
    }

    // ---------- read / write ----------
    function getConfig() {
      const names = readWeekdayInputs();
      const allBlank = names.every((w) => !w);
      const yearRaw = yearInput.value.trim();
      return {
        months: readMonths(),
        days_per_week: parseInt(dpwInput.value, 10),
        // All blank = no custom names (the Calendar page shows "Day 1..N");
        // partially filled is a validation error, never silently dropped.
        weekday_names: allBlank ? null : names,
        era_name: eraInput.value.trim(),
        current_date: {
          year: yearRaw === "" ? NaN : parseInt(yearRaw, 10),
          month_index: parseInt(monthSelect.value, 10),
          day: parseInt(dayInput.value, 10)
        }
      };
    }

    // A brand-new world starts BLANK on purpose (one empty month, no
    // year), not with a "Firstmonth" default: the wizard step is
    // required, and a pre-filled valid default would let Continue skip
    // it without the DM ever deciding anything.
    const BLANK = { months: [{ name: "", days: 30 }], days_per_week: 7, weekday_names: null, era_name: "", current_date: { year: null, month_index: 0, day: 1 } };

    function setConfig(cfg) {
      suppressChange = true;
      const c = cfg || BLANK;
      eraInput.value = c.era_name || "";
      dpwInput.value = String(c.days_per_week || 7);
      monthsList.innerHTML = "";
      (c.months && c.months.length ? c.months : BLANK.months).forEach((m) => monthsList.appendChild(monthRow(m)));
      renderWeekdays(c.weekday_names || []);
      const cd = c.current_date || BLANK.current_date;
      yearInput.value = Number.isInteger(cd.year) ? String(cd.year) : "";
      refreshMonthDependents();
      monthSelect.value = String(cd.month_index || 0);
      dayInput.value = String(cd.day || 1);
      refreshDayMax();
      suppressChange = false;
      changed();
    }

    function snapshot() { return JSON.stringify(getConfig()); }
    function isDirty() { return snapshot() !== savedSnapshot; }
    function validationError() { return validateCalendarClient(getConfig()); }

    function changed() {
      if (suppressChange) return;
      const err = validationError();
      validationMsg.style.display = err ? "block" : "none";
      validationMsg.textContent = err || "";
      if (onChange) onChange({ valid: !err, dirty: isDirty(), error: err });
    }

    function confirmReplace(what) {
      if (!isDirty()) return true;
      return window.confirm(`Replace what's in the editor with ${what}? Your unsaved changes will be lost.`);
    }

    // ---------- events ----------
    addMonthBtn.addEventListener("click", () => {
      monthsList.appendChild(monthRow({ name: "", days: 30 }));
      refreshMonthDependents();
      monthsList.lastChild.querySelector(".cal-ed-month-name").focus();
    });
    eraInput.addEventListener("input", changed);
    dpwInput.addEventListener("input", () => { renderWeekdays(); changed(); });
    yearInput.addEventListener("input", changed);
    monthSelect.addEventListener("change", () => { refreshDayMax(); changed(); });
    dayInput.addEventListener("input", changed);

    templateBtn.addEventListener("click", () => {
      const preset = presets.find((p) => p.id === templateSelect.value);
      if (!preset) return;
      if (!confirmReplace(`the "${preset.label}" template`)) return;
      setConfig(preset.calendarConfig);
      status.textContent = `Filled in from "${preset.label}" -- not saved yet. Tweak anything, then save.`;
    });

    generateBtn.addEventListener("click", async () => {
      if (!confirmReplace("a newly generated calendar")) return;
      generateBtn.disabled = true;
      status.textContent = "Generating…";
      if (typeof showGenerationOverlay === "function") showGenerationOverlay(["Counting the moons…", "Naming the months…", "Settling the week…", "Almost there…"]);
      try {
        const res = await authFetch("/api/wizard/generate-calendar", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error((typeof formatGenerationError === "function") ? formatGenerationError(data, { asHtml: false }) : (data.error || "Generation failed."));
        setConfig(data.calendarConfig);
        status.textContent = "Generated -- not saved yet. Review and edit, then save.";
      } catch (err) {
        console.error("Calendar generation failed:", err);
        status.textContent = "Something went wrong: " + err.message;
      } finally {
        if (typeof hideGenerationOverlay === "function") hideGenerationOverlay();
        generateBtn.disabled = false;
      }
    });

    // ---------- public API ----------
    async function init() {
      const [cfgRes, presetsRes] = await Promise.all([
        authFetch("/api/wizard/calendar-config"),
        authFetch("/api/wizard/calendar-presets")
      ]);
      const cfgData = await cfgRes.json();
      const presetsData = await presetsRes.json();
      if (!cfgRes.ok) throw new Error(cfgData.error || "Could not load the calendar.");
      presets = (presetsRes.ok && presetsData.presets) || [];
      templateSelect.innerHTML = "";
      templateSelect.appendChild(el("option", { value: "", text: presets.length ? "Choose a template…" : "(templates unavailable)" }));
      presets.forEach((p) => templateSelect.appendChild(el("option", { value: p.id, text: `${p.label} — ${p.description}` })));
      savedConfig = cfgData.calendarConfig || null;
      setConfig(savedConfig);
      savedSnapshot = snapshot();
      changed();
      return { calendarConfig: savedConfig, setupCompletedAt: cfgData.setupCompletedAt || null };
    }

    // Returns the saved config, or null if the DM cancelled at the
    // impact warning. Throws on validation/network errors.
    async function save() {
      const err = validationError();
      if (err) throw new Error(err);
      const calendarConfig = getConfig();

      if (datesCouldBeAffected(savedConfig, calendarConfig)) {
        status.textContent = "Checking existing dates…";
        const res = await authFetch("/api/wizard/calendar-impact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ calendarConfig })
        });
        const data = await res.json();
        if (res.ok && data.impact && data.impact.total > 0) {
          const i = data.impact;
          const lines = [];
          if (i.timelineEvents) lines.push(`• ${i.timelineEvents} Timeline event${i.timelineEvents === 1 ? "" : "s"}`);
          if (i.notableDates) lines.push(`• ${i.notableDates} Notable date${i.notableDates === 1 ? "" : "s"}`);
          if (i.entryDateFields) lines.push(`• ${i.entryDateFields} entry date field${i.entryDateFields === 1 ? "" : "s"} (founding/birth/etc.)`);
          const examples = (i.examples || []).length ? `\n\nFor example:\n${i.examples.map((e) => "  - " + e).join("\n")}` : "";
          const ok = window.confirm(
            `This change doesn't fit some dates already in your world:\n\n${lines.join("\n")}${examples}\n\n` +
            "They won't be changed or deleted -- they'll just show as out of range until you edit them (or change the calendar back). Save anyway?"
          );
          if (!ok) { status.textContent = "Not saved."; return null; }
        }
      }

      status.textContent = "Saving…";
      const res = await authFetch("/api/wizard/save-calendar-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarConfig })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      savedConfig = data.calendarConfig;
      setConfig(savedConfig);
      savedSnapshot = snapshot();
      changed();
      // Saving also backfills entry-date Timeline events server-side
      // (bug batch 1, Phase 4) -- say so when it actually added some.
      const sync = data.timelineSync;
      status.textContent = sync && sync.created
        ? `Saved. Added ${sync.created} founding/birth/other date${sync.created === 1 ? "" : "s"} to the Timeline.`
        : "Saved.";
      return savedConfig;
    }

    return {
      init,
      save,
      isDirty,
      isValid: () => !validationError(),
      validationError,
      hasSavedCalendar: () => !!savedConfig,
      setStatus: (text) => { status.textContent = text; }
    };
  }

  window.createCalendarEditor = createCalendarEditor;
  window.validateCalendarClient = validateCalendarClient;
})();
