"use strict";

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
const COLORS = ["white", "blue", "black", "red", "green"];
const TIERS = ["common", "common", "uncommon", "rare"];
// Exact final PNGs from chat 01a13717-565b-7392-baca-ac91335bec6b.
// These preserve the original donkey linework over separate gradients.
const CHECKSUMS = {
  common: "e69e25207dc8444ced5349e4ce2e61450de02809e9c6559635a065f5e6506a79",
  uncommon: "d6f08a4ca3b5159377f3c4beb80c2152d22e1ec3f17e40009aee15c5a3ed9cd9",
  rare: "47d5f0c412f0d8e047cb5ec15a94a1d34155628eb285dc0f65f416dd1e95b4b2",
  mythic: "a9244568389f0cac573a56a35a55508bd1d15dce584295f51825c29c2669a1d6",
};
const progress = {
  version: 1, identityVerified: true,
  puzzles: {
    "white-1": { solved: true, attempts: ["PATRICK"] },
    "blue-4": { solved: true, attempts: ["GREEN"] },
    "blue-2": { solved: true, attempts: ["KEEL"], eggMachine: { cardsPulled: 3 } },
    "black-4": { solved: false, attempts: ["OLD GUESS"] },
  },
};
let browser, server, origin;

before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(ROOT, pathname.replace(/^\/puzzle-26\//, ""));
    if (!pathname.startsWith("/puzzle-26/") || !file.startsWith(ROOT + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const content = fs.readFileSync(file);
      const type = { ".png": "image/png", ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[path.extname(file)];
      res.writeHead(200, { "Content-Type": type || "application/octet-stream" });
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});

async function fixture(t, width, hosted = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], failedAssets = [], remote = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failedAssets.push(response.url()); });
  page.on("requestfailed", request => {
    if (!request.url().startsWith("https://fonts.googleapis.com/")) failedAssets.push(request.url());
  });
  await page.route(/^https?:/, route => {
    const url = route.request().url();
    if (url.startsWith(origin + "/")) return route.continue();
    if (!url.startsWith("https://fonts.googleapis.com/")) remote.push(url);
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  const base = hosted ? `${origin}/puzzle-26/index.html` : pathToFileURL(path.join(ROOT, "index.html")).href;
  await page.goto(base + "#/");
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(failedAssets, [], "all local resources load");
    assert.deepEqual(remote, [], "rarity symbols need no remote requests");
  });
  return page;
}

async function loadedSymbols(page) {
  await page.waitForFunction(() => [...document.querySelectorAll(".puzzle-rarity-symbol")]
    .every(image => image.complete && image.naturalWidth === 1254 && image.naturalHeight === 1254));
}

test("bundled symbols are byte-identical to the final composited donkey artwork", () => {
  for (const [tier, expected] of Object.entries(CHECKSUMS)) {
    const bytes = fs.readFileSync(path.join(ROOT, `assets/donkey-${tier}.png`));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, tier);
  }
});

for (const hosted of [false, true]) {
  test(`tab icon uses Green 01's transparent common donkey (${hosted ? "project subpath" : "file"})`, async t => {
    const page = await fixture(t, 1152, hosted);
    const icon = page.locator('link[rel="icon"]');
    assert.equal(await icon.getAttribute("type"), "image/png");
    assert.equal(await icon.getAttribute("href"), "assets/donkey-common.png");
    await page.getByRole("button", { name: "Open GREEN category", exact: true }).click();
    await loadedSymbols(page);
    assert.equal(await page.locator(".puzzle-rarity-symbol").first().getAttribute("src"), await icon.getAttribute("href"));
    const imageInfo = await page.evaluate(async hosted => {
      const image = new Image();
      image.src = document.querySelector('link[rel="icon"]').href;
      await image.decode();
      if (!hosted) return { width: image.naturalWidth, height: image.naturalHeight };
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, 32, 32);
      const pixels = context.getImageData(0, 0, 32, 32).data;
      const alpha = Array.from({ length: 1024 }, (_, index) => pixels[index * 4 + 3]);
      return { width: image.naturalWidth, height: image.naturalHeight,
        transparentCorners: [0, 31, 992, 1023].every(index => alpha[index] === 0),
        visibleInk: alpha.some(value => value > 0),
      };
    }, hosted);
    assert.deepEqual(imageInfo, { width: 1254, height: 1254, ...(hosted ? { transparentCorners: true, visibleInk: true } : {}) });
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
  });
}

