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

async function signUp(email, password) {
  const { data, error } = await getSupabaseClient().auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await getSupabaseClient().auth.signOut();
  window.location.href = "/login.html";
}

// Redirects to the login page if there's no active session. Call at the
// top of any page that requires auth. Returns the session so callers
// don't need a second lookup.
async function requireAuth() {
  const session = await getCurrentSession();
  if (!session) {
    window.location.href = "/login.html";
    return null;
  }
  return session;
}

// Drop-in replacement for fetch() that attaches the current session's
// access token. Every /api call in this app should go through this
// instead of raw fetch().
async function authFetch(url, options = {}) {
  const session = await getCurrentSession();
  if (!session) {
    window.location.href = "/login.html";
    throw new Error("Not authenticated");
  }
  const headers = Object.assign({}, options.headers, {
    Authorization: `Bearer ${session.access_token}`
  });
  return fetch(url, Object.assign({}, options, { headers }));
}

// Fills in a #auth-status element in the site nav, if present on the
// page, with either a "Log In" link or the current user's email + a
// Sign Out link.
async function renderAuthStatus() {
  const el = document.getElementById("auth-status");
  if (!el) return;
  const session = await getCurrentSession();
  if (!session) {
    el.innerHTML = `<a href="/login.html">Log In</a>`;
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
