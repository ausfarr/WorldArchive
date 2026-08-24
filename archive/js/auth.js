// archive/js/auth.js
//
// Thin Supabase Auth wrapper for the static archive site. Every page that
// needs auth includes, in this order:
//   1. /config.js                                    (sets window.SUPABASE_CONFIG)
//   2. the Supabase JS CDN build                      (sets window.supabase)
//   3. this file
//
// Handles login/signup/logout, and exposes authFetch() -- a drop-in
// replacement for fetch() that attaches the current user's access token
// as a Bearer Authorization header, since every /api route now requires
// one (see middleware/resolveTenant.js).

// --- Admin "view as" mode -------------------------------------------------
//
// sessionStorage (not localStorage) is deliberate: this should reset when
// the tab/browser closes rather than silently persisting an admin's next
// normal session in "viewing someone else's world" mode.
const ADMIN_VIEW_STORAGE_KEY = "adminViewWorld"; // JSON: { worldId, worldName }

function getAdminViewWorld() {
  try {
    const raw = sessionStorage.getItem(ADMIN_VIEW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function setAdminViewWorld(worldId, worldName) {
  sessionStorage.setItem(ADMIN_VIEW_STORAGE_KEY, JSON.stringify({ worldId, worldName }));
}

function clearAdminViewWorld() {
  sessionStorage.removeItem(ADMIN_VIEW_STORAGE_KEY);
}

// Injects a fixed banner at the top of the page whenever admin view mode
// is active. Called from renderAuthStatus() below so every page that
// already renders auth status (i.e. every page in the app) gets this for
// free with no per-page HTML edits.
function renderAdminViewBanner() {
  const existing = document.getElementById("admin-view-banner");
  const viewing = getAdminViewWorld();
  if (!viewing) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return; // already rendered this page load

  const banner = document.createElement("div");
  banner.id = "admin-view-banner";
  banner.style.cssText =
    "position: sticky; top: 0; z-index: 1000; background: #4a2b00; color: #ffd479; " +
    "font-family: var(--font-mono, monospace); font-size: 0.8rem; text-align: center; " +
    "padding: 8px 12px; border-bottom: 1px solid #ffd479;";
  banner.innerHTML =
    `Read-only admin view — viewing "${viewing.worldName || "Untitled World"}". ` +
    `Actions are disabled. <a href="#" id="exit-admin-view-link" style="color: #ffd479; text-decoration: underline;">Exit view</a>`;
  document.body.prepend(banner);

  // Reuses the exact same CSS mechanism as the existing account-level AI
  // toggle (see render.js's applyAiEnabledGating() + style.css's
  // body.ai-disabled rules) -- css/style.css's selector list now includes
  // body.admin-view-mode alongside body.ai-disabled, so every AI-spend
  // control (Fill In, Regenerate, Generate with AI, field-level Help me,
  // portrait/battle-map generate) hides itself uniformly, including ones
  // rendered later (entry cards, edit overlays) without needing to
  // re-run this after every re-render. Non-AI mutating controls (Delete
  // This Entry, manual entry creation, image upload, map pin drag) are
  // NOT covered by this class yet -- they still rely on the click-time
  // alert in authFetch() and the real server-side 403. Worth widening
  // if that gap is ever felt in practice.
  document.body.classList.add("admin-view-mode");

  document.getElementById("exit-admin-view-link").onclick = (e) => {
    e.preventDefault();
    clearAdminViewWorld();
    window.location.href = "/admin.html";
  };
}

// --- Cloudflare Turnstile (auth abuse guard) --------------------------------
//
// signInAnonymously() below has zero friction (no email, no verification),
// so a scripted actor could loop it to farm unlimited free-tier
// allowances -- the original reason this was added. But Supabase's
// dashboard-side CAPTCHA requirement (Authentication -> Attack Protection),
// once enabled, applies to every GoTrue call, not just that one, so
// getTurnstileToken() is also called from signUp()/signIn() below --
// otherwise password auth gets rejected with "captcha protection: request
// disallowed (no captcha_token found)" the moment that dashboard setting
// is turned on. Loaded lazily -- only the moment one of these calls
// actually needs a fresh token, not on every page load -- and runs
// invisibly for the large majority of real visitors; only suspicious
// traffic sees an interactive challenge. window.TURNSTILE_CONFIG comes
// from /config.js (server.js), same pattern as window.SUPABASE_CONFIG.
// Missing site key (local dev without Turnstile configured yet) just
// means no client-side token is sent -- Supabase's own CAPTCHA
// requirement, once enabled in the dashboard, is the real enforcement
// point, so this never silently bypasses protection, it just means that
// request gets rejected server-side with a clear error instead.
let _turnstileLoadPromise = null;

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (_turnstileLoadPromise) return _turnstileLoadPromise;
  _turnstileLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Turnstile."));
    document.head.appendChild(script);
  });
  return _turnstileLoadPromise;
}

