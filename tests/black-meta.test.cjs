"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const KEY = "puzzle-26:v1:progress";
const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const DECKLIST = "2 Pestermite\n4 Serum Visions\n4 Deceiver Exarch\n4 Lightning Bolt\n1 Desolate Lighthouse\n2 Vendilion Clique\n3 Steam Vents\n1 Flame Slash\n1 Stomping Ground\n4 Misty Rainforest\n1 Mountain\n5 Island\n4 Splinter Twin\n4 Sulfur Falls\n1 Dispel\n2 Cryptic Command\n2 Electrolyze\n4 Scalding Tarn\n2 Spell Snare\n4 Remand\n1 Tectonic Edge\n1 Peek\n3 Snapcaster Mage\n\nSIDEBOARD\n1 Ancient Grudge\n1 Anger of the Gods\n2 Blood Moon\n1 Dispel\n1 Flame Slash\n1 Jace, Architect of Thought\n2 Keranos, God of Storms\n1 Negate\n1 Pyroclasm\n1 Shatterstorm\n2 Spellskite\n1 Threads of Disloyalty";
const priorProgress = {
  version: 1, identityVerified: true,
  puzzles: {
    "black-1": { solved: false, attempts: ["EARLIER GUESS"] },
    "black-2": { solved: false, attempts: [] },
    "black-3": { solved: false, attempts: [] },
    "black-4": { solved: false, attempts: ["OLDER GUESS"] },
    "red-3": { solved: true, attempts: ["CHAINWHIRLER"] },
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
  await page.goto(URL + "#/category/black");
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "no Notion or grading requests");
  });
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["Very Weak", "ADFGVXCODE", "A Six-Foot Thick Wooden Door", "The Declaration of Independence"]);
  const button = page.getByRole("button", { name: "The Declaration of Independence, rare", exact: true });
  assert.equal(await button.isEnabled(), true, "no unrequested prerequisite added");
  await button.click();
  await page.locator("#puzzle-statement").waitFor();
  return page;
}

for (const width of [1152, 320]) {
  test("The Declaration of Independence shows only the exact final decklist at " + width + "px", async t => {
    const page = await fixture(t, width);
    assert.ok(page.url().endsWith("#/puzzle/black-4"));
    assert.equal(await page.locator("h1").textContent(), "The Declaration of Independence");
    assert.equal(await page.locator("#puzzle-statement").textContent(), DECKLIST);
    assert.equal(await page.locator(".puzzle-statement").textContent(), DECKLIST);
    const [main, side] = (await page.locator("#puzzle-statement").textContent()).split("\n\nSIDEBOARD\n");
    assert.equal(main.split("\n").length, 23);
    assert.equal(side.split("\n").length, 12);
    const count = section => section.split("\n").reduce((sum, line) => sum + Number(line.split(" ")[0]), 0);
    assert.equal(count(main), 60);
    assert.equal(count(side), 15);
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.doesNotMatch(await page.locator("#app").innerText(), /\b(LANDS|SHIFT|ESPIONAGE)\b|174410441|Feeder|Solve:|will be added later/);
    assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
    assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["OLDER GUESS"]);
    const answer = await page.locator("#puzzle-answer").boundingBox(), deck = await page.locator("#puzzle-statement").boundingBox();
    assert.ok(answer.y + answer.height < deck.y);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), priorProgress);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "black-04-" + width + ".png"), fullPage: true });
    }
  });
}

test("ESPIONAGE solves The Declaration of Independence, rejects ANSWER, and preserves local progress", async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite."));
  await page.locator("#puzzle-answer").fill("espionage");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "ESPIONAGE");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.equal(await page.locator("#puzzle-statement").textContent(), DECKLIST);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["OLDER GUESS", "ANSWER", "ESPIONAGE"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["black-4"].solved, true);
  for (const id of ["black-1", "black-2", "black-3", "red-3"]) assert.deepEqual(stored.puzzles[id], priorProgress.puzzles[id]);
  await page.locator("#back-button").click();
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").nth(3).locator(".puzzle-status").textContent().then(text => text.trim()), "ESPIONAGE");
});
