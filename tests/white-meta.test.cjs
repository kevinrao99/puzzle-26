"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const KEY = "puzzle-26:v1:progress";
const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const DECKLIST = "4 Blood Crypt\n4 Boros Reckoner\n4 Cartel Aristocrat\n3 Cavern of Souls\n4 Champion of the Parish\n1 Clifftop Retreat\n4 Doomed Traveler\n4 Falkenrath Aristocrat\n4 Godless Shrine\n4 Isolated Chapel\n3 Knight of Infamy\n2 Lingering Souls\n4 Orzhov Charm\n3 Plains\n1 Restoration Angel\n4 Sacred Foundry\n2 Silverblade Paladin\n2 Skirsdag High Priest\n1 Vault of the Archangel\n2 Zealous Conscripts\n\nSideboard (15)\n2 Blasphemous Act\n2 Lingering Souls\n1 Mentor of the Meek\n2 Obzedat, Ghost Council\n2 Rest in Peace\n1 Skirsdag High Priest\n2 Sorin, Lord of Innistrad\n3 Tragic Slip";
const priorProgress = {
  version: 1, identityVerified: true,
  puzzles: {
    "white-1": { solved: false, attempts: ["EARLIER GUESS"] },
    "white-2": { solved: false, attempts: [] },
    "white-3": { solved: false, attempts: [] },
    "white-4": { solved: false, attempts: ["OLDER GUESS"] },
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
  await page.goto(URL + "#/category/white");
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "decklist needs no remote data or grading service");
  });
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["All Around Me Are...", "That Belongs in a Museum", "Classic Angela", "The One Left Out"]);
  assert.deepEqual(await page.locator(".puzzle-rarity-symbol").evaluateAll(images => images.map(image => image.alt)), ["common", "common", "uncommon", "rare"]);
  const button = page.getByRole("button", { name: "The One Left Out, rare", exact: true });
  assert.equal(await button.isEnabled(), true, "no unrequested prerequisite added");
  await button.click();
  await page.locator("#puzzle-statement").waitFor();
  return page;
}

for (const width of [1152, 320]) {
  test("White meta shows the exact supplied decklist at " + width + "px", async t => {
    const page = await fixture(t, width);
    assert.ok(page.url().endsWith("#/puzzle/white-4"));
    assert.equal(await page.locator("h1").textContent(), "The One Left Out");
    assert.equal(await page.locator("#puzzle-statement").textContent(), DECKLIST);
    assert.equal(await page.locator(".puzzle-statement").textContent(), DECKLIST);
    const [main, side] = (await page.locator("#puzzle-statement").textContent()).split("\n\nSideboard (15)\n");
    const count = section => section.split("\n").reduce((sum, line) => sum + Number(line.split(" ")[0]), 0);
    assert.equal(count(main), 60);
    assert.equal(count(side), 15);
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.doesNotMatch(await page.locator("#app").innerText(), /\bNOTRE DAME\b|Feeder|Solve:|will be added later/);
    assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
    assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["OLDER GUESS"]);
    const answer = await page.locator("#puzzle-answer").boundingBox(), deck = await page.locator("#puzzle-statement").boundingBox();
    assert.ok(answer.y + answer.height < deck.y);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), priorProgress);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "white-04-" + width + ".png"), fullPage: true });
    }
  });
}

test("NOTRE DAME solves White meta with normal whitespace handling and saved progress", async t => {
  const page = await fixture(t);
  for (const answer of ["ANSWER", "NOTREDAME"]) {
    await page.locator("#puzzle-answer").fill(answer);
    await page.getByRole("button", { name: "Submit answer", exact: true }).click();
    await page.waitForFunction(submitted =>
      document.querySelector(".feedback")?.textContent.includes("Not quite.") &&
      [...document.querySelectorAll(".attempt-list li")].at(-1)?.textContent === submitted,
    answer);
  }
  await page.locator("#puzzle-answer").fill("  notre   dame  ");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "  NOTRE   DAME  ");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.equal(await page.locator("#puzzle-statement").textContent(), DECKLIST);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["OLDER GUESS", "ANSWER", "NOTREDAME", "NOTRE DAME"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["white-4"].solved, true);
  for (const id of ["white-1", "white-2", "white-3", "black-4"]) assert.deepEqual(stored.puzzles[id], priorProgress.puzzles[id]);
  await page.locator("#back-button").click();
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").nth(3).locator(".puzzle-status").textContent().then(text => text.trim()), "NOTRE DAME");
});
