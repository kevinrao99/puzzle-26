"use strict";

// Exercise the real production unlock rules: do not install navigation.cjs.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress";
const COLORS = ["white", "blue", "black", "red", "green"];
const ALL_IDS = COLORS.flatMap(color => [1, 2, 3, 4].map(number => `${color}-${number}`));
const completedColors = count => ({ version: 1, identityVerified: true, puzzles: Object.fromEntries(
  ALL_IDS.slice(0, count * 4).map(id => [id, { solved: true, attempts: [] }]),
) });
let browser, server, origin;

before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(ROOT, pathname.replace(/^\/puzzle-26\//, ""));
    if (!pathname.startsWith("/puzzle-26/") || !file.startsWith(ROOT + path.sep)) return res.writeHead(404).end();
    try {
      const content = fs.readFileSync(file);
      const type = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".ttf": "font/ttf" }[path.extname(file)];
      res.writeHead(200, { "Content-Type": type || "application/octet-stream" });
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function fixture(t, { progress = completedColors(0), width = 1152, hosted = true, route = "/" } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 950 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], remote = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, request => {
    const url = request.request().url();
    if (url.startsWith(origin + "/")) return request.continue();
    if (!url.startsWith("https://fonts.googleapis.com/")) remote.push(url);
    return request.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  const base = hosted ? `${origin}/puzzle-26/index.html` : pathToFileURL(path.join(ROOT, "index.html")).href;
  await page.goto(`${base}#${route}`);
  await page.locator(".page").waitFor();
  t.after(() => { assert.deepEqual(errors, []); assert.deepEqual(remote, [], "locks do not contact external services"); });
  return page;
}

async function go(page, route) {
  await page.evaluate(route => { location.hash = `#${route}`; }, route);
  await page.waitForFunction(() => document.querySelector(".page"));
}

async function setProgress(page, progress) {
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: KEY, progress });
  await page.reload();
  await page.locator("#category-grid").waitFor();
  // Wait for :has(.home-page) styles and the page-entry animation to settle.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
}

async function visibleCategories(page) {
  return page.locator("#category-grid [data-category]").evaluateAll(buttons => buttons.map(button => button.dataset.category));
}

async function snapshot(page, name) {
  if (process.env.PUZZLE_SCREENSHOT_DIR) {
    await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, name + ".png"), fullPage: true });
  }
}

for (const width of [1152, 320]) {
  test(`all six cumulative stages hide locked sections and retain circle positions (${width}px)`, async t => {
    const page = await fixture(t, { width });
    const positions = {};
    for (let count = 0; count <= 5; count++) {
      const progress = completedColors(count);
      await setProgress(page, progress);
      const expected = [...COLORS.slice(0, Math.min(count + 1, 5)), ...(count === 5 ? ["phyrexian"] : [])];
      assert.deepEqual(await visibleCategories(page), expected);
      assert.equal(await page.locator("#category-grid button:disabled").count(), 0, "locked categories are omitted, not disabled placeholders");
      for (const color of expected) {
        const box = await page.locator(`[data-category="${color}"]`).boundingBox();
        if (positions[color]) assert.deepEqual(box, positions[color], "revealing a new button never moves earlier ones");
        positions[color] = box;
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
      if ([0, 1, 5].includes(count)) await snapshot(page, `unlocks-stage-${count}-${width}`);
    }
  });
}

test("each of the 20 prerequisites matters, even with out-of-order saved solves", async t => {
  const page = await fixture(t);
  for (const id of ALL_IDS) {
    const progress = completedColors(5);
    progress.puzzles[id] = { solved: false, attempts: ["WRONG"], grading: { parts: {} } };
    await setProgress(page, progress);
    const colorIndex = COLORS.indexOf(id.split("-")[0]);
    assert.deepEqual(await visibleCategories(page), COLORS.slice(0, colorIndex + 1), id);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
  }
});

test("an available color exposes all four puzzles without extra task requirements", async t => {
  const page = await fixture(t);
  for (let index = 0; index < COLORS.length; index++) {
    await setProgress(page, completedColors(index));
    await page.locator(`[data-category="${COLORS[index]}"]`).click();
    await page.locator("#puzzle-list").waitFor();
    assert.equal(await page.locator(".puzzle-button").count(), 4);
    assert.equal(await page.locator(".puzzle-button:enabled").count(), 4);
    await page.locator("#back-button").click();
    await page.locator("#category-grid").waitFor();
  }
});

test("solving White's fourth puzzle unlocks Blue immediately and survives reload", async t => {
  const progress = completedColors(1);
  progress.puzzles["white-4"] = { solved: false, attempts: [] };
  const page = await fixture(t, { progress, hosted: false });
  assert.deepEqual(await visibleCategories(page), ["white"]);
  await go(page, "/puzzle/white-4");
  await page.locator("#puzzle-answer").fill("WRONG");
  await page.locator("#puzzle-answer").press("Enter");
  await page.getByText("Incorrect", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => isUnlocked(findCategory("blue").unlock)), false);
  await page.locator("#puzzle-answer").fill("NOTRE DAME");
  await page.locator("#puzzle-answer").press("Enter");
  await page.locator(".correct-attempt").waitFor();
  await page.locator("#back-button").click();
  await page.locator(".task-envelope").first().waitFor();
  assert.equal(await page.locator(".task-envelope").count(), 2, "envelopes coexist with unlocking the next color");
  await page.locator("#back-button").click();
  await page.locator("#category-grid").waitFor();
  assert.deepEqual(await visibleCategories(page), ["white", "blue"]);
  await page.reload();
  assert.deepEqual(await visibleCategories(page), ["white", "blue"]);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).puzzles["white-4"].attempts, KEY), ["WRONG", "NOTRE DAME"]);
});

