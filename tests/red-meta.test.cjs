"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const KEY = "puzzle-26:v1:progress";
const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const DECKLIST = "2 Aether Hub\n4 Canyon Slough\n4 Dragonskull Summit\n14 Mountain\n1 Swamp\n4 Bomat Courier\n2 Glorybringer\n4 Goblin Chainwhirler\n2 Hazoret the Fervent\n2 Kari Zev, Skyship Raider\n2 Pia Nalaar\n2 Rekindling Phoenix\n4 Scrapheap Scrounger\n3 Abrade\n1 Cut // Ribbons\n2 Doomfall\n2 Magma Spray\n2 Chandra, Torch of Defiance\n2 Heart of Kiran\n1 Karn, Scion of Urza\n\nSIDEBOARD\n3 Chandra's Defeat\n1 Chandra, Torch of Defiance\n2 Doomfall\n2 Duress\n2 Karn, Scion of Urza\n1 Magma Spray\n1 Pia Nalaar\n1 Siege-Gang Commander\n1 Sorcerous Spyglass\n1 The Eldest Reborn";
const priorProgress = {
  version: 1, identityVerified: true,
  puzzles: {
    "red-1": { solved: false, attempts: ["EARLIER GUESS"] },
    "red-2": { solved: false, attempts: [] },
    "red-3": { solved: false, attempts: [] },
    "red-4": { solved: false, attempts: ["OLDER GUESS"] },
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
  await page.goto(URL + "#/category/red");
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "decklist needs no remote data or grading service");
  });
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["Aspire for Greatness", "To Sum Up Our Experiences?", "Permitted Travel", "Skill Based Game"]);
  assert.deepEqual(await page.locator(".puzzle-rarity-symbol").evaluateAll(images => images.map(image => image.alt)), ["common", "common", "uncommon", "rare"]);
  const button = page.getByRole("button", { name: "Skill Based Game, rare", exact: true });
  assert.equal(await button.isEnabled(), true, "no unrequested prerequisite added");
  await button.click();
  await page.locator("#puzzle-statement").waitFor();
  return page;
}

for (const width of [1152, 320]) {
  test("Red meta shows the exact Rakdos Aggro decklist at " + width + "px", async t => {
    const page = await fixture(t, width);
    assert.ok(page.url().endsWith("#/puzzle/red-4"));
    assert.equal(await page.locator("h1").textContent(), "Skill Based Game");
    assert.equal(await page.locator("#puzzle-statement").textContent(), DECKLIST);
    assert.equal(await page.locator(".puzzle-statement").textContent(), DECKLIST);
    const [main, side] = (await page.locator("#puzzle-statement").textContent()).split("\n\nSIDEBOARD\n");
    const count = section => section.split("\n").reduce((sum, line) => sum + Number(line.split(" ")[0]), 0);
    assert.equal(count(main), 60);
    assert.equal(count(side), 15);
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.doesNotMatch(await page.locator("#app").innerText(), /\bTRIPLE TRACTOR\b|Feeder|Solve:|will be added later/);
    assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
    assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["OLDER GUESS"]);
    const answer = await page.locator("#puzzle-answer").boundingBox(), deck = await page.locator("#puzzle-statement").boundingBox();
    assert.ok(answer.y + answer.height < deck.y);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), priorProgress);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "red-04-" + width + ".png"), fullPage: true });
    }
  });
}

test("TRIPLE TRACTOR solves Red meta with normal whitespace handling and saved progress", async t => {
  const page = await fixture(t);
  for (const answer of ["ANSWER", "TRIPLETRACTOR"]) {
    await page.locator("#puzzle-answer").fill(answer);
    await page.getByRole("button", { name: "Submit answer", exact: true }).click();
    await page.waitForFunction(submitted =>
      document.querySelector(".feedback")?.textContent.includes("Not quite.") &&
      [...document.querySelectorAll(".attempt-list li")].at(-1)?.textContent === submitted,
    answer);
  }
  await page.locator("#puzzle-answer").fill("  triple   tractor  ");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "  TRIPLE   TRACTOR  ");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.equal(await page.locator("#puzzle-statement").textContent(), DECKLIST);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["OLDER GUESS", "ANSWER", "TRIPLETRACTOR", "TRIPLE TRACTOR"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["red-4"].solved, true);
  for (const id of ["red-1", "red-2", "red-3", "black-4"]) assert.deepEqual(stored.puzzles[id], priorProgress.puzzles[id]);
  await page.locator("#back-button").click();
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").nth(3).locator(".puzzle-status").textContent().then(text => text.trim()), "TRIPLE TRACTOR");
});
