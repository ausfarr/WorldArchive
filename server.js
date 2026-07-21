const express = require("express");
const path = require("path");
const generateRoute = require("./routes/generate");
const generateEnemyRoute = require("./routes/generateEnemy");
const generateItemRoute = require("./routes/generateItem");
const generateSurvivorRoute = require("./routes/generateSurvivor");
const generateLogRoute = require("./routes/generateLog");
const generateClassRoute = require("./routes/generateClass");
const generateFactionRoute = require("./routes/generateFaction");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api", generateRoute);
app.use("/api", generateEnemyRoute);
app.use("/api", generateItemRoute);
app.use("/api", generateSurvivorRoute);
app.use("/api", generateLogRoute);
app.use("/api", generateClassRoute);
app.use("/api", generateFactionRoute);
app.use(express.static(path.join(__dirname, "archive")));

app.listen(PORT, () => {
  console.log(`World Forge running at http://localhost:${PORT}`);
});
