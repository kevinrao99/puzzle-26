"use strict";

const RARITY_ASSETS = ["common", "uncommon", "rare", "mythic"].map(tier => `assets/donkey-${tier}.png`);
const PHYREXIAN_ASSETS = ["assets/Phyrexian-Regular.ttf", "assets/phyrexian-symbol.png"];

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress";
const IMAGES = require("../assets/white-01-image-sources.json");
const progress = {
  version: 1, identityVerified: true,
  puzzles: {
    "white-1": { solved: false, attempts: ["EARLIER GUESS"] },
    "white-2": { solved: true, attempts: ["ANSWER"] },
    "blue-3": { solved: true, attempts: ["JIACHEN"] },
  },
};
let browser, server, origin;

before(async () => {
  const allowed = new Set([...RARITY_ASSETS, ...PHYREXIAN_ASSETS, "index.html", "app.js", "styles.css", "grader-config.js", "grading.js", "egg-machine.js", "egg-machine.css", "cards-data.js", "cards.js", "cards.css", "phyrexian-encoding.js", "phyrexian-transformations.js", ...IMAGES.map(image => image.file)]);
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = pathname.startsWith("/puzzle-26/") ? pathname.slice("/puzzle-26/".length) : "";
    if (!allowed.has(file)) { res.writeHead(404).end(); return; }
    const type = file.endsWith(".png") ? "image/png" : file.endsWith(".jpg") ? "image/jpeg" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
    res.writeHead(200, { "Content-Type": type });
    res.end(fs.readFileSync(path.join(ROOT, file)));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});

async function fixture(t, width = 1152, localFile = true) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], unexpectedRequests = [], failedResponses = [];
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failedResponses.push(response.url()); });
  await page.route(/^https?:/, route => {
    const url = route.request().url();
    if (url.startsWith(origin + "/")) return route.continue();
    if (!url.startsWith("https://fonts.googleapis.com/")) unexpectedRequests.push(url);
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  const base = localFile ? pathToFileURL(path.join(ROOT, "index.html")).href : `${origin}/puzzle-26/index.html`;
  await page.goto(`${base}#/category/white`);
  await page.locator("#puzzle-list").waitFor();
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["All Around Me Are...", "That Belongs in a Museum", "Classic Angela", "The One Left Out"]);
  await page.getByRole("button", { name: "All Around Me Are..., common", exact: true }).click();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll("#puzzle-images img")];
    return images.length === 7 && images.every(image => image.complete && image.naturalWidth > 0);
  });
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    assert.deepEqual(unexpectedRequests, [], "portraits load locally, not from the proxy or original sites");
  });
  return page;
}

test("all seven bundled JPEGs preserve the supplied image bytes", () => {
  assert.equal(IMAGES.length, 7);
  for (const [index, image] of IMAGES.entries()) {
    assert.equal(image.file, `assets/white-01-portrait-${String(index + 1).padStart(2, "0")}.jpg`);
    const bytes = fs.readFileSync(path.join(ROOT, image.file));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), image.sha256);
  }
});

for (const [width, localFile] of [[1152, true], [320, true], [1152, false]]) {
  test(`seven portraits retain their order and full images at ${width}px via ${localFile ? "file" : "project path"}`, async t => {
    const page = await fixture(t, width, localFile);
    assert.ok(page.url().endsWith("#/puzzle/white-1"));
    assert.equal(await page.locator("h1").textContent(), "All Around Me Are...");
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.equal(await page.locator("#puzzle-images").textContent(), "");
    const spoilers = /Napoleon|Charlemagne|Thomas Aquinas|Raphael|Suleiman|Andersen|Immanuel Kant|Paris|Aachen|Toulouse|Rome|Istanbul|Copenhagen|Kaliningrad|PATRICK/i;
    assert.doesNotMatch(await page.locator("#app").innerText(), spoilers);
    const pictures = page.locator("#puzzle-images img");
    let previousBottom = (await page.locator("#puzzle-answer").boundingBox()).y + (await page.locator("#puzzle-answer").boundingBox()).height;
    for (const [index, expected] of IMAGES.entries()) {
      const image = pictures.nth(index), box = await image.boundingBox();
      assert.equal(await image.getAttribute("src"), expected.file);
      assert.deepEqual(await image.evaluate(img => [img.naturalWidth, img.naturalHeight]), [expected.width, expected.height]);
      assert.ok(box.y > previousBottom, "vertical order follows the supplied sequence");
      assert.ok(box.width <= width && Math.abs(box.height - box.width * expected.height / expected.width) < 1, "full image keeps its aspect ratio");
      const alt = await image.getAttribute("alt");
      assert.ok(alt.startsWith(`Portrait ${index + 1}:`));
      assert.doesNotMatch(alt, spoilers);
      assert.equal(await image.getAttribute("title"), null);
      if (!localFile) assert.equal(await image.evaluate(img => img.src), `${origin}/puzzle-26/${expected.file}`);
      previousBottom = box.y + box.height;
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `white-01-${width}-${localFile ? "file" : "http"}.png`), fullPage: true });
  });
}

test("PATRICK solves White 01 and preserves attempts and unrelated progress", async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite."));
  await page.locator("#puzzle-answer").fill("patrick");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "PATRICK");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS", "ANSWER", "PATRICK"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["white-1"].solved, true);
  for (const id of ["white-2", "blue-3"]) assert.deepEqual(stored.puzzles[id], progress.puzzles[id]);
  await page.locator("#back-button").click();
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").first().locator(".puzzle-status").textContent().then(text => text.trim()), "PATRICK");
});
