"use strict";

const { allowUnrestrictedNavigation } = require("./helpers/navigation.cjs");

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress";
const TASKS = {
  "white-3": ["Helen Wang", "Ajani, Sleeper Agent", "JOSEPH"],
  "white-4": ["Eric", "Elesh Norn, Grand Cenobite", "NOTRE DAME"],
  "blue-2": ["Awei", "Jace, the Perfected Mind", "KEEL"],
  "blue-3": ["Bryan", "Jin-Gitaxias, Core Augur", "JIACHEN"],
  "black-3": ["Aivant", "Vraska, Betrayal's Sting", "174410441"],
  "black-4": ["Helen Huang", "Sheoldred, Whispering One", "ESPIONAGE"],
  "red-1": ["Moe", "Lukka, Bound to Ruin", "GLORYBRINGER"],
  "red-4": ["Annie", "Urabrask the Hidden", "TRIPLE TRACTOR"],
  "green-3": ["April", "Nissa, Ascended Animist", "ATP8"],
  "green-4": ["Krao", "Vorinclex, Voice of Hunger", "FALCON"],
};
const solved = { version: 1, identityVerified: true, puzzles: Object.fromEntries(
  Object.entries(TASKS).map(([id, [, , answer]]) => [id, { solved: true, correctAnswer: answer, attempts: [answer] }]),
) };
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

async function fixture(t, { progress = solved, width = 1152, hosted = true, touch = false, category = "white" } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 950 }, reducedMotion: "reduce", hasTouch: touch });
  t.after(() => context.close());
  await allowUnrestrictedNavigation(context);
  const page = await context.newPage(), errors = [], failedAssets = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failedAssets.push(response.url()); });
  await page.route(/^https?:/, route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  const base = hosted ? `${origin}/puzzle-26/index.html` : pathToFileURL(path.join(ROOT, "index.html")).href;
  await page.goto(`${base}#/category/${category}`);
  await page.locator("#puzzle-list").waitFor();
  t.after(() => { assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []); });
  return page;
}

async function goCategory(page, color) {
  await page.evaluate(color => { location.hash = `#/category/${color}`; }, color);
  await page.locator(`.category-page[aria-label="${color.toUpperCase()} puzzles"]`).waitFor();
}

test("tasks follow the approved stable IDs, cards, people, and silver/gold tiers", async t => {
  const page = await fixture(t);
  const actual = await page.evaluate(() => SITE_CONFIG.categories.flatMap(category => category.puzzles
    .filter(puzzle => puzzle.task).map(puzzle => [puzzle.id, puzzle.task.person, puzzle.task.card, puzzle.tier])));
  assert.deepEqual(actual, Object.entries(TASKS).map(([id, [person, card]]) => [id, person, card,
    ["white-3", "blue-2", "black-3", "red-1", "green-3"].includes(id) ? "uncommon" : "rare"]));
});

test("unsolved tasks and solved puzzles without tasks have no envelopes or task text", async t => {
  const page = await fixture(t, { progress: { version: 1, identityVerified: true, puzzles: { "white-1": { solved: true, correctAnswer: "PATRICK", attempts: ["PATRICK"] } } } });
  for (const color of ["white", "blue", "black", "red", "green", "phyrexian"]) {
    await goCategory(page, color);
    assert.equal(await page.locator(".task-envelope, .task-popover").count(), 0);
  }
});

for (const width of [1152, 320]) {
  test(`all ten tasks appear only beside their solved puzzle, with hover and no progress changes (${width}px)`, async t => {
    const page = await fixture(t, { width });
    for (const color of ["white", "blue", "black", "red", "green"]) {
      await goCategory(page, color);
      assert.equal(await page.locator(".puzzle-button").count(), 4);
      assert.equal(await page.locator(".task-envelope").count(), 2);
      for (const [id, [person]] of Object.entries(TASKS).filter(([id]) => id.startsWith(color))) {
        const row = page.locator(`[data-puzzle-id="${id}"]`), envelope = row.locator(".task-envelope"), popup = row.locator(".task-popover");
        assert.equal(await popup.isVisible(), false);
        const puzzleBox = await row.locator(".puzzle-button").boundingBox(), envelopeBox = await envelope.boundingBox();
        assert.ok(envelopeBox.x >= puzzleBox.x + puzzleBox.width, "envelope is outside the puzzle navigation button, on its right");
        assert.equal(await row.locator(".puzzle-button .task-envelope").count(), 0);
        const originalURL = page.url();
        await envelope.hover();
        await popup.waitFor();
        assert.equal(await popup.locator(".task-person").textContent(), person);
        assert.equal(await envelope.getAttribute("aria-expanded"), "true");
        assert.doesNotMatch(await popup.textContent(), /Daniel task:|Daniel will get the task|Instructions|Some of the tasks require/);
        await popup.hover();
        assert.equal(await popup.isVisible(), true, "hovering the task keeps it readable");
        if (id === "red-4") {
          await popup.locator("img").waitFor();
          await page.waitForFunction(() => document.querySelector(".task-picture").naturalWidth === 638);
        }
        const box = await popup.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
        assert.ok(box.y >= 0 && box.y + box.height <= (width === 320 ? 568 : 950) + 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(page.url(), originalURL, "envelope never navigates into the puzzle");
        if (process.env.PUZZLE_SCREENSHOT_DIR && ["white-3", "blue-3", "red-4"].includes(id)) {
          await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `task-${id}-${width}.png`) });
        }
        await page.keyboard.press("Escape");
        assert.equal(await popup.isVisible(), false);
        await page.mouse.move(0, 0);
      }
    }
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), solved);
  });
}

