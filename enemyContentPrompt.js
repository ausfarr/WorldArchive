@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Work+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root {
  --bg-void: #0a0b0d;
  --bg-panel: #14161a;
  --bg-panel-raised: #1c1f24;
  --border-line: #2a2d33;
  --border-line-soft: #202226;
  --ink: #e4e1d6;
  --ink-dim: #9a9ca3;
  --ink-faint: #5c5f66;

  --neon-primary: #ff2f6e;
  --neon-cyan: #29f0d1;

  --preservation: #7fb8c9;
  --ferro-kings: #c9502e;
  --the-board: #c9a227;
  --colony: #6fae6a;
  --glitch-kin: #a13fd6;

  --font-display: 'Oswald', sans-serif;
  --font-body: 'Work Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--bg-void);
  color: var(--ink);
  font-family: var(--font-body);
  line-height: 1.6;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px);
}

a { color: var(--neon-cyan); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px; }

.wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }

/* ---------- Header ---------- */
.site-header {
  position: sticky; top: 0; z-index: 50;
  background: rgba(10,11,13,0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--border-line);
}
.site-header .wrap { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; padding-bottom: 14px; }
.site-title {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: 0.06em;
  font-size: 1.15rem;
  text-transform: uppercase;
  color: var(--ink);
}
.site-title a { color: inherit; }
.site-title a:hover { text-decoration: none; }
.site-title .accent { color: var(--neon-primary); }
.site-nav { display: flex; gap: 20px; flex-wrap: wrap; }
.site-nav a {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-dim);
}
.site-nav a:hover { color: var(--neon-cyan); text-decoration: none; }

/* ---------- Breadcrumb ---------- */
.crumb {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-faint);
  letter-spacing: 0.03em;
  padding: 18px 0 0;
}
.crumb a { color: var(--ink-dim); }
.crumb .sep { margin: 0 6px; color: var(--ink-faint); }

/* ---------- Neon flicker title ---------- */
.flicker-title {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--neon-primary);
  text-shadow: 0 0 6px rgba(255,47,110,0.55), 0 0 18px rgba(255,47,110,0.25);
  animation: neon-settle 2.1s steps(1) 1;
}
@keyframes neon-settle {
  0%   { opacity: 1; }
  4%   { opacity: 0.2; }
  8%   { opacity: 1; }
  12%  { opacity: 0.15; }
  16%  { opacity: 1; }
  40%  { opacity: 1; }
  43%  { opacity: 0.3; }
  46%  { opacity: 1; }
  100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .flicker-title { animation: none; }
}

/* ---------- Hero ---------- */
.hero { padding: 64px 0 40px; border-bottom: 1px solid var(--border-line); }
.hero h1 { font-size: clamp(2rem, 5vw, 3.2rem); margin: 0 0 10px; }
.hero p.dek { color: var(--ink-dim); max-width: 640px; font-size: 1.02rem; margin: 0; }
.hero .status-line {
  font-family: var(--font-mono); font-size: 0.72rem; color: var(--ink-faint);
  margin-top: 22px; letter-spacing: 0.05em; text-transform: uppercase;
}
.hero .status-line .dot { color: var(--neon-cyan); }

