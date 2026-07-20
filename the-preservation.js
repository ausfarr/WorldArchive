<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Archive</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <div class="site-title"><a href="index.html">The <span class="accent">Archive</span></a></div>
    <nav class="site-nav">
      <a href="factions/index.html">Factions</a>
      <a href="npcs/index.html">NPCs</a>
      <a href="enemies/index.html">Bestiary</a>
      <a href="classes/index.html">Classes</a>
      <a href="items/index.html">Items</a>
      <a href="logs/index.html">Logs</a>
      <a href="survivors/index.html">Survivors</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <div class="crumb"><a href="index.html">Archive</a><span class="sep">/</span><a id="crumb-category" href="#"></a><span class="sep">/</span><span id="crumb-name"></span></div>

  <div class="sheet">
    <div class="sheet-header">
      <p class="sheet-eyebrow" id="sheet-eyebrow"></p>
      <h1 id="sheet-title"></h1>
      <p class="subtitle" id="sheet-subtitle"></p>
      <div id="sheet-tags"></div>
    </div>

    <div class="sheet-body" id="sheet-body"></div>

    <div class="sheet-footer" id="sheet-footer"></div>
  </div>
</div>

<footer class="site-footer">
  <div class="wrap">ECHOES OF THE NEON — INTERNAL ARCHIVE BUILD</div>
</footer>

<script src="js/render.js"></script>
<script>loadAndRenderDossier();</script>

</body>
</html>