test("keyboard focus, Escape, outside click, navigation, and reset dismiss tasks", async t => {
  const page = await fixture(t);
  const envelope = page.getByRole("button", { name: "Task from Helen Wang", exact: true });
  await envelope.focus();
  assert.equal(await page.locator("#task-white-3").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#task-white-3").isVisible(), false);
  assert.equal(await envelope.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#task-white-3").isVisible(), true);
  await page.locator("#category-banner").click();
  assert.equal(await page.locator("#task-white-3").isVisible(), false);
  await envelope.hover();
  await page.locator('[data-puzzle-id="white-3"] .puzzle-button').click();
  await page.locator(".puzzle-page").waitFor();
  assert.equal(await page.locator(".task-popover").count(), 0);
  await page.locator("#back-button").click();
  await page.locator(".task-envelope").first().waitFor();
  await page.getByRole("button", { name: "Open instructions", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Clear local progress", exact: true }).click();
  await page.locator("#identity-answer").fill("BUM");
  await page.locator("#identity-answer").press("Enter");
  await page.locator("#category-grid").waitFor();
  await page.getByRole("button", { name: "Open WHITE category", exact: true }).click();
  assert.equal(await page.locator(".task-envelope").count(), 0);
});

test("mobile taps toggle the task without opening the puzzle", async t => {
  const page = await fixture(t, { width: 320, touch: true });
  const envelope = page.getByRole("button", { name: "Task from Helen Wang", exact: true });
  await envelope.tap();
  assert.equal(await page.locator("#task-white-3").isVisible(), true);
  await envelope.tap();
  assert.equal(await page.locator("#task-white-3").isVisible(), false);
  assert.ok(page.url().endsWith("#/category/white"));
});

test("solving a task-bearing puzzle unlocks its envelope after returning and reloading", async t => {
  const page = await fixture(t, { progress: { version: 1, identityVerified: true, puzzles: {} }, hosted: false, category: "black" });
  await page.getByRole("button", { name: "A Six-Foot Thick Wooden Door, uncommon", exact: true }).click();
  await page.locator("#puzzle-answer").fill("174410441");
  await page.locator("#puzzle-answer").press("Enter");
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".task-envelope").count(), 0, "task is shown on the list, not added to the puzzle body");
  await page.locator("#back-button").click();
  await page.getByRole("button", { name: "Task from Aivant", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Task from Aivant", exact: true }).hover();
  assert.equal(await page.locator("#task-black-3").isVisible(), true);
  assert.equal(await page.locator(".task-envelope").count(), 1);
});

test("Bryan has no QR code, quiz link, or handout instructions; Annie retains the reference picture", async t => {
  const page = await fixture(t, { category: "blue" });
  await page.getByRole("button", { name: "Task from Bryan", exact: true }).hover();
  const bryan = page.locator("#task-blue-3");
  assert.equal(await bryan.locator("img, svg, canvas, a").count(), 0);
  assert.equal(await bryan.locator(".task-description").textContent(), "Take an Oregon quiz together. You owe 10 bucks if you score lower. Brian will have the QR code for the quiz.");
  await goCategory(page, "red");
  await page.getByRole("button", { name: "Task from Annie", exact: true }).hover();
  await page.waitForFunction(() => document.querySelector("#task-red-4 img").naturalWidth === 638);
  assert.equal(await page.locator("#task-red-4 img").getAttribute("src"), "assets/task-wheelbarrow.png");
});
