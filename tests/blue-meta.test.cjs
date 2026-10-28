"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const KEY = "puzzle-26:v1:progress";
const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const DECKLIST = "4 Drowner of Hope\n4 Eldrazi Mimic\n3 Eldrazi Obligator\n4 Eldrazi Skyspawner\n4 Endless One\n4 Reality Smasher\n2 Ruination Guide\n4 Thought-Knot Seer\n4 Vile Aggregate\n3 Dismember\n3 Cavern of Souls\n4 Eldrazi Temple\n4 Eye of Ugin\n1 Gemstone Caverns\n2 Island\n4 Scalding Tarn\n4 Shivan Reef\n2 Steam Vents\n\nSideboard\n2 Chalice of the Void\n2 Gut Shot\n3 Hurkyl's Recall\n1 Ratchet Bomb\n2 Relic of Progenitus\n1 Spellskite\n3 Stubborn Denial\n1 Tomb of the Spirit Dragon";
const priorProgress = {
  version: 1, identityVerified: true,
  puzzles: {
    "blue-1": { solved: false, attempts: ["EARLIER GUESS"] },
    "blue-2": { solved: false, attempts: [] },
    "blue-4": { solved: false, attempts: [], grading: { teams: [{ jobId: "existing-teams", status: "complete", score: 34, maximumScore: 100 }] } },
    "blue-3": { solved: false, attempts: ["OLDER GUESS"] },
    "black-4": { solved: true, attempts: ["ESPIONAGE"] },
  },
};
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(t, width = 1152) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], unexpectedRequests = [];
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, route => {
    if (!route.request().url().startsWith("https://fonts.googleapis.com/")) unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress: priorProgress });
  await page.goto(URL + "#/category/blue");
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "decklist needs no remote data or grading service");
  });
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["Jack be Nimble", "Double Trouble", "Endless Gacha", "Fields of Knowledge"]);
  assert.deepEqual(await page.locator(".puzzle-rarity-symbol").evaluateAll(images => images.map(image => image.alt)), ["common", "common", "uncommon", "rare"]);
  const button = page.getByRole("button", { name: "Fields of Knowledge, rare", exact: true });
  assert.equal(await button.isEnabled(), true, "no unrequested prerequisite added");
  await button.click();
  await page.locator("#puzzle-statement").waitFor();
  return page;
}

for (const width of [1152, 320]) {
  test("Blue meta shows the exact Eldrazi Aggro decklist at " + width + "px", async t => {
    const page = await fixture(t, width);
    assert.ok(page.url().endsWith("#/puzzle/blue-3"));
    assert.equal(await page.locator("h1").textContent(), "Fields of Knowledge");
    assert.equal(await page.locator("#puzzle-statement").textContent(), DECKLIST);
    assert.equal(await page.locator(".puzzle-statement").textContent(), DECKLIST);
    const [main, side] = (await page.locator("#puzzle-statement").textContent()).split("\n\nSideboard\n");
    const count = section => section.split("\n").reduce((sum, line) => sum + Number(line.split(" ")[0]), 0);
    assert.equal(count(main), 60);
    assert.equal(count(side), 15);
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.doesNotMatch(await page.locator("#app").innerText(), /\bJIACHEN\b|Feeder|Solve:|will be added later/);
    assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
    assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["OLDER GUESS"]);
    const answer = await page.locator("#puzzle-answer").boundingBox(), deck = await page.locator("#puzzle-statement").boundingBox();
    assert.ok(answer.y + answer.height < deck.y);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), priorProgress);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "blue-04-" + width + ".png"), fullPage: true });
    }
  });
}

test("JIACHEN solves Blue meta, rejects ANSWER, and preserves local progress", async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite."));
  await page.locator("#puzzle-answer").fill("jiachen");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "JIACHEN");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.equal(await page.locator("#puzzle-statement").textContent(), DECKLIST);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["OLDER GUESS", "ANSWER", "JIACHEN"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["blue-3"].solved, true);
  for (const id of ["blue-1", "blue-2", "blue-4", "black-4"]) assert.deepEqual(stored.puzzles[id], priorProgress.puzzles[id]);
  await page.locator("#back-button").click();
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").nth(3).locator(".puzzle-status").textContent().then(text => text.trim()), "JIACHEN");
});