for (const width of [1152, 320]) for (const hosted of [false, true]) {
  test(`all colors show common/common/uncommon/rare without numbers (${width}px, ${hosted ? "project subpath" : "file"})`, async t => {
    const page = await fixture(t, width, hosted);
    for (const color of COLORS) {
      await page.getByRole("button", { name: `Open ${color.toUpperCase()} category`, exact: true }).click();
      await page.locator(".puzzle-button").first().waitFor();
      await loadedSymbols(page);
      assert.deepEqual(await page.locator(".puzzle-rarity-symbol").evaluateAll(images =>
        images.map(image => [image.alt, image.getAttribute("src")])), TIERS.map(tier => [tier, `assets/donkey-${tier}.png`]));
      assert.equal(await page.locator(".puzzle-number").count(), 0);
      assert.equal(await page.locator(".puzzle-button:disabled").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
      if (color === "blue") {
        assert.deepEqual(await page.locator(".puzzle-status").allTextContents().then(values => values.map(value => value.trim())), ["", "GREEN", "KEEL", ""]);
      }
      if (process.env.PUZZLE_SCREENSHOT_DIR && !hosted) {
        await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `rarity-${color}-${width}.png`), fullPage: true });
      }
      await page.locator("#back-button").click();
    }
    const config = await page.evaluate(() => SITE_CONFIG.categories.map(category =>
      category.puzzles.map(puzzle => ({ id: puzzle.id, tier: puzzle.tier }))));
    COLORS.forEach((color, index) => assert.deepEqual(config[index],
      (color === "blue" ? [1, 4, 2, 3] : color === "green" ? [2, 1, 3, 4] : color === "red" ? [3, 2, 1, 4] : [1, 2, 3, 4]).map((id, position) => ({ id: `${color}-${id}`, tier: TIERS[position] }))));
    assert.deepEqual(await page.evaluate(() => ["common", "uncommon", "rare"].map(value =>
      isUnlocked({ type: "solvedPuzzlePropertyCount", property: "tier", value, count: 1 }))), [true, true, false]);
  });
}

for (const width of [1152, 320]) {
  test(`puzzle headings omit symbols and color labels, titles omit numbering, and back keeps progress (${width}px)`, async t => {
    const page = await fixture(t, width);
    await page.getByRole("button", { name: "Open BLACK category", exact: true }).click();
    for (const [name, tier, id] of [["Very Weak", "common", "black-1"], ["A Six-Foot Thick Wooden Door", "uncommon", "black-3"], ["The Declaration of Independence", "rare", "black-4"]]) {
      await page.getByRole("button", { name: `${name}, ${tier}`, exact: true }).click();
      await page.locator("h1").waitFor();
      assert.ok(page.url().endsWith(`#/puzzle/${id}`));
      assert.equal(await page.title(), `${name} · BLACK · Puzzle 26`);
      assert.equal(await page.locator(".puzzle-heading-category, .page-header .eyebrow, .page-header img").count(), 0);
      assert.equal(await page.locator("h1").textContent(), name);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.PUZZLE_SCREENSHOT_DIR && tier === "common") {
        await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `rarity-header-${width}.png`), fullPage: true });
      }
      await page.reload();
      await page.locator("h1").waitFor();
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
      await page.locator("#back-button").click();
      await page.locator(".puzzle-button").first().waitFor();
    }
  });
}