async function getTurnstileToken() {
  const siteKey = window.TURNSTILE_CONFIG && window.TURNSTILE_CONFIG.siteKey;
  if (!siteKey) return null;
  await loadTurnstileScript();
  return new Promise((resolve, reject) => {
    // Off-screen, not display:none -- Turnstile needs the widget to
    // actually render (even invisibly-styled) to run its checks; a
    // display:none container never executes.
    const container = document.createElement("div");
    container.style.cssText = "position:fixed; left:-9999px; top:-9999px;";
    document.body.appendChild(container);
    window.turnstile.render(container, {
      sitekey: siteKey,
      callback: (token) => {
        container.remove();
        resolve(token);
      },
      "error-callback": () => {
        container.remove();
        reject(new Error("Turnstile verification failed."));
      }
    });
  });
}

let _supabaseClient = null;

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  if (!window.SUPABASE_CONFIG || !window.supabase) {
    throw new Error(
      "Supabase client unavailable -- make sure /config.js and the Supabase " +
      "CDN script are both included before auth.js."
    );
  }
  _supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.publishableKey
  );
  return _supabaseClient;
}

async function getCurrentSession() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) return null;
  return data.session;
}

// Supabase's dashboard-side CAPTCHA requirement (Authentication -> Attack
// Protection), once enabled, applies to every GoTrue auth call -- not just
// signInAnonymously() above -- so email/password signup and sign-in need
// the same Turnstile token or they get rejected server-side with
// "captcha protection: request disallowed (no captcha_token found)".
async function signUp(email, password) {
  const captchaToken = await getTurnstileToken();
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined
  });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const captchaToken = await getTurnstileToken();
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined
  });
  if (error) throw error;
  return data;
}

// Converts the CURRENT anonymous session into a permanent one in place --
// same user id, same world, same everything already generated. This is
// Supabase's documented anonymous-to-permanent upgrade path
// (auth.updateUser), distinct from signUp() above, which would create an
// unrelated second account and orphan the anonymous work.
async function upgradeAnonymousAccount(email, password) {
  const { data, error } = await getSupabaseClient().auth.updateUser({ email, password });
  if (error) throw error;
  return data;
}

// Links an OAuth identity to the CURRENT anonymous session in place, same
// upgrade-not-replace reasoning as upgradeAnonymousAccount() above --
// distinct from signInWithOAuth() below, which starts a brand new
// identity/session instead of upgrading the current one.
async function linkOAuthIdentity(provider) {
  const { error } = await getSupabaseClient().auth.linkIdentity({
    provider,
    options: { redirectTo: window.location.origin + "/login.html" }
  });
  if (error) throw error;
}

// One-click OAuth sign-in/sign-up (same Supabase Auth user record either
// way -- Supabase treats "sign in" and "sign up" as the same call for
// OAuth providers, unlike the email/password form above which has two
// distinct methods). This does a full-page redirect to the provider and
// back to redirectTo, so there's nothing to return here -- the caller's
// code after this call never runs. On return, Supabase JS's default
// detectSessionInUrl behavior parses the auth response from the URL and
// populates getSession() before any of this page's own JS runs its
// getCurrentSession() check, so no extra callback-handling code is needed
// beyond what login.html already does.
async function signInWithOAuth(provider) {
  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + "/login.html" }
  });
  if (error) throw error;
}

async function signOut() {
  await getSupabaseClient().auth.signOut();
  window.location.href = "/login.html";
}

