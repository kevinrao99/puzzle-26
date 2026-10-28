"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const KEY = "puzzle-26:v1:progress";
const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const STATEMENT = "A = (164, 881)\nB = (1665, 1233)\nG = (10, 13)\nE: y^2 = x^3 + 3x - 861\np = 11287";
const priorProgress = {
  version: 1,
  identityVerified: true,
  puzzles: {
    "black-3": { solved: false, attempts: ["EARLIER GUESS"] },
    "black-2": { solved: true, attempts: ["ANSWER"] },
    "blue-4": { solved: false, attempts: [], grading: {} },
  },
};
let browser;

before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => { await browser?.close(); });

async function fixture(t, width = 1152) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], unexpectedRequests = [];
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, route => {
    if (!route.request().url().startsWith("https://fonts.googleapis.com/")) {
      unexpectedRequests.push(route.request().url());
    }
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress: priorProgress });
  await page.goto(`${URL}#/category/black`);
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "no Notion or grading requests");
  });
  return page;
}

test("Black 03 displays the exact ECC statement without solution notes", async t => {
  const page = await fixture(t);
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["Very Weak", "ADFGVXCODE", "A Six-Foot Thick Wooden Door", "The Declaration of Independence"]);
  await page.getByRole("button", { name: "A Six-Foot Thick Wooden Door, uncommon", exact: true }).click();
  await page.locator("#puzzle-statement").waitFor();
  assert.ok(page.url().endsWith("#/puzzle/black-3"));
  assert.equal(await page.locator("h1").textContent(), "A Six-Foot Thick Wooden Door");
  assert.equal(await page.locator("#puzzle-statement").textContent(), STATEMENT);
  assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
  assert.doesNotMatch(await page.locator("#app").innerText(), /pohlig|hellman|174410441|1744,\s*10441|will be added later/i);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS"]);
  assert.equal(await page.getByRole("button", { name: "Submit answer", exact: true }).textContent(), "→");
  const answer = await page.locator("#puzzle-answer").boundingBox();
  const statement = await page.locator("#puzzle-statement").boundingBox();
  assert.ok(answer.y + answer.height < statement.y, "answer form stays above the statement");
  await page.getByRole("button", { name: "Open instructions" }).click();
  assert.equal(await page.locator("#help-dialog").isVisible(), true);
  await page.getByRole("button", { name: "Close instructions" }).click();
});

test("ECC rejects the placeholder answer, accepts the requested digits, and preserves progress", async t => {
  const page = await fixture(t);
  await page.getByRole("button", { name: "A Six-Foot Thick Wooden Door, uncommon", exact: true }).click();
  for (const answer of ["ANSWER", "174410411"]) {
    await page.locator("#puzzle-answer").fill(answer);
    await page.getByRole("button", { name: "Submit answer", exact: true }).click();
    await page.waitForFunction(submittedAnswer =>
      document.querySelector(".feedback")?.textContent.includes("Not quite.") &&
      [...document.querySelectorAll(".attempt-list li")].at(-1)?.textContent === submittedAnswer,
    answer);
    assert.equal(await page.getByRole("button", { name: "Submit answer", exact: true }).textContent(), "→");
  }
  await page.locator("#puzzle-answer").fill("174410441");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.equal(await page.locator("#puzzle-statement").textContent(), STATEMENT);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS", "ANSWER", "174410411", "174410441"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["black-3"].solved, true);
  assert.deepEqual(stored.puzzles["black-2"], priorProgress.puzzles["black-2"]);
  assert.deepEqual(stored.puzzles["blue-4"], priorProgress.puzzles["blue-4"]);
  await page.locator("#back-button").click();
  await page.waitForURL(/#\/category\/black$/);
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").nth(2).locator(".puzzle-status").textContent().then(text => text.trim()), "174410441");
});

test("ECC statement and answer form fit a narrow mobile viewport", async t => {
  const page = await fixture(t, 320);
  await page.getByRole("button", { name: "A Six-Foot Thick Wooden Door, uncommon", exact: true }).click();
  assert.equal(await page.locator("#puzzle-statement").textContent(), STATEMENT);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator("#puzzle-answer").evaluate(input => getComputedStyle(input).fontWeight), "400");
});
