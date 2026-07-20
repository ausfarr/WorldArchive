const express = require("express");
const path = require("path");
const generateRoute = require("./routes/generate");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api", generateRoute);
app.use(express.static(path.join(__dirname, "archive")));

app.listen(PORT, () => {
  console.log(`World Forge running at http://localhost:${PORT}`);
});