// Anonymous-by-default access (v1.1): every authenticated page already
// calls this once at load, so this is the single choke point that makes
// the whole app work for a brand-new visitor with no signup screen at
// all. If there's no session yet, silently mint a real (not fake,
// client-side-only) anonymous Supabase session via signInAnonymously()
// instead of redirecting to /login.html -- middleware/resolveTenant.js
// treats it exactly like any other session (real worldId, real persisted
// entries, the free-tier quota applies identically). Turnstile
// (getTurnstileToken above) guards this call against scripted abuse.
//
// Deliberately does NOT change authFetch()'s behavior below on a
// missing/expired session -- that path fires when a session EXPIRES
// mid-use, not on first visit, and silently minting a fresh anonymous
// session there would risk quietly dropping a real subscriber into a
// brand-new empty anonymous world on token expiry. Only this "no session
// at all yet" case is handled here.
async function requireAuth() {
  const session = await getCurrentSession();
  if (session) return session;

  try {
    const captchaToken = await getTurnstileToken();
    const { data, error } = await getSupabaseClient().auth.signInAnonymously(
      captchaToken ? { options: { captchaToken } } : undefined
    );
    if (error) throw error;
    return data.session;
  } catch (err) {
    console.error("Could not start an anonymous session:", err);
    window.location.href = "/login.html";
    return null;
  }
}

// Drop-in replacement for fetch() that attaches the current session's
// access token. Every /api call in this app should go through this
// instead of raw fetch().
//
// Admin view mode piggybacks on this same choke point: since virtually
// every mutating call in the app already routes through authFetch (per
// the note above), this is enough to give a friendly client-side block
// for the whole app rather than every button in every page having to
// know admin view mode exists. The server-side block in
// middleware/blockAdminViewMutations.js is the real security boundary --
// this is purely a "don't even try, here's why" for UX.
async function authFetch(url, options = {}) {
  const session = await getCurrentSession();
  if (!session) {
    window.location.href = "/login.html";
    throw new Error("Not authenticated");
  }

  const viewing = getAdminViewWorld();
  const method = (options.method || "GET").toUpperCase();
  if (viewing && method !== "GET") {
    window.alert("Read-only admin view — actions are disabled while viewing another user's world.");
    throw new Error("Blocked: admin read-only view.");
  }

  const headers = Object.assign({}, options.headers, {
    Authorization: `Bearer ${session.access_token}`
  });
  if (viewing) headers["X-Admin-View-World-Id"] = viewing.worldId;

  return fetch(url, Object.assign({}, options, { headers }));
}

// Where a logged-in user should land: the wizard if their world hasn't
// finished setup (fresh signup, or after Delete World reset it), the
// archive homepage otherwise. Used right after login/signup (login.html)
// and as a safety net on index.html itself, in case someone lands there
// directly (bookmark, back button) with setup still incomplete -- a
// blank homepage with no world info is a bad first thing for a new
// tester to see, so both call sites route through this one check rather
// than assuming index.html is always the right landing page.
//
// Relative paths only -- both call sites (login.html, index.html) live
// at the archive/ root, same level as wizard.html and index.html.
async function getPostLoginDestination() {
  try {
    const res = await authFetch("/api/wizard/review");
    if (!res.ok) return "index.html"; // fail open rather than trap the user
    const { setupCompletedAt } = await res.json();
    return setupCompletedAt ? "index.html" : "wizard.html";
  } catch (err) {
    console.error("Could not determine setup status, defaulting to index.html:", err);
    return "index.html";
  }
}

// Fills in a #auth-status element in the site nav, if present on the
// page, with either a "Log In" link or the current user's email + a
// Sign Out link.
async function renderAuthStatus() {
  renderAdminViewBanner();
  const el = document.getElementById("auth-status");
  if (!el) return;
  const session = await getCurrentSession();
  if (!session || (session.user && session.user.is_anonymous)) {
    // No session, or an anonymous one that hasn't been secured with an
    // email/password or OAuth identity yet -- "Sign Out" would be a trap
    // here (there's no credential to sign back INTO, so it would just
    // strand the visitor's own free-tier work), so point at login.html's
    // upgrade flow instead of the normal signed-in state.
    el.innerHTML = `<a href="/login.html">Save Your World</a>`;
    return;
  }
  const email = (session.user && session.user.email) || "account";
  el.innerHTML =
    `<span style="color: var(--ink-faint);">${email}</span> ` +
    `<a href="#" id="sign-out-link">Sign Out</a>`;
  document.getElementById("sign-out-link").onclick = (e) => {
    e.preventDefault();
    signOut();
  };
}

// Not auth-specific, but this file is the one thing every page that
// needs it (render.js, portraitActions.js, worldArtActions.js, map.html)
// already loads first -- previously reimplemented identically 4 times
// (portraitActions.js's own copy, worldArtActions.js's renamed
// readFileAsDataUrlForArt to avoid colliding with it, and inline in both
// map.html and render.js) rather than shared.
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}
