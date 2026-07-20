const fs = require("fs");
const path = require("path");
const { categoryPageHtml, CATEGORY_META } = require("../lib/categoryPageTemplate");

const archiveRoot = path.join(__dirname, "..", "archive");

for (const categoryKey of Object.keys(CATEGORY_META)) {
  const outPath = path.join(archiveRoot, categoryKey, "index.html");
  fs.writeFileSync(outPath, categoryPageHtml(categoryKey), "utf8");
  console.log("wrote", outPath);
}