/* ---------- Hub grid (index page) ---------- */
.hub-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px; padding: 40px 0 60px;
}
.category-card {
  position: relative;
  background: var(--bg-panel);
  border: 1px solid var(--border-line);
  padding: 22px 20px 20px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.category-card:hover { border-color: var(--ink-faint); transform: translateY(-2px); }
.category-card::before, .category-card::after {
  content: ''; position: absolute; width: 5px; height: 5px; border-radius: 50%;
  background: var(--ink-faint); top: 10px;
}
.category-card::before { left: 10px; }
.category-card::after { right: 10px; }
.category-card h2 {
  font-family: var(--font-display); text-transform: uppercase; font-size: 1.1rem;
  letter-spacing: 0.03em; margin: 4px 0 8px; color: var(--ink);
}
.category-card p { color: var(--ink-dim); font-size: 0.88rem; margin: 0 0 14px; }
.category-card .count {
  font-family: var(--font-mono); font-size: 0.7rem; color: var(--neon-cyan);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.category-card a.card-link { position: absolute; inset: 0; }

/* ---------- Entry list (category index pages) ---------- */
.entry-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px; padding: 32px 0 60px;
}
.entry-card {
  position: relative;
  background: var(--bg-panel);
  border: 1px solid var(--border-line);
  border-left: 3px solid var(--fac-color, var(--ink-faint));
  padding: 16px 18px;
}
.entry-card h3 { font-family: var(--font-display); font-size: 1rem; margin: 0 0 4px; letter-spacing: 0.02em; }
.entry-card .role { font-size: 0.82rem; color: var(--ink-dim); margin: 0 0 8px; }
.entry-card a.card-link { position: absolute; inset: 0; }
.entry-card .tags { display: flex; gap: 6px; flex-wrap: wrap; }

.entry-card.locked { opacity: 0.5; border-left-color: var(--border-line); }
.entry-card.locked h3 { color: var(--ink-faint); }
.entry-card.locked::after {
  content: 'NOT YET ARCHIVED';
  font-family: var(--font-mono); font-size: 0.62rem; letter-spacing: 0.08em;
  color: var(--ink-faint);
}

/* ---------- Tags / pills ---------- */
.tag {
  display: inline-block; font-family: var(--font-mono); font-size: 0.65rem;
  letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 8px;
  border: 1px solid var(--border-line); color: var(--ink-dim); border-radius: 2px;
}
.tag.fac { color: var(--bg-void); font-weight: 600; border: none; background: var(--fac-color, var(--ink-faint)); }
.tag.tier-boss { color: var(--neon-primary); border-color: var(--neon-primary); }
.tag.tier-elite { color: var(--neon-cyan); border-color: var(--neon-cyan); }

/* ---------- Dossier sheet (individual entry pages) ---------- */
.sheet {
  margin: 32px 0 80px;
  background: var(--bg-panel);
  border: 1px solid var(--border-line);
  border-top: 3px solid var(--fac-color, var(--neon-primary));
}
.sheet-header { padding: 32px 32px 24px; border-bottom: 1px solid var(--border-line-soft); }
.sheet-eyebrow {
  font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fac-color, var(--ink-dim)); margin: 0 0 8px;
}
.sheet-header h1 { font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.4rem); margin: 0 0 6px; }
.sheet-header .subtitle { color: var(--ink-dim); font-size: 0.95rem; margin: 0 0 16px; }
.sheet-body { padding: 28px 32px 36px; }
.sheet-body h2 {
  font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.03em;
  font-size: 1.05rem; color: var(--fac-color, var(--neon-cyan)); margin: 32px 0 14px;
  border-bottom: 1px solid var(--border-line-soft); padding-bottom: 8px;
}
.sheet-body h2:first-child { margin-top: 0; }

.quote-block {
  border-left: 3px solid var(--fac-color, var(--neon-primary));
  padding: 4px 0 4px 18px; margin: 0 0 20px;
  font-style: italic; color: var(--ink); font-size: 1.02rem;
}
.flavor {
  color: var(--ink-dim); font-style: italic; font-size: 0.92rem;
  border-left: 3px solid var(--border-line); padding-left: 18px; margin: 0 0 8px;
}

.portrait-slot {
  border: 1px dashed var(--ink-faint);
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-align: center;
  padding: 40px 16px;
  margin: 0 0 24px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.portrait-slot .sub { display: block; margin-top: 6px; font-size: 0.65rem; color: var(--ink-faint); text-transform: none; letter-spacing: 0; }

.portrait-img {
  width: 100%;
  max-height: 440px;
  object-fit: cover;
  border: 1px solid var(--border-line);
  margin: 0 0 24px;
  display: block;
}

table.stat-table, table.derived-table {
  width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.85rem;
  margin-bottom: 18px;
}
table.stat-table th, table.stat-table td,
table.derived-table th, table.derived-table td {
  border: 1px solid var(--border-line); padding: 8px 12px; text-align: left;
}
table.stat-table th, table.derived-table th { color: var(--ink-dim); font-weight: 500; background: var(--bg-panel-raised); }
table.derived-table td.formula { color: var(--ink-faint); font-size: 0.78rem; }

.ability {
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-line);
  padding: 16px 18px; margin-bottom: 12px;
}
.ability .ability-name {
  font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.02em;
  font-size: 0.95rem; color: var(--ink); margin: 0 0 4px;
}
.ability .ability-name .kind { color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; margin-left: 8px; }
.ability .flavor { margin: 6px 0 10px; }
.ability p { margin: 4px 0; font-size: 0.9rem; }
.ability .eff-label { color: var(--fac-color, var(--neon-cyan)); font-weight: 600; }

.rel-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.rel-table th, .rel-table td { border-bottom: 1px solid var(--border-line-soft); padding: 10px 8px; text-align: left; vertical-align: top; }
.rel-table th { color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; }

.sheet-footer {
  border-top: 1px solid var(--border-line-soft);
  padding: 16px 32px;
  font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-faint);
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
}

.dialogue-block { background: var(--bg-panel-raised); border: 1px solid var(--border-line); padding: 16px 18px; margin-bottom: 10px; }
.dialogue-block .speaker { color: var(--fac-color, var(--neon-cyan)); font-weight: 600; font-size: 0.85rem; }
.dialogue-block .branch-label { font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; color: var(--ink-faint); letter-spacing: 0.05em; display: block; margin: 14px 0 6px; }

footer.site-footer {
  border-top: 1px solid var(--border-line);
  padding: 28px 0 60px; color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.7rem;
}