for (const width of [1152, 320]) {
  test(`Phyrexian names stay visible while puzzles unlock in sequence (${width}px)`, async t => {
    const page = await fixture(t, { progress: completedColors(5), width, route: "/category/phyrexian" });
    const states = () => page.locator(".puzzle-button").evaluateAll(buttons => buttons.map(button => button.disabled));
    assert.deepEqual(await states(), [false, true, true]);
    assert.equal(await page.locator(".puzzle-rarity-symbol").count(), 3);
    await page.waitForFunction(() => [...document.querySelectorAll(".puzzle-name-inscription")].every(node => getComputedStyle(node).visibility === "visible"));
    assert.equal(await page.locator(".puzzle-name-inscription").count(), 3);
    assert.deepEqual(await page.locator(".puzzle-status").allTextContents().then(values => values.map(value => value.trim())), ["", "", ""]);
    await page.locator(".puzzle-button").nth(1).evaluate(button => button.click());
    assert.ok(page.url().endsWith("#/category/phyrexian"));
    await snapshot(page, `unlocks-phyrexian-${width}`);
    for (const [index, answer] of ["ALL WILL BE ONE", "COMPLEATED"].entries()) {
      await page.locator(".puzzle-button").nth(index).click();
      await page.locator("#puzzle-answer").fill(answer);
      await page.locator("#puzzle-answer").press("Enter");
      await page.locator(".correct-attempt").waitFor();
      await page.locator("#back-button").click();
      await page.locator("#puzzle-list").waitFor();
      assert.deepEqual(await states(), index === 0 ? [false, false, true] : [false, false, false]);
    }
    await page.reload();
    assert.deepEqual(await states(), [false, false, false]);
    await page.locator(".puzzle-button").nth(2).click();
    await page.locator("#phyrexian-factions").waitFor();
  });
}

test("deep links cannot open hidden sections or skip a locked Phyrexian puzzle", async t => {
  const page = await fixture(t, { hosted: false, route: "/puzzle/blue-1" });
  await page.waitForURL(/#\/$/);
  for (const category of [...COLORS.slice(1), "phyrexian"]) {
    for (const route of [`/category/${category}`, `/puzzle/${category}-1`]) {
      await go(page, route);
      await page.waitForURL(/#\/$/);
      assert.equal(await page.locator(".puzzle-page, .category-page").count(), 0);
    }
  }
  await setProgress(page, completedColors(5));
  for (const number of [2, 3]) {
    await go(page, `/puzzle/phyrexian-${number}`);
    await page.waitForURL(/#\/category\/phyrexian$/);
    assert.equal(await page.locator(".puzzle-button").nth(number - 1).isDisabled(), true);
  }
  // An old out-of-order solve is retained, but cannot bypass missing predecessors.
  await go(page, "/");
  await page.locator("#category-grid").waitFor();
  const progress = completedColors(5);
  progress.puzzles["phyrexian-2"] = { solved: true, attempts: ["COMPLEATED"] };
  await setProgress(page, progress);
  await go(page, "/puzzle/phyrexian-3");
  await page.waitForURL(/#\/category\/phyrexian$/);
  assert.equal(await page.locator(".puzzle-button").nth(2).isDisabled(), true);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
});

test("clearing progress restores the identity gate and then only White", async t => {
  const page = await fixture(t, { progress: completedColors(5) });
  await page.getByRole("button", { name: "Open instructions", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Clear local progress", exact: true }).click();
  await page.locator("#identity-answer").fill("BUM");
  await page.locator("#identity-answer").press("Enter");
  await page.locator("#category-grid").waitFor();
  assert.deepEqual(await visibleCategories(page), ["white"]);
});
