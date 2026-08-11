// archive/js/themeBootstrap.js
//
// Applies a cached custom theme (background/panel/ink/accent colors,
// display/body fonts -- set via the Style Guide wizard step or
// Settings) BEFORE first paint, so a returning visitor never sees a
// flash of the default theme before JS swaps it out. This only works
// because the <script> tag loading this file is placed immediately
// after the stylesheet link, still render-blocking (no async/defer),
// in <head> -- moving it later, or adding async/defer, brings back the
// flash this exists to prevent.
//
// Previously an identical ~30-line inline <script> block, byte-for-byte
// duplicated across 5 pages (dossier.html, index.html, map.html,
// settings.html, world-info.html) -- any bugfix meant editing all 5 by
// hand. Extracted here since it really was pure duplication (unlike the
// worldforge_category_config_cache bootstrap also on those pages, which
// differs per page and isn't a clean extraction candidate).
(function() {
  try {
    var cached = localStorage.getItem('worldforge_theme_cache');
    if (!cached) return;
    var t = JSON.parse(cached);
    var hex = /^#[0-9a-fA-F]{6}$/;
    var overrides = [];
    if (hex.test(t.backgroundColor)) overrides.push('--bg-void: ' + t.backgroundColor + ';');
    if (hex.test(t.panelColor)) overrides.push('--bg-panel: ' + t.panelColor + '; --bg-panel-raised: ' + t.panelColor + ';');
    if (hex.test(t.inkColor)) overrides.push('--ink: ' + t.inkColor + ';');
    if (hex.test(t.primaryColor)) overrides.push('--neon-primary: ' + t.primaryColor + ';');
    if (hex.test(t.secondaryColor)) overrides.push('--neon-cyan: ' + t.secondaryColor + ';');
    if (t.fontDisplay) {
      overrides.push("--font-display: '" + t.fontDisplay + "', sans-serif;");
      var l1 = document.createElement('link');
      l1.rel = 'stylesheet';
      l1.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(t.fontDisplay).replace(/%20/g, '+') + ':wght@400;600;700&display=swap';
      document.head.appendChild(l1);
    }
    if (t.fontBody) {
      overrides.push("--font-body: '" + t.fontBody + "', sans-serif;");
      var l2 = document.createElement('link');
      l2.rel = 'stylesheet';
      l2.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(t.fontBody).replace(/%20/g, '+') + ':wght@400;500;600&display=swap';
      document.head.appendChild(l2);
    }
    var styleTag = document.createElement('style');
    styleTag.id = 'world-theme-cached';
    styleTag.textContent = ':root { ' + overrides.join(' ') + ' }';
    document.head.appendChild(styleTag);
  } catch (e) { /* no cache yet, or malformed -- fall back to default theme, async apply will fix it */ }
})();
