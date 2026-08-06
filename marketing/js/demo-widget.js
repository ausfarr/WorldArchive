// Illustrative "Generate NPC" demo -- entirely client-side, no network
// calls, no account needed. Simulates the shape of a real generation
// (loading beats, then a filed dossier card) using one pre-written example.
// This is NOT the real generator and does not represent live output.
(function () {
  var stage = document.getElementById('demo-stage');
  var stateLabel = document.getElementById('demo-state-label');
  if (!stage || !stateLabel) return;

  var LOG_LINES = [
    'Reading world lore & established factions…',
    'Grounding character concept in existing archive…',
    'Drafting personality, motivation, voice…',
    'Computing derived stats from base attributes…',
    'Rendering portrait art…'
  ];

  var EXAMPLE = {
    eyebrow: 'NPC Entry — Auto-Filed',
    name: 'Warden Ilsabet Cray',
    sub: 'Faction Leader / Informant / Quiet Threat',
    quote: '"I keep the gate. What passes through it, and what doesn’t, is the only law that’s ever held here."',
    faction: 'The Hollow Concord',
    tier: 'Key NPC',
    stats: [['Body', '11'], ['Reflex', '13'], ['Presence', '18']]
  };

  function renderIdle() {
    stage.innerHTML =
      '<div class="demo-idle" id="demo-idle">' +
        '<p>This is a simulated run, not a live generation — the real generator grounds every result in your world’s own lore, factions, and stat system.</p>' +
        '<button class="btn-primary" id="demo-generate-btn" type="button">Generate NPC</button>' +
      '</div>';
    stateLabel.textContent = 'Idle';
    document.getElementById('demo-generate-btn').addEventListener('click', runDemo);
  }

  function renderLoading() {
    stateLabel.textContent = 'Generating…';
    var logHtml = LOG_LINES.map(function (line, i) {
      return '<span style="animation-delay:' + (i * 0.32) + 's">' + line + '</span>';
    }).join('');
    stage.innerHTML =
      '<div class="demo-loading">' +
        'Filing new entry<span class="demo-cursor">_</span>' +
        '<div class="demo-log">' + logHtml + '</div>' +
      '</div>';
  }

  function renderResult() {
    stateLabel.textContent = 'Filed';
    var statsRow = EXAMPLE.stats.map(function (s) { return '<th>' + s[0] + '</th>'; }).join('');
    var statsVals = EXAMPLE.stats.map(function (s) { return '<td>' + s[1] + '</td>'; }).join('');
    stage.innerHTML =
      '<div class="demo-result">' +
        '<div class="demo-result-card mock-sheet">' +
          '<div class="mock-header">' +
            '<p class="mock-eyebrow">' + EXAMPLE.eyebrow + '</p>' +
            '<h3>' + EXAMPLE.name + '</h3>' +
            '<p class="sub">' + EXAMPLE.sub + '</p>' +
          '</div>' +
          '<div class="mock-body">' +
            '<div class="mock-portrait">Portrait art would render here</div>' +
            '<p class="mock-quote">' + EXAMPLE.quote + '</p>' +
            '<table class="mock-stats"><tr>' + statsRow + '</tr><tr>' + statsVals + '</tr></table>' +
            '<div class="mock-tags"><span class="tag fac">' + EXAMPLE.faction + '</span><span class="tag">' + EXAMPLE.tier + '</span></div>' +
          '</div>' +
        '</div>' +
        '<button class="btn-secondary demo-again" type="button" id="demo-again-btn">Run it again</button>' +
      '</div>';
    document.getElementById('demo-again-btn').addEventListener('click', function () {
      renderIdle();
    });
  }

  function runDemo() {
    renderLoading();
    window.setTimeout(renderResult, LOG_LINES.length * 320 + 400);
  }

  renderIdle();
})();
