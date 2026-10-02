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

  // ---------- Scene 3/5 DOM prep ----------
  var categories = document.getElementById('categories');
  var catGrid = categories && categories.querySelector('.cat-grid');
  var catCards = categories ? Array.prototype.slice.call(categories.querySelectorAll('.cat-card')) : [];
  var demo = document.getElementById('demo');
  var live = document.getElementById('live');
  var liveFrames = live ? Array.prototype.slice.call(live.querySelectorAll('.live-frame')) : [];
  var liveVps = [], liveImgs = [];
  liveFrames.forEach(function (frame) {
    // Crop box so the screenshot can pan inside the frame (transform only).
    var img = frame.querySelector('img');
    if (!img) return;
    var vp = document.createElement('div'); vp.className = 'live-viewport';
    img.parentNode.insertBefore(vp, img); vp.appendChild(img);
    liveVps.push(vp); liveImgs.push(img);
  });

  // ---------- Scene 6/7/8 DOM prep ----------
  // Decoration-only overlays (formula highlight, pink word, button glow) are
  // real elements so GSAP can animate opacity on them; CSS keeps them at
  // opacity:0 so they only ever show when a scene drives them.
  var sample = document.getElementById('sample');
  var sampleRows = [], sampleHls = [], abilityCard = null;
  if (sample) {
    var rowEls = Array.prototype.slice.call(sample.querySelectorAll('table.derived tr')).slice(1); // [0] is the header row
    rowEls.forEach(function (tr) {
      var cell = tr.querySelector('td.formula');
      if (!cell) return;
      var txt = cell.textContent;
      cell.textContent = '';
      var fx = document.createElement('span'); fx.className = 'fx'; fx.textContent = txt;
      var hl = document.createElement('span'); hl.className = 'fx-hl'; hl.setAttribute('aria-hidden', 'true'); hl.textContent = txt;
      fx.appendChild(hl); cell.appendChild(fx);
      sampleRows.push(tr); sampleHls.push(hl);
    });
    abilityCard = sample.querySelector('.ability-card');
  }

  var origin = document.getElementById('origin');
  var originNote = origin && origin.querySelector('.origin-note');
  var originWords = [], originPink = [], pinkFrom = -1;
  if (originNote) {
    // Split every paragraph into word spans, descending into <em> so
    // "Echoes of the Neon" keeps its italics; words inside <em> also get a
    // pink duplicate layer (a colour shift done as an opacity fade).
    (function split(node, inEm) {
      Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) {
          var frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement('span'); w.className = 'w'; w.textContent = part;
            if (inEm) {
              var pk = document.createElement('span'); pk.className = 'w-pink'; pk.setAttribute('aria-hidden', 'true'); pk.textContent = part;
              w.appendChild(pk); originPink.push(pk);
              if (pinkFrom < 0) pinkFrom = originWords.length;
            }
            frag.appendChild(w); originWords.push(w);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1) {
          split(ch, inEm || ch.tagName === 'EM');
        }
      });
    })(originNote, false);
  }

  var cta = document.getElementById('cta');
  var ctaHead = cta && cta.querySelector('h2');
  var ctaBtn = cta && cta.querySelector('.btn-primary');
  var ctaHalo = null;
  if (ctaBtn) {
    ctaHalo = document.createElement('span'); ctaHalo.className = 'btn-halo'; ctaHalo.setAttribute('aria-hidden', 'true');
    ctaBtn.appendChild(ctaHalo);
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

    // ---- CATEGORIES: pinned, vertical scroll drives a horizontal track ----
    if (categories && catGrid && catCards.length) {
      categories.classList.add('is-staged');
      var n = catCards.length;
      var proxy = { p: 0 };
      var geo = { left: 0, w: 0, gap: 14, vw: 0 };
      var setX = gsap.quickSetter(catGrid, 'x', 'px');
      // quickSetter can't take the 'scale' shorthand (it expands to two props).
      var setSX = catCards.map(function (c) { return gsap.quickSetter(c, 'scaleX'); });
      var setSY = catCards.map(function (c) { return gsap.quickSetter(c, 'scaleY'); });
      var setO = catCards.map(function (c) { return gsap.quickSetter(c, 'opacity'); });
      function measureCats() {
        gsap.set(catGrid, { x: 0 });
        geo.left = catGrid.getBoundingClientRect().left;
        geo.w = catCards[0].offsetWidth;
        geo.gap = parseFloat(getComputedStyle(catGrid).columnGap) || 14;
        geo.vw = document.documentElement.clientWidth;
      }
      // One source of truth (proxy.p, scrubbed): drives the track position AND
      // each card's emphasis, so card state can never disagree with where
      // the track actually is. Card i is centred when p*(n-1) == i.
      function applyCats() {
        var pos = proxy.p * (n - 1), step = geo.w + geo.gap;
        var x0 = geo.vw / 2 - geo.w / 2 - geo.left;
        setX(x0 - pos * step);
        for (var i = 0; i < n; i++) {
          var d = Math.min(Math.abs(i - pos), 1);
          var sc = 1.1 - 0.2 * d;
          setSX[i](sc); setSY[i](sc);
          setO[i](1 - 0.6 * d);
        }
      }
      measureCats(); applyCats();
      var ctl = gsap.timeline({
        scrollTrigger: {
          trigger: categories, start: pinStart,
          end: function () { return '+=' + Math.round(window.innerHeight * 0.45 * (n - 1) * 1.1); },
          pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true,
          onRefresh: function () { measureCats(); applyCats(); }
        }
      });
      ctl.to(proxy, { p: 1, duration: 1, ease: 'none', onUpdate: applyCats }, 0);
      ctl.set({}, {}, 1.1); // brief hold on the last card before the pin releases
      registerScene('categories', ctl.scrollTrigger);
    }

    // ---- DEMO: entrance only. No pin, no scroll listeners, no pointer
    // handling: the widget must stay fully interactive. clearProps removes
    // the transform once it lands so nothing lingers on the widget. ----
    if (demo) {
      var dHead = demo.querySelector('.section-head'), dWidget = demo.querySelector('.demo-widget');
      [dHead, dWidget].forEach(function (el, k) {
        if (!el) return;
        gsap.from(el, {
          opacity: 0, y: k ? 60 : 24, scale: k ? 0.96 : 1, duration: 0.8, ease: 'power3.out',
          clearProps: 'opacity,transform',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true }
        });
      });
    }

    // ---- LIVE: pinned crossfade between the two real screenshots ----
    if (live && liveFrames.length === 2 && liveImgs.length === 2) {
      live.classList.add('is-staged');
      // Pinned scene needs both images ready; lazy loading would pop in
      // mid-pin. (Only changed here, in JS; the HTML stays identical to index.)
      liveImgs.forEach(function (im) { im.loading = 'eager'; });
      var LSTEP = 0.6;
      var panY = function (i) {
        return function () { return -0.3 * Math.max(0, liveImgs[i].offsetHeight - liveVps[i].offsetHeight); };
      };
      var ltl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: live, start: pinStart,
          end: function () { return '+=' + Math.round(window.innerHeight * LSTEP * 2.7); },
          pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true
        }
      });
      gsap.set(liveFrames[1], { opacity: 0, scale: 1.04 });
      ltl.fromTo(liveImgs[0], { y: 0 }, { y: panY(0), duration: 1.1 }, 0.2);
      ltl.to(liveFrames[0], { opacity: 0, scale: 0.96, duration: 0.6, ease: 'power1.inOut' }, 1.0);
      ltl.to(liveFrames[1], { opacity: 1, scale: 1, duration: 0.6, ease: 'power1.inOut' }, 1.0);
      ltl.fromTo(liveImgs[1], { y: 0 }, { y: panY(1), duration: 1.0 }, 1.6);
      ltl.set({}, {}, 2.7);
      registerScene('live', ltl.scrollTrigger);
    }

    // ---- SAMPLE: pinned. Copy stays put; derived-stats rows land one by one
    // (formula highlighted as it lands), then the ability card slides in. ----
    if (sample && sampleRows.length) {
      sample.classList.add('is-staged');
      var SSTEP = 0.6;
      var stl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: sample, start: pinStart,
          end: function () { return '+=' + Math.round(window.innerHeight * SSTEP * 3.5); },
          pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true
        }
      });
      gsap.set(sampleRows, { opacity: 0 });
      gsap.set(sampleHls, { opacity: 0 });
      if (abilityCard) gsap.set(abilityCard, { opacity: 0, x: 40 });
      sampleRows.forEach(function (row, i) {
        var at = 0.2 + i * 0.6;
        stl.to(row, { opacity: 1, duration: 0.3 }, at);
        stl.to(sampleHls[i], { opacity: 1, duration: 0.2 }, at + 0.2);
        // Highlight hands off to the next row as it lands.
        if (i > 0) stl.to(sampleHls[i - 1], { opacity: 0, duration: 0.3 }, at + 0.2);
      });
      var cardAt = 0.2 + sampleRows.length * 0.6;
      stl.to(sampleHls[sampleHls.length - 1], { opacity: 0, duration: 0.3 }, cardAt);
      if (abilityCard) stl.to(abilityCard, { opacity: 1, x: 0, duration: 0.6, ease: 'power2.out' }, cardAt);
      stl.set({}, {}, cardAt + 0.9);
      registerScene('sample', stl.scrollTrigger);
    }

    // ---- ORIGIN: scrubbed word-by-word, dim -> ink. Not pinned: at pull-text
    // size the passage is taller than a short viewport, so a pin would clip it. ----
    if (origin && originNote && originWords.length) {
      origin.classList.add('is-staged');
      var otl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: originNote, start: 'top 80%', end: 'bottom 55%', scrub: 0.4, invalidateOnRefresh: true }
      });
      var EACH = 0.1, DUR = 0.4;
      // Armed state set explicitly: with ~100 staggered from() tweens only the
      // first got its dim start value applied at load, so later words showed
      // full ink until the playhead reached them.
      gsap.set(originWords, { opacity: 0.25 });
      otl.fromTo(originWords, { opacity: 0.25 }, { opacity: 1, duration: DUR, stagger: EACH }, 0);
      if (originPink.length) otl.to(originPink, { opacity: 1, duration: 0.3, stagger: EACH }, pinkFrom * EACH + 0.2);
    }

    // ---- CTA: headline scales up into place (scrubbed). clamp() because
    // this is the last, short section: on a tall window the page can't
    // scroll far enough to reach a plain 'top 45%' and the scale would stall. ----
    if (ctaHead) {
      gsap.from(ctaHead, {
        scale: 0.8, opacity: 0.3, ease: 'none', transformOrigin: '50% 50%',
        scrollTrigger: { trigger: cta, start: 'clamp(top 90%)', end: 'clamp(top 45%)', scrub: 0.5 }
      });
    }

    return function () {
      if (hero) hero.classList.remove('is-staged');
      if (sample) sample.classList.remove('is-staged');
      if (origin) origin.classList.remove('is-staged');
      delete scenes.sample;
      if (categories) categories.classList.remove('is-staged');
      if (live) live.classList.remove('is-staged');
      delete scenes.categories; delete scenes.live;
      // The Categories track/cards are driven by quickSetter, which
      // matchMedia's revert doesn't know about: without this, resizing to
      // mobile leaves every card stuck at its desktop scale/opacity.
      if (catGrid) gsap.set([catGrid].concat(catCards), { clearProps: 'transform,opacity' });
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
    // CTA headline: one-shot scale-in (the scrubbed version is desktop-only).
    if (ctaHead) {
      gsap.from(ctaHead, {
        scale: 0.9, opacity: 0, duration: 0.7, ease: 'power2.out', clearProps: 'opacity,transform',
        scrollTrigger: { trigger: ctaHead, start: 'top 88%', once: true }
      });
    }
  });


  // ---------- CTA button glow: one shot, never loops ----------
  // Created outside matchMedia because it's identical in both modes and
  // doesn't depend on layout. The halo fades up once when the button first
  // scrolls into view, then settles at a faint steady glow.
  if (ctaHalo) {
    ScrollTrigger.create({
      trigger: ctaBtn, start: 'top 85%', once: true,
      onEnter: function () {
        gsap.timeline()
          .fromTo(ctaHalo, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' })
          .to(ctaHalo, { opacity: 0.4, duration: 1.2, ease: 'power1.inOut' });
      }
    });
  }

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
  // The demo widget changes height when it runs (idle -> result card is
  // ~300px taller). Everything pinned below it (Live, Sample...) would keep
  // stale start positions, so re-measure whenever the widget resizes. Watching
  // only: demo-widget.js itself is untouched.
  var demoWidget = document.getElementById('demo-widget');
  if (demoWidget && 'ResizeObserver' in window) new ResizeObserver(queueRefresh).observe(demoWidget);

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
