// Beta-access waitlist form -- posts to the real app.chronicled.world
// backend (routes/waitlist.js), not a stub. No-ops safely if the form
// markup isn't present on the page.
(function () {
  var form = document.getElementById('waitlist-form');
  if (!form) return;

  var input = document.getElementById('waitlist-email');
  var button = document.getElementById('waitlist-submit');
  var status = document.getElementById('waitlist-status');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = input.value.trim();
    if (!email) return;

    button.disabled = true;
    button.textContent = 'Sending…';
    status.textContent = '';
    status.className = 'signup-status';

    fetch('https://app.chronicled.world/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: 'landing_page' })
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (result.ok) {
          form.style.display = 'none';
          status.textContent = "You're on the list — we'll email you when a beta slot opens.";
          status.className = 'signup-status success';
        } else {
          throw new Error(result.data && result.data.error ? result.data.error : 'Something went wrong.');
        }
      })
      .catch(function (err) {
        status.textContent = err.message || 'Something went wrong. Please try again.';
        status.className = 'signup-status error';
        button.disabled = false;
        button.textContent = 'Request beta access';
      });
  });
})();
