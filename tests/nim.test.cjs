"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress";
const ROUTES = require("../../nim-prototype/tests/boards.json").stages;
const progress = {
  version: 1, identityVerified: true,
  puzzles: {
    "blue-1": { solved: false, attempts: ["EARLIER GUESS"] },
    "blue-2": { solved: false, attempts: [], eggMachine: { cardsPulled: 3 } },
    "blue-3": { solved: true, attempts: ["JIACHEN"] },
    "blue-4": { solved: false, attempts: [], grading: { teams: [{ jobId: "existing-job", status: "complete", score: 34, maximumScore: 100 }] } },
    "white-1": { solved: true, attempts: ["PATRICK"] },
  },
};
let browser, server, origin;

before(async () => {
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(ROOT, pathname.replace(/^\/puzzle-26\//, ""));
    if (!pathname.startsWith("/puzzle-26/") || !file.startsWith(ROOT + path.sep)) return res.writeHead(404).end();
    try {
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    } catch { res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function fixture(t, hosted = false, width = 1152) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], failed = [], external = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failed.push(response.url()); });
  await page.route(/^https?:/, route => {
    const url = route.request().url();
    if (url.startsWith(origin + "/")) return route.continue();
    if (!url.startsWith("https://fonts.googleapis.com/")) external.push(url);
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  const base = hosted ? `${origin}/puzzle-26/index.html` : pathToFileURL(path.join(ROOT, "index.html")).href;
  await page.goto(base + "#/category/blue");
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["Jack be Nimble", "Double Trouble", "Endless Gacha", "Fields of Knowledge"]);
  await page.getByRole("button", { name: "Jack be Nimble, common", exact: true }).click();
  assert.ok(page.url().endsWith("#/puzzle/blue-1"));
  const element = await page.waitForSelector("#nim-game"), game = await element.contentFrame();
  await game.waitForSelector(".player");
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(external, []);
  });
  return { page, game };
}

const position = game => game.locator(".player").evaluate(dot => [Number(dot.parentElement.dataset.x), Number(dot.parentElement.dataset.y)]);
async function walk(page, game, route) {
  assert.deepEqual(await position(game), route[0]);
  for (let i = 1; i < route.length; i++) {
    const [x, y] = route[i], [px, py] = route[i - 1];
    await page.keyboard.press(x < px ? "ArrowLeft" : x > px ? "ArrowRight" : y < py ? "ArrowUp" : "ArrowDown");
    assert.deepEqual(await position(game), route[i]);
  }
}

test("the hunt bundle is synchronized and the standalone preview keeps visible hazards", async t => {
  execFileSync(process.execPath, [path.join(ROOT, "scripts/sync-nim-game.cjs"), "--check"]);
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve(ROOT, "../nim-prototype/dist/index.html")).href);
  assert.equal(await page.locator(".cell.death").count(), 16);
});

for (const hosted of [false, true]) {
  test(`Blue 01 loads with hidden hazards and aligned coordinates from ${hosted ? "a GitHub Pages subpath" : "local files"}`, async t => {
    const { page, game } = await fixture(t, hosted);
    assert.equal(await page.locator("h1").textContent(), "Jack be Nimble");
    assert.equal(await page.title(), "Jack be Nimble · BLUE · Puzzle 26");
    assert.equal(await page.locator(".placeholder-puzzle, .lede").count(), 0);
    assert.equal(await game.locator(".cell").count(), 289);
    assert.equal(await game.locator(".cell.death").count(), 0);
    assert.equal(await game.locator(".destination").textContent(), "1");
    assert.equal(await game.locator("#completion-mark").isVisible(), false);
    assert.equal(await game.getByRole("button").count(), 2);
    assert.deepEqual(await position(game), [1, 15]);
    assert.doesNotMatch(await game.locator("body").innerText(), /MAYNARD|XOR|Prototype/);
    for (const axis of ["x", "y"]) assert.deepEqual(await game.locator(`#${axis}-coordinates span`).allTextContents(), Array.from({ length: 17 }, (_, i) => String(i)));
    assert.ok(await game.locator("button img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
    for (const width of [1152, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await game.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await game.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), "no nested vertical scrollbar");
      assert.ok(await game.locator(".cell").evaluateAll(cells => cells.every(cell => {
        const box = cell.getBoundingClientRect();
        return Math.abs(box.width - box.height) < 1;
      })));
      if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `nim-${hosted ? "hosted" : "file"}-${width}.png`), fullPage: true });
    }
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
  });
}

test("the embedded game preserves death locking, both restarts, seven checkpoints, and the completion check", async t => {
  const { page, game } = await fixture(t);
  await page.locator("#puzzle-answer").focus();
  await page.keyboard.press("ArrowUp");
  assert.deepEqual(await position(game), [1, 15], "editing the answer does not move the player");
  await game.locator("#board").click();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  assert.equal(await game.locator("#death-overlay").isVisible(), true);
  assert.equal(await game.locator("#death-overlay p").textContent(), "You have died");
  await page.keyboard.press("ArrowRight");
  assert.deepEqual(await position(game), [1, 12]);
  await game.locator("#restart-checkpoint").click();
  assert.deepEqual(await position(game), [1, 15]);
  await walk(page, game, ROUTES[0].shortest_safe_path_xy);
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  assert.equal(await game.locator("#death-overlay").isVisible(), true);
  await game.locator("#restart-checkpoint").click();
  assert.deepEqual(await position(game), [1, 4]);
  assert.equal(await game.locator(".destination").textContent(), "2");
  await game.locator("#restart").click();
  assert.deepEqual(await position(game), [1, 15]);
  assert.equal(await game.locator("#checkpoint-number").textContent(), "");
  for (const stage of ROUTES) {
    await walk(page, game, stage.shortest_safe_path_xy);
    assert.equal(await game.locator("#checkpoint-number").textContent(), String(stage.stage));
    assert.equal(await game.locator(".cell.death").count(), 0);
    assert.equal(await game.locator("#death-overlay").isVisible(), false);
  }
  assert.equal(await game.locator("#completion-mark").isVisible(), true);
  assert.equal(await game.locator(".destination").count(), 0);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress, "game completion does not submit an answer or change hunt progress");
  await game.locator("#restart-checkpoint").click();
  assert.equal(await game.locator("#completion-mark").isVisible(), true);
  await game.locator("#restart").click();
  assert.equal(await game.locator("#completion-mark").isVisible(), false);
  await page.locator("#back-button").click();
  await page.waitForSelector("#puzzle-list");
  assert.equal(game.isDetached(), true);
});

test("MAYNARD solves Blue 01 through the normal answer form and preserves other puzzle progress", async t => {
  const { page } = await fixture(t, true);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite."));
  await page.locator("#puzzle-answer").fill("mAy-nArD!");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS", "ANSWER", "MAYNARD"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["blue-1"].solved, true);
  for (const id of ["blue-2", "blue-3", "blue-4", "white-1"]) assert.deepEqual(stored.puzzles[id], progress.puzzles[id]);
});
