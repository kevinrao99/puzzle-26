"use strict";

// Keep the hunt copy self-contained while sharing the prototype's game logic.
const fs = require("node:fs");
const path = require("node:path");
const sourceRoot = path.resolve(__dirname, "../../nim-prototype/dist");
const targetRoot = path.resolve(__dirname, "../games/nim");
const files = ["index.html", "styles.css", "game.js", "assets/restart.png", "assets/flag.png"];

if (process.argv.slice(2).some(argument => argument !== "--check")) {
  throw new Error("Usage: node scripts/sync-nim-game.cjs [--check]");
}

const sources = files.map(file => {
  let content = fs.readFileSync(path.join(sourceRoot, file));
  if (file === "index.html") {
    const html = content.toString("utf8");
    if (!html.includes('<html lang="en">') || !html.includes("<title>Grid · Prototype</title>")) {
      throw new Error("Prototype HTML changed; review the hunt presentation transform before syncing.");
    }
    content = Buffer.from(html
      .replace('<html lang="en">', '<html lang="en" data-hazards="hidden">')
      .replace("<title>Grid · Prototype</title>", "<title>Jack be Nimble</title>"));
  }
  return { file, content };
});

for (const { file, content } of sources) {
  const target = path.join(targetRoot, file);
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(target) || !content.equals(fs.readFileSync(target))) {
      throw new Error(`Nim bundle is out of sync: ${file}. Run node scripts/sync-nim-game.cjs.`);
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
console.log(process.argv.includes("--check")
  ? "Nim bundle matches the prototype with hidden hunt hazards (5 files)."
  : "Synced Jack be Nimble into games/nim with hidden hazards (5 files).");
