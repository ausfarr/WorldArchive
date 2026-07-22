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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Every /api route below now expects req.worldId — resolveTenant is
// currently a placeholder that refuses all requests (see
// middleware/resolveTenant.js) until real Supabase Auth is wired in.
app.use("/api", resolveTenant);
app.use("/api", generateRoute);
app.use("/api", generateEnemyRoute);
app.use("/api", generateItemRoute);
app.use("/api", generateSurvivorRoute);
app.use("/api", generateLogRoute);
app.use("/api", generateClassRoute);
app.use("/api", generateFactionRoute);
app.use("/api", confirmEntryRoute);
app.use(express.static(path.join(__dirname, "archive")));

app.listen(PORT, () => {
  console.log(`World Forge running at http://localhost:${PORT}`);
});
