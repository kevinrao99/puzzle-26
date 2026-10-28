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
const IMAGES = require("../assets/white-02-image-sources.json");
const TITLES = [
  "Fish Market", "Susanna and the Elders", "La Belle Jardinière",
  "Bacchanal: A Faun Teased by Children", "The Mystic Marriage of Saint Catherine",
  "Apollo and Daphne", "A Dance in the Country", "Saint Jerome and the Angel",
  "The Resurrected Christ", "Venus and Cupid",
];
const progress = {
  version: 1, identityVerified: true,
  puzzles: {
    "white-1": { solved: true, attempts: ["PATRICK"] },
    "white-2": { solved: false, attempts: ["EARLIER GUESS"] },
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
  await page.getByRole("button", { name: "That Belongs in a Museum, common", exact: true }).click();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll("#puzzle-images img")];
    return images.length === 10 && images.every(image => image.complete && image.naturalWidth > 0);
  });
  // Measure the grid only after the page's entrance translation has finished.
  await page.evaluate(async () => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    assert.deepEqual(unexpectedRequests, [], "artworks load locally, not from museum servers");
  });
  return page;
}

test("all ten bundled artwork images match their recorded source bytes and titles", () => {
  assert.equal(IMAGES.length, 10);
  assert.deepEqual(IMAGES.map(image => image.title), TITLES);
  assert.equal(new Set(IMAGES.map(image => image.objectUrl)).size, 10);
  for (const [index, image] of IMAGES.entries()) {
    assert.equal(image.file, `assets/white-02-artwork-${String(index + 1).padStart(2, "0")}.jpg`);
    const bytes = fs.readFileSync(path.join(ROOT, image.file));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), image.sha256);
  }
});

for (const [width, localFile] of [[1152, true], [320, true], [1152, false]]) {
  test(`That Belongs in a Museum shows ten uncropped artworks without captions in a fixed grid at ${width}px via ${localFile ? "file" : "project path"}`, async t => {
    const page = await fixture(t, width, localFile);
    assert.ok(page.url().endsWith("#/puzzle/white-2"));
    assert.equal(await page.locator("h1").textContent(), "That Belongs in a Museum");
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.equal(await page.locator("#puzzle-images figcaption").count(), 0);
    assert.equal((await page.locator("#puzzle-images").innerText()).trim(), "", "no visible artwork captions remain");
    assert.doesNotMatch(await page.locator("#app").innerText(), /\bMARY\b|Raphael|Louvre|Bernini|Tiepolo|Pittoni|Baroque|Renaissance|Set [123]/i);
    const images = page.locator("#puzzle-images img"), boxes = [];
    const answer = await page.locator("#puzzle-answer").boundingBox();
    for (const [index, expected] of IMAGES.entries()) {
      const image = images.nth(index), box = await image.boundingBox();
      boxes.push(box);
      assert.equal(await image.getAttribute("src"), expected.file);
      assert.equal(await image.getAttribute("alt"), expected.title);
      assert.deepEqual(await image.evaluate(img => [img.naturalWidth, img.naturalHeight]), [expected.width, expected.height]);
      assert.equal(await image.evaluate(img => getComputedStyle(img).objectFit), "contain");
      assert.ok(box.y > answer.y + answer.height);
      assert.ok(box.width <= width);
      if (!localFile) assert.equal(await image.evaluate(img => img.src), `${origin}/puzzle-26/${expected.file}`);
    }
    if (width > 1000) {
      assert.equal(boxes[0].y, boxes[1].y);
      assert.equal(boxes[1].y, boxes[2].y);
      assert.ok(boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x);
      assert.ok(boxes[3].y > boxes[0].y);
    } else {
      for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].y > boxes[i - 1].y + boxes[i - 1].height);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    await page.reload();
    await page.locator("#puzzle-images img").first().waitFor();
    assert.equal(await page.locator("#puzzle-images figcaption").count(), 0);
    assert.deepEqual(await page.locator("#puzzle-images img").evaluateAll(images => images.map(image => image.getAttribute("src"))), IMAGES.map(image => image.file), "reload preserves the fixed shuffle");
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `white-02-${width}-${localFile ? "file" : "http"}.png`), fullPage: true });
  });
}

test("MARY solves White 02 with normal attempts and persistence, preserving other puzzles", async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite."));
  await page.locator("#puzzle-answer").fill("mary");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "MARY");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS", "ANSWER", "MARY"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["white-2"].solved, true);
  for (const id of ["white-1", "blue-3"]) assert.deepEqual(stored.puzzles[id], progress.puzzles[id]);
  await page.locator("#back-button").click();
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").nth(1).locator(".puzzle-status").textContent().then(text => text.trim()), "MARY");
});
