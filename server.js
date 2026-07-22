const express = require("express");
const path = require("path");
const { resolveTenant } = require("./middleware/resolveTenant");
const generateRoute = require("./routes/generate");
const generateEnemyRoute = require("./routes/generateEnemy");
const generateItemRoute = require("./routes/generateItem");
const generateSurvivorRoute = require("./routes/generateSurvivor");
const generateLogRoute = require("./routes/generateLog");
const generateClassRoute = require("./routes/generateClass");
const generateFactionRoute = require("./routes/generateFaction");
const confirmEntryRoute = require("./routes/confirmEntry");
const wizardRoute = require("./routes/wizard");
const wizardLoreRoute = require("./routes/wizardLore");
const wizardFactionsRoute = require("./routes/wizardFactions");
const wizardStatSystemRoute = require("./routes/wizardStatSystem");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Public config for the frontend Supabase client (login page, authFetch
// helper). SUPABASE_URL and the publishable/anon key are both meant to be
// exposed client-side by design — the anon key is not a secret, RLS is
// the real security boundary for direct client access, and this app
// doesn't do any direct client-side DB access anyway (the frontend only
// uses this client for auth: sign up / sign in / sign out / session
// lookup, then calls our own /api routes with the resulting JWT). Deliberately
// NOT mounted under /api so it isn't gated by resolveTenant below.
app.get("/config.js", (req, res) => {
  res.type("application/javascript");
  res.send(
    `window.SUPABASE_CONFIG = ${JSON.stringify({
      url: process.env.SUPABASE_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY
    })};`
  );
});

// Every /api route below expects req.worldId, set by resolveTenant after
// verifying the request's Supabase JWT (see middleware/resolveTenant.js).
app.use("/api", resolveTenant);
app.use("/api", generateRoute);
app.use("/api", generateEnemyRoute);
app.use("/api", generateItemRoute);
app.use("/api", generateSurvivorRoute);
app.use("/api", generateLogRoute);
app.use("/api", generateClassRoute);
app.use("/api", generateFactionRoute);
app.use("/api", confirmEntryRoute);
app.use("/api", wizardRoute);
app.use("/api", wizardLoreRoute);
app.use("/api", wizardFactionsRoute);
app.use("/api", wizardStatSystemRoute);
app.use(express.static(path.join(__dirname, "archive")));

// Catches errors passed via next(err) anywhere above (e.g. a Supabase/DB
// failure inside resolveTenant) and returns clean JSON instead of
// Express's default HTML error page or an unhandled crash.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`World Forge running at http://localhost:${PORT}`);
});
