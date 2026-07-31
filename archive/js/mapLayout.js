// archive/js/mapLayout.js
//
// Tier 3 map layout: faction clusters form the macro structure (each
// faction's locations grouped into their own region of the canvas), with
// a force-directed pass WITHIN each cluster for organic spacing. See
// phase_locations_addendum.md's "Session update" section for why this
// hybrid was chosen over pure-faction-clustering (too sparse at low
// counts) or pure-force-directed (loses the "whose territory is this"
// visual logic).
//
// DELIBERATE SIMPLIFICATION: positions are recomputed fresh on every
// page load from the current location/faction list, never persisted.
// Adding or removing a location reflows the whole map -- there's no
// "this location always sits at this exact pixel" guarantee across
// sessions. Jitter/ordering is deterministic (hash-seeded, not
// Math.random) so a page reload with NO data changes produces the same
// layout, but a changed roster will visibly reflow. Flagged as a known
// trade-off, not an oversight -- persisting coordinates would mean
// storing x/y per location (Tier 2's approach) and reconciling them with
// a live force simulation, which defeats the point of computing the
// layout at all.

// Deterministic string hash -> a seeded PRNG (mulberry32), so jitter is
// stable across reloads without needing Math.random().
function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// locations: array of {id, name, faction} (faction may be null/undefined/"unaligned")
// factionOrder: array of faction ids in this world's own display order (from /api/entries/factions)
// anchorOverrides: optional { [factionKey]: {x, y} } in canvas-space
// coordinates (0-1000 / 0-600), from a vision analysis of the actual
// backdrop image (see routes/map.js's detectFactionAnchors -- normalized
// 0-1 coordinates get multiplied up to canvas space before reaching
// here). Per-faction: a faction WITH a real detected anchor uses it
// exactly; any faction without one falls back to the circular default
// below, same as if no overrides were passed at all. This is what
// closes the gap every earlier attempt this session left open -- pin
// placement can now be grounded in what the image actually shows,
// instead of pure abstract geometry with zero relationship to the art.
// Returns: { [factionKey]: {x, y} } -- one anchor per faction actually
// represented among the given locations (plus "unaligned" if any
// location has no faction).
function computeFactionAnchors(locations, factionOrder, radiusMultiplier = 0.32, anchorOverrides = {}) {
  const WIDTH = 1000, HEIGHT = 600;
  const centerX = WIDTH / 2, centerY = HEIGHT / 2;
  const clusterRadius = Math.min(WIDTH, HEIGHT) * radiusMultiplier;

  const byFaction = {};
  locations.forEach((loc) => {
    const key = loc.faction && loc.faction !== "unaligned" ? loc.faction : "unaligned";
    if (!byFaction[key]) byFaction[key] = [];
    byFaction[key].push(loc);
  });

  const orderedKeys = [];
  factionOrder.forEach((f) => { if (byFaction[f]) orderedKeys.push(f); });
  Object.keys(byFaction).forEach((k) => {
    if (k !== "unaligned" && !orderedKeys.includes(k)) orderedKeys.push(k);
  });
  if (byFaction["unaligned"]) orderedKeys.push("unaligned");

  const clusterCount = orderedKeys.length;
  const anchors = {};
  orderedKeys.forEach((key, i) => {
    if (anchorOverrides[key]) {
      anchors[key] = anchorOverrides[key];
      return;
    }
    if (clusterCount <= 1) {
      anchors[key] = { x: centerX, y: centerY };
      return;
    }
    const angle = (i / clusterCount) * Math.PI * 2 - Math.PI / 2;
    anchors[key] = {
      x: centerX + clusterRadius * Math.cos(angle),
      y: centerY + clusterRadius * Math.sin(angle)
    };
  });
  return anchors;
}


// Returns: array of {id, name, faction, x, y} in a 1000x600 canvas.
function computeMapLayout(locations, factionOrder, anchorOverrides = {}) {
  const WIDTH = 1000, HEIGHT = 600, PADDING = 60;
  const anchors = computeFactionAnchors(locations, factionOrder, 0.32, anchorOverrides);

  // Seed each node's initial position at its cluster anchor + a small
  // deterministic jitter, so the force simulation doesn't start every
  // node in a cluster stacked exactly on top of each other.
  const nodes = locations.map((loc) => {
    const key = loc.faction && loc.faction !== "unaligned" ? loc.faction : "unaligned";
    const anchor = anchors[key] || { x: WIDTH / 2, y: HEIGHT / 2 };
    const rand = mulberry32(hashString(loc.id));
    const jitterAngle = rand() * Math.PI * 2;
    const jitterR = 15 + rand() * 25;
    return {
      id: loc.id,
      name: loc.name,
      faction: loc.faction,
      x: anchor.x + Math.cos(jitterAngle) * jitterR,
      y: anchor.y + Math.sin(jitterAngle) * jitterR,
      anchorX: anchor.x,
      anchorY: anchor.y
    };
  });

  // Force-directed pass: global repulsion (keeps any two nodes from
  // overlapping, even across clusters) + a spring pulling each node back
  // toward its own cluster anchor (keeps clusters cohesive rather than
  // drifting into one blob).
  const ITERATIONS = 150;
  const REPULSION = 1400;
  const SPRING = 0.02;
  const MIN_DIST = 8;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const forces = nodes.map(() => ({ fx: 0, fy: 0 }));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (dist < MIN_DIST) dist = MIN_DIST;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        forces[i].fx += fx; forces[i].fy += fy;
        forces[j].fx -= fx; forces[j].fy -= fy;
      }
    }

    nodes.forEach((n, i) => {
      forces[i].fx += (n.anchorX - n.x) * SPRING;
      forces[i].fy += (n.anchorY - n.y) * SPRING;
      n.x += forces[i].fx * 0.05;
      n.y += forces[i].fy * 0.05;
      n.x = Math.max(PADDING, Math.min(WIDTH - PADDING, n.x));
      n.y = Math.max(PADDING, Math.min(HEIGHT - PADDING, n.y));
    });
  }

  return nodes.map((n) => ({
    id: n.id, name: n.name, faction: n.faction,
    x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10
  }));
}
