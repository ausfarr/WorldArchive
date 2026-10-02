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
  // Mobile URL-bar show/hide fires resize constantly; without this every one
  // would re-measure all pins and make them jump.
  ScrollTrigger.config({ ignoreMobileResize: true });

  // One switch for "full pinned experience" vs "simple one-shot reveals".
  // 901px matches style.css's own collapse point (hero + nav go single
  // column there); a stacked hero is taller than the viewport and would be
  // clipped if pinned. The height floor stops pinned scenes that need ~700px
  // of room from being cut off on short laptop windows.
  var DESKTOP = '(min-width: 901px) and (min-height: 680px)';
  var SIMPLE = '(max-width: 900px), (max-height: 679px)';

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
    // Instant, not smooth: a smooth scroll would play back through every
    // pinned scene on the way, which is slow and disorienting.
    jumpTo(id, false);
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });

  // ---------- Nav active state (scroll-spy) ----------
  // Only #how and #demo exist in the nav, so each link "owns" a run of
  // sections: How it works = how+categories, Try it = demo..origin. Per-section
  // ScrollTriggers can't do this: a pinned section's own box ends long before
  // its pin does. So compare scroll position to cached scene starts instead.
  var SPY_IDS = ['how', 'categories', 'demo', 'live', 'sample', 'origin', 'cta'];
  var NAV_OWNS = { '#how': ['how', 'categories'], '#demo': ['demo', 'live', 'sample', 'origin'] };
  var spyTops = [];
  var spyCurrent = null;
  function computeSpy() {
    spyTops = SPY_IDS.map(function (id) { var t = anchorTop(id); return t === null ? Infinity : t; });
  }
  ScrollTrigger.addEventListener('refresh', function () { computeSpy(); updateSpy(); });
  function updateSpy() {
    var y = window.pageYOffset + window.innerHeight * 0.5;
    var cur = null;
    for (var i = 0; i < SPY_IDS.length; i++) if (spyTops[i] <= y) cur = SPY_IDS[i];
    if (cur === spyCurrent) return;
    spyCurrent = cur;
    document.querySelectorAll('.site-nav a[href^="#"]').forEach(function (link) {
      var owns = NAV_OWNS[link.getAttribute('href')] || [];
      link.classList.toggle('active', owns.indexOf(cur) !== -1);
    });
  }

  // Plain passive scroll listener (rAF-throttled) instead of a ScrollTrigger
  // onUpdate: after a long instant jump (nav click) ScrollTrigger's first
  // update can lag, leaving the nav stale. This always fires.
  var spyQueued = false;
  window.addEventListener('scroll', function () {
    if (spyQueued) return;
    spyQueued = true;
    requestAnimationFrame(function () { spyQueued = false; updateSpy(); });
  }, { passive: true });

  // ---------- Scroll-progress bar ----------
  var bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  (header || document.body).appendChild(bar);
  gsap.to(bar, {
    scaleX: 1, ease: 'none',
    scrollTrigger: {
      // end:'max' + refreshPriority:-1: this trigger is created before any
      // pin, and ScrollTrigger measures in creation order, so a plain
      // 'bottom bottom' would be taken BEFORE the pin-spacers add their
      // height and the bar/spy would stop updating partway down the page.
      trigger: document.documentElement, start: 0, end: 'max',
      refreshPriority: -1, invalidateOnRefresh: true,
      scrub: 0
    }
  });

  // ---------- Shared helpers ----------
  function headerH() { return header ? header.offsetHeight : 0; }
  function pinStart() { return 'top top+=' + headerH(); }

  // Simple-mode reveal: fade/rise once when first scrolled into view, then
  // the trigger kills itself. clearProps leaves no stray transform behind.
  function oneShotReveal(el) {
    gsap.from(el, {
      opacity: 0, y: 24, duration: 0.6, ease: 'power2.out', clearProps: 'opacity,transform',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true }
    });
  }

  // ---------- Scene 1: HERO ----------
  // One-time DOM prep (visually neutral on its own): split the headline into
  // word spans, add a "halo" layer behind "archive" so the glow can be driven
  // with opacity only (animating text-shadow would repaint every frame), and
  // wrap the portrait in a crop box so it can zoom with transform:scale
  // without spilling out of its frame.
  var hero = document.querySelector('.hero');
  var heroWords = [], halo = null, sheet = null, portrait = null;
  if (hero) {
    var h1 = hero.querySelector('h1');
    if (h1) {
      Array.prototype.slice.call(h1.childNodes).forEach(function (node) {
        if (node.nodeType === 3) {
          var frag = document.createDocumentFragment();
          node.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement('span'); w.className = 'w'; w.textContent = part;
            frag.appendChild(w); heroWords.push(w);
          });
          h1.replaceChild(frag, node);
        } else if (node.nodeType === 1 && node.classList.contains('glow')) {
          node.classList.add('w'); heroWords.push(node);
          halo = document.createElement('span');
          halo.className = 'glow-halo'; halo.setAttribute('aria-hidden', 'true');
          halo.textContent = node.textContent;
          node.appendChild(halo);
        }
      });
    }
    sheet = hero.querySelector('.mock-sheet');
    var img = hero.querySelector('.mock-portrait-img');
    if (img) {
      portrait = document.createElement('div');
      portrait.className = 'portrait-crop';
      img.parentNode.insertBefore(portrait, img);
      portrait.appendChild(img);
      portrait = img;
    }
  }

  // ---------- Scene 2: HOW IT WORKS (DOM prep) ----------
  var how = document.getElementById('how');
  var flowDiagram = how && how.querySelector('.flow-diagram');
  var flowSteps = how ? Array.prototype.slice.call(how.querySelectorAll('.flow-step')) : [];
  var fileCards = how ? Array.prototype.slice.call(how.querySelectorAll('.steps .step')) : [];
  var flowFill = null, flowRings = [];
  if (flowDiagram) {
    // The progress line + per-step rings are real elements (not pseudo
    // elements) so GSAP can animate their transform/opacity directly. CSS
    // keeps them display:none unless #how has .is-staged.
    var line = document.createElement('div'); line.className = 'flow-line'; line.setAttribute('aria-hidden', 'true');
    flowFill = document.createElement('div'); flowFill.className = 'flow-line-fill';
    line.appendChild(flowFill); flowDiagram.appendChild(line);
    flowSteps.forEach(function (step) {
      var ring = document.createElement('span'); ring.className = 'flow-ring'; ring.setAttribute('aria-hidden', 'true');
      step.querySelector('.flow-icon').appendChild(ring); flowRings.push(ring);
    });
  }

  var mm = gsap.matchMedia();

  mm.add(DESKTOP, function () {
    // ---- HERO: pinned, scrubbed ----
    if (hero && sheet) {
      hero.classList.add('is-staged');
      var htl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: hero, start: pinStart,
          end: function () { return '+=' + Math.round(window.innerHeight * 1.0); },
          pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true
        }
      });
      // Words start as dim ghost text (not invisible) so the very first
      // screen still reads as a headline; the CTA/dek never hide.
      htl.from(heroWords, { opacity: 0.18, y: 22, stagger: 0.08, duration: 0.35, ease: 'power2.out' }, 0);
      if (halo) htl.from(halo, { opacity: 0, duration: 0.5 }, 0.3);
      htl.from(sheet, {
        rotationY: -24, rotationX: 7, x: 60, y: 40, scale: 0.93, opacity: 0.55,
        transformPerspective: 1100, duration: 0.65, ease: 'power2.out'
      }, 0);
      if (portrait) htl.fromTo(portrait, { scale: 1 }, { scale: 1.14, duration: 1 }, 0);
      htl.set({}, {}, 1.15); // short hold at the end before the pin releases
    }

    // ---- HOW IT WORKS: pinned, steps light in sequence ----
    if (how && flowDiagram && fileCards.length === 3 && flowSteps.length === 4) {
      how.classList.add('is-staged');
      var STEP = 0.6; // viewport-heights of scroll per timeline unit
      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: how, start: pinStart,
          end: function () { return '+=' + Math.round(window.innerHeight * STEP * 3.6); },
          pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true
        }
      });
      // Armed (initial) state: step 1 lit + File 01 showing, so the scene is
      // never empty when it first pins.
      gsap.set(flowSteps, { opacity: 0.35 });
      gsap.set(flowRings, { opacity: 0, scale: 0.8 });
      gsap.set(flowFill, { scaleX: 0 });
      gsap.set(fileCards, { opacity: 0, x: 40 });
      gsap.set(flowSteps[0], { opacity: 1 });
      gsap.set(flowRings[0], { opacity: 1, scale: 1 });
      gsap.set(fileCards[0], { opacity: 1, x: 0 });

      for (var i = 1; i <= 3; i++) {
        var at = 0.3 + (i - 1);
        tl.to(flowFill, { scaleX: i / 3, duration: 0.7 }, at);
        tl.to(flowSteps[i], { opacity: 1, duration: 0.2 }, at + 0.5);
        tl.to(flowRings[i], { opacity: 1, scale: 1, duration: 0.2, ease: 'back.out(2)' }, at + 0.5);
        // File cards: 3 cards for 4 steps, so Export (step 4) keeps File 03.
        if (i < 3) {
          tl.to(fileCards[i - 1], { opacity: 0, x: -40, duration: 0.3 }, at + 0.1);
          tl.to(fileCards[i], { opacity: 1, x: 0, duration: 0.35 }, at + 0.4);
        }
      }
      tl.set({}, {}, 3.6);
      registerScene('how', tl.scrollTrigger);
    }

    return function () {
      if (hero) hero.classList.remove('is-staged');
      if (how) how.classList.remove('is-staged');
      delete scenes.how;
    };
  });

  mm.add(SIMPLE, function () {
    // Hero: one-shot entrance on load, no pin, no 3D.
    if (hero) {
      var itl = gsap.timeline({ defaults: { ease: 'power2.out' } });
      itl.from(heroWords, { opacity: 0, y: 16, stagger: 0.07, duration: 0.5, clearProps: 'opacity,transform' }, 0);
      if (halo) itl.from(halo, { opacity: 0, duration: 0.8 }, 0.35);
      if (sheet) itl.from(sheet, { opacity: 0, y: 30, duration: 0.7, clearProps: 'opacity,transform' }, 0.2);
    }
    // Everything else: the site's own .reveal blocks, but one-shot via GSAP.
    document.querySelectorAll('.reveal').forEach(oneShotReveal);
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
  window.__scrollTest = { spy: function () { return spyTops; }, scenes: scenes, registerScene: registerScene, jumpTo: jumpTo };
})();
