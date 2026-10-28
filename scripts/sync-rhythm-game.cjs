"use strict";

// Package the existing prototype's word-free view; do not fork the game logic.
// The copied files live inside this repository so GitHub Pages needs no sibling checkout.
const fs = require("node:fs");
const path = require("node:path");
const sourceRoot = path.resolve(__dirname, "../../ddr-prototype/dist");
const targetRoot = path.resolve(__dirname, "../games/rhythm");
const files = [
  "wordless.html", "wordless.css", "styles.css", "chart.js", "engine.js", "game.js",
  "assets/animals.mp3",
];

if (process.argv.slice(2).some(argument => argument !== "--check")) {
  throw new Error("Usage: node scripts/sync-rhythm-game.cjs [--check]");
}

// Read every source before touching any destination, so a missing local recording
// does not leave a partially updated bundle. No downloads or uploads are performed.
const sources = files.map(file => ({ file, content: fs.readFileSync(path.join(sourceRoot, file)) }));
if (process.argv.includes("--check")) {
  for (const { file, content } of sources) {
    if (!fs.existsSync(path.join(targetRoot, file)) || !content.equals(fs.readFileSync(path.join(targetRoot, file)))) {
      throw new Error(`Rhythm bundle is out of sync: ${file}. Run node scripts/sync-rhythm-game.cjs.`);
    }
  }
  console.log("Rhythm bundle matches the standalone prototype (7 files).");
} else {
  for (const { file } of sources) {
    fs.mkdirSync(path.dirname(path.join(targetRoot, file)), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, file), path.join(targetRoot, file));
  }
  console.log("Copied the word-free rhythm game and local recording into games/rhythm (7 files).");
}
