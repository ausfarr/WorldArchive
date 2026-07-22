const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY env vars. " +
    "Set them in Replit Secrets before starting the server."
  );
}

// Server-side client using the secret key (this project's name for the
// service-role-equivalent key) — bypasses Row Level Security. This is the
// ONLY Supabase client the Express backend should use; the publishable/
// anon key is for future client-side code, not this process.
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

module.exports = { supabase };
