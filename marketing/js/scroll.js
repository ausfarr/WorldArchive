// Scroll-driven landing page TEST — only loaded by marketing/scroll-test.html.
// Vanilla JS + GSAP/ScrollTrigger (pinned CDN <script> tags, no build step).
//
// Failure contract: if GSAP/ScrollTrigger didn't load, or the visitor asked
// for reduced motion, this file returns before touching the DOM and the page
// stays the plain static stack. Hidden/initial states are armed here (via the
// `js-scroll` class on <html>), never in the HTML or unconditional CSS —
// same idea as js/reveal.js's .reveal-armed.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;
  if (!window.gsap || !window.ScrollTrigger) return;

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  // From here on CSS may apply hidden states under html.js-scroll.
  document.documentElement.classList.add('js-scroll');

  var header = document.querySelector('.site-header');

  // ---------- Header height -> --header-h ----------
  // The sticky header wraps on narrow widths, so measure instead of guessing.
  // Pinned scenes use this as their top offset so nothing slides under it.
  function measureHeader() {
    if (!header) return;
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
  measureHeader();

  // ---------- Scene registry (for anchor links) ----------
  // A browser's native #hash jump measures the element's *current* box. For a
  // section that ScrollTrigger has pinned (position:fixed while active) that
  // box is the wrong place, and anything below a pin only has the right
  // offset once pin-spacers exist (after load, not at first parse). So scenes
  // register their ScrollTrigger here and anchor clicks / initial hash use
  // st.start instead of the DOM position.
  var scenes = {};
  function registerScene(id, st) { scenes[id] = st; }

  function anchorTop(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var st = scenes[id];
    // Scenes define their own start (already offset for the header), so
    // st.start is exactly where the scene should be entered.
    if (st) return st.start;
    // Unpinned section: its own padding-top (76px) already clears the header,
    // matching how index.html lands on anchors today.
    return el.getBoundingClientRect().top + window.pageYOffset;
  }

  function jumpTo(id, smooth) {
    var top = anchorTop(id);
    if (top === null) return false;
    window.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'instant' });
    return true;
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    var id = a.getAttribute('href').slice(1);
    if (!document.getElementById(id)) return;
    e.preventDefault();
    jumpTo(id, true);
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });

  // ---------- Scroll-progress bar ----------
  var bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  (header || document.body).appendChild(bar);
  gsap.to(bar, {
    scaleX: 1, ease: 'none',
    scrollTrigger: {
      trigger: document.documentElement, start: 'top top', end: 'bottom bottom',
      scrub: 0
    }
  });

  // ---------- Nav active state ----------
  // Only the in-page nav links (#how, #demo) have a section to track; the
  // rest of the nav points at other pages. Active = section spans the
  // viewport's vertical midpoint.
  document.querySelectorAll('.site-nav a[href^="#"]').forEach(function (link) {
    var section = document.getElementById(link.getAttribute('href').slice(1));
    if (!section) return;
    ScrollTrigger.create({
      trigger: section, start: 'top center', end: 'bottom center',
      onToggle: function (self) { link.classList.toggle('active', self.isActive); }
    });
  });

  // ---------- Refresh hooks ----------
  // Pin positions depend on layout. Images have width/height attrs so they
  // don't shift layout, but lazy images and the Google-Fonts swap can still
  // change line wraps/heights, so re-measure when they land. Debounced so a
  // page of images doesn't trigger a refresh each.
  var refreshTimer = null;
  function queueRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { measureHeader(); ScrollTrigger.refresh(); }, 120);
  }
  document.querySelectorAll('img').forEach(function (img) {
    if (!img.complete) img.addEventListener('load', queueRefresh, { once: true });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueRefresh);

  // ---------- Initial #hash ----------
  // The browser already jumped on parse, before pin-spacers existed. Redo it
  // once everything's measured (load = images/fonts known).
  window.addEventListener('load', function () {
    measureHeader();
    ScrollTrigger.refresh();
    if (location.hash.length > 1) jumpTo(location.hash.slice(1), false);
  });

  // Exposed for the console while we're iterating on the experiment.
  window.__scrollTest = { scenes: scenes, registerScene: registerScene, jumpTo: jumpTo };
})();
