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
const IMAGE = "assets/red-03-sts2.png";
const progress = {
  version: 1, identityVerified: true,
  puzzles: {
    "red-1": { solved: true, attempts: ["ANSWER"] },
    "red-3": { solved: false, attempts: ["EARLIER GUESS"] },
    "black-2": { solved: true, attempts: ["SHIFT"] },
  },
};
let browser, server, origin;

before(async () => {
  const allowed = new Set([...RARITY_ASSETS, ...PHYREXIAN_ASSETS, "index.html", "app.js", "styles.css", "grader-config.js", "grading.js", "egg-machine.js", "egg-machine.css", "cards-data.js", "cards.js", "cards.css", "phyrexian-encoding.js", "phyrexian-transformations.js", IMAGE]);
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = pathname.startsWith("/puzzle-26/") ? pathname.slice("/puzzle-26/".length) : "";
    if (!allowed.has(file)) { res.writeHead(404).end(); return; }
    const type = file.endsWith(".png") ? "image/png" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
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
  const page = await context.newPage(), errors = [], unexpectedRequests = [];
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
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
  await page.goto(`${base}#/category/red`);
  await page.locator("#puzzle-list").waitFor();
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["Aspire for Greatness", "To Sum Up Our Experiences?", "Permitted Travel", "Skill Based Game"]);
  await page.getByRole("button", { name: "Aspire for Greatness, common", exact: true }).click();
  await page.locator("#puzzle-image").waitFor();
  await page.waitForFunction(() => document.querySelector("#puzzle-image").complete && document.querySelector("#puzzle-image").naturalWidth === 1417);
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "image puzzle makes no external requests beyond the existing font import");
  });
  return page;
}

test("STS2 asset is byte-for-byte the original supplied PNG", () => {
  const png = fs.readFileSync(path.join(ROOT, IMAGE));
  assert.equal(createHash("sha256").update(png).digest("hex"), "eaab8fce3f580a0139caed8eb80f574de02f2ed5946334c51f41a4acedda268c");
  assert.equal(png.readUInt32BE(16), 1417);
  assert.equal(png.readUInt32BE(20), 1110);
});

for (const [width, localFile] of [[1152, true], [320, true], [1152, false]]) {
  test(`Red 01 displays the complete image at ${width}px via ${localFile ? "file" : "project path"}`, async t => {
    const page = await fixture(t, width, localFile);
    assert.ok(page.url().endsWith("#/puzzle/red-3"));
    assert.equal(await page.locator("h1").textContent(), "Aspire for Greatness");
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.doesNotMatch(await page.locator("#app").innerText(), /CHAINWHIRLER|will be added later/);
    const image = page.locator("#puzzle-image");
    assert.ok(await image.getAttribute("alt"));
    const dimensions = await image.evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
    assert.deepEqual(dimensions, { width: 1417, height: 1110 });
    const box = await image.boundingBox(), answer = await page.locator("#puzzle-answer").boundingBox();
    assert.ok(box.width <= width && Math.abs(box.height - box.width * 1110 / 1417) < 1);
    assert.ok(answer.y + answer.height < box.y, "answer form stays above the image");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (!localFile) assert.equal(await image.evaluate(img => img.src), `${origin}/puzzle-26/${IMAGE}`);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `red-03-${width}-${localFile ? "file" : "http"}.png`), fullPage: true });
  });
}

test("CHAINWHIRLER solves Red 01 and preserves attempts and unrelated progress", async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite."));
  await page.locator("#puzzle-answer").fill("chainwhirler");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "CHAINWHIRLER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS", "ANSWER", "CHAINWHIRLER"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["red-3"].solved, true);
  assert.deepEqual(stored.puzzles["red-1"], progress.puzzles["red-1"]);
  assert.deepEqual(stored.puzzles["black-2"], progress.puzzles["black-2"]);
  await page.locator("#back-button").click();
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").first().locator(".puzzle-status").textContent().then(text => text.trim()), "CHAINWHIRLER");
});
