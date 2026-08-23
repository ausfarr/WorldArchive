// archive/js/siteHeader.js
//
// Single shared header, injected into every archive page in place of the
// literal <header> block that used to be duplicated (with per-depth "../"
// hrefs) across 23 HTML files. See session_addendum_header_nav_grouping_shipped.md
// for the full story -- short version: the flat nav grew to 19 tabs after
// the Session Prep Companion feature landed (Session Packets/Recap/Timeline/
// Suggestions/Calendar) and started overflowing its own container width
// with no dropdown/grouping support at all. This groups the session-prep
// tabs and the campaign-structure tabs behind two dropdowns and centralizes
// the markup so the next nav change is a one-file edit instead of 23.
//
// Root-absolute hrefs (/factions/index.html, not ../factions/index.html)
// are safe here because server.js serves archive/ at "/"
// (app.use(express.static(path.join(__dirname, "archive")))) -- so this
// exact same markup is correct regardless of how deep the current page
// lives, and every page's <script src="/js/siteHeader.js"> tag is
// identical too.
//
// This script MUST run synchronously (no defer/async/type=module) and be
// placed exactly where <header> used to sit in the HTML. It replaces
// itself via document.currentScript during initial parsing, before any
// later script tag or DOMContentLoaded handler runs -- render.js's
// applySpellsNavVisibility() / applyCategoryConfigToDom() (called from
// each page's own init block) and initSiteSearch() (bound on
// DOMContentLoaded) all depend on #nav-*, #site-search-input,
// #site-search-results, and #auth-status already existing in the DOM by
// the time they run, exactly as they did with the old inline markup.
(function () {
  var HEADER_HTML =
    '<header class="site-header">' +
      '<div class="wrap">' +
        '<div class="site-title"><a href="/index.html"><span id="site-title-text">The <span class="accent">Archive</span></span></a></div>' +
        '<nav class="site-nav">' +
          '<a href="/factions/index.html" id="nav-factions">Factions</a>' +
          '<a href="/npcs/index.html" id="nav-npcs">NPCs</a>' +
          '<a href="/enemies/index.html" id="nav-enemies">Bestiary</a>' +
          '<a href="/classes/index.html" id="nav-classes">Classes</a>' +
          '<a href="/items/index.html" id="nav-items">Items</a>' +
          '<a href="/spells/index.html" id="nav-spells" style="display:none;">Spells</a>' +
          '<a href="/logs/index.html" id="nav-logs">Logs</a>' +
          '<a href="/survivors/index.html" id="nav-survivors">PCs</a>' +
          '<a href="/locations/index.html" id="nav-locations">Locations</a>' +
          '<div class="nav-group" id="nav-group-campaigns">' +
            '<button type="button" class="nav-group-toggle" aria-expanded="false">Campaigns ▾</button>' +
            '<div class="nav-group-menu">' +
              '<a href="/campaigns/index.html" id="nav-quests">Quests</a>' +
              '<a href="/campaign-arcs/index.html" id="nav-campaign-arcs">Campaigns</a>' +
            '</div>' +
          '</div>' +
          '<div class="nav-group" id="nav-group-sessions">' +
            '<button type="button" class="nav-group-toggle" aria-expanded="false">Sessions ▾</button>' +
            '<div class="nav-group-menu">' +
              '<a href="/calendar/index.html" id="nav-calendar">Calendar</a>' +
              '<a href="/session-packets/index.html" id="nav-session-packets">Session Packets</a>' +
              '<a href="/session-recap/index.html" id="nav-session-recap">Recap</a>' +
              '<a href="/timeline/index.html" id="nav-timeline">Timeline</a>' +
              '<a href="/pending-updates/index.html" id="nav-pending-updates">Suggestions</a>' +
            '</div>' +
          '</div>' +
          '<a href="/map.html" id="nav-map">Map</a>' +
          '<a href="/world-info.html" id="nav-world-info">World Info</a>' +
          '<a href="/settings.html" id="nav-settings">Settings</a>' +
          '<div class="site-search">' +
            '<input type="text" id="site-search-input" placeholder="Search the archive…" autocomplete="off">' +
            '<div id="site-search-results" class="site-search-results"></div>' +
          '</div>' +
          '<span id="auth-status" style="font-family: var(--font-mono); font-size: 0.72rem;"></span>' +
        '</nav>' +
      '</div>' +
    '</header>';

  document.currentScript.outerHTML = HEADER_HTML;

  function initNavGroups() {
    var groups = document.querySelectorAll(".site-nav .nav-group");

    function closeAll(except) {
      groups.forEach(function (g) {
        if (g !== except) {
          g.classList.remove("open");
          var btn = g.querySelector(".nav-group-toggle");
          if (btn) btn.setAttribute("aria-expanded", "false");
        }
      });
    }

    groups.forEach(function (group) {
      var toggle = group.querySelector(".nav-group-toggle");
      if (!toggle) return;
      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = !group.classList.contains("open");
        closeAll(willOpen ? group : null);
        group.classList.toggle("open", willOpen);
        toggle.setAttribute("aria-expanded", String(willOpen));
      });
    });

    document.addEventListener("click", function () { closeAll(null); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll(null);
    });
  }

  function applyActiveNavHighlight() {
    var currentPath = window.location.pathname.replace(/\/$/, "") || "/index.html";
    document.querySelectorAll(".site-nav a[id^='nav-']").forEach(function (link) {
      var linkPath = link.getAttribute("href");
      if (linkPath === currentPath) {
        link.classList.add("active");
        var group = link.closest(".nav-group");
        if (group) {
          var toggle = group.querySelector(".nav-group-toggle");
          if (toggle) toggle.classList.add("active");
        }
      }
    });
  }

  initNavGroups();
  applyActiveNavHighlight();
})();
