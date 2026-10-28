"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const KEY = "puzzle-26:v1:progress";
const TITLE = "To Sum Up Our Experiences?";
const SOURCE_HINTS = [
  "Puffy apartment tour treat",
  "How to make a hollow glazed cream tube",
  "Safe harbor after circumnavigation",
  "Solid clubbing",
  "Ol reliable, but toss the jogi gui",
  "All aboard the fast way back to 395",
];
const SHUFFLED_HINTS = [4, 0, 3, 2, 5, 1].map(index => SOURCE_HINTS[index]);
const progress = { version: 1, identityVerified: true, puzzles: {
  "red-1": { solved: true, attempts: ["GLORYBRINGER"] },
  "red-2": { solved: false, attempts: ["EARLIER GUESS"] },
  "red-3": { solved: false, attempts: [] },
  "red-4": { solved: true, attempts: ["TRIPLE TRACTOR"] },
  "blue-4": { solved: false, attempts: [], grading: {} },
} };
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(t, width = 1152) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], remote = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, route => {
    if (!route.request().url().startsWith("https://fonts.googleapis.com/")) remote.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  await page.goto(URL + "#/category/red");
  assert.equal(await page.locator(".puzzle-name").nth(1).textContent(), TITLE);
  await page.getByRole("button", { name: TITLE + ", common", exact: true }).click();
  await page.locator("#puzzle-hints").waitFor();
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, [], "hints load locally without Notion or a grading service");
  });
  return page;
}

for (const width of [1152, 320]) {
  test("Red 02 shows exactly six unlabelled hints in a fixed shuffled order at " + width + "px", async t => {
    const page = await fixture(t, width);
    assert.ok(page.url().endsWith("#/puzzle/red-2"));
    assert.equal(await page.locator("h1").textContent(), TITLE);
    assert.equal(await page.locator(".puzzle-subtitle").textContent(), "I just naturally know my way around");
    assert.equal(await page.title(), TITLE + " · RED · Puzzle 26");
    const hints = await page.locator("#puzzle-hints li").allTextContents();
    assert.deepEqual(hints, SHUFFLED_HINTS);
    assert.deepEqual([...hints].sort(), [...SOURCE_HINTS].sort(), "every hint is included once with literal wording");
    assert.notDeepEqual(hints, SOURCE_HINTS);
    assert.equal(await page.locator("#puzzle-hints").evaluate(list => list.tagName), "UL");
    assert.equal(await page.locator(".placeholder-puzzle, .lede").count(), 0);
    assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
    assert.doesNotMatch(await page.locator("#app").innerText(), /\b(?:Uluh|Atelier|Tsurutontan|Mission|BCD|Ferry Midtown|124|street|avenue)\b/i);
    const answer = await page.locator("#puzzle-answer").boundingBox();
    const hintList = await page.locator("#puzzle-hints").boundingBox();
    assert.ok(answer.y + answer.height < hintList.y, "answer form stays above hints");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    await page.reload();
    await page.locator("#puzzle-hints").waitFor();
    assert.deepEqual(await page.locator("#puzzle-hints li").allTextContents(), hints);
    await page.locator("#back-button").click();
    await page.locator("#puzzle-list").waitFor();
    await page.getByRole("button", { name: TITLE + ", common", exact: true }).click();
    await page.locator("#puzzle-hints").waitFor();
    assert.deepEqual(await page.locator("#puzzle-hints li").allTextContents(), hints);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "red-02-" + width + ".png"), fullPage: true });
    }
  });
}

test("124 solves Red 02 through normal answer verification and preserves other progress", async t => {
  const page = await fixture(t);
  for (const answer of ["ANSWER", "123", "0124"]) {
    await page.locator("#puzzle-answer").fill(answer);
    await page.locator("#puzzle-answer").press("Enter");
    await page.waitForFunction(answer =>
      document.querySelector(".feedback")?.textContent.includes("Not quite.") &&
      [...document.querySelectorAll(".attempt-list li")].at(-1)?.textContent === answer,
    answer);
  }
  await page.locator("#puzzle-answer").fill("  124  ");
  await page.locator("#puzzle-answer").press("Enter");
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".correct-attempt").textContent(), "124");
  assert.equal(await page.locator(".correct-attempt").evaluate(node => getComputedStyle(node).color), "rgb(54, 87, 31)");
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(saved.puzzles["red-2"].solved, true);
  assert.deepEqual(saved.puzzles["red-2"].attempts, ["EARLIER GUESS", "ANSWER", "123", "0124", "124"]);
  for (const id of ["red-1", "red-3", "red-4", "blue-4"]) assert.deepEqual(saved.puzzles[id], progress.puzzles[id]);
  await page.reload();
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  assert.deepEqual(await page.locator("#puzzle-hints li").allTextContents(), SHUFFLED_HINTS);
  await page.locator("#back-button").click();
  await page.locator('.puzzle-button:nth-child(2) .puzzle-status:text-is("124")').waitFor();
});
