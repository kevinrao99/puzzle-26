"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const KEY = "puzzle-26:v1:progress";
const COLORS = ["white", "blue", "black", "red", "green"];
const ANSWERS = {
  "white-1": "PATRICK", "white-2": "MARY", "white-3": "JOSEPH", "white-4": "NOTRE DAME",
  "blue-1": "MAYNARD", "blue-4": "GREEN", "blue-2": "KEEL", "blue-3": "JIACHEN",
  "black-1": "LANDS", "black-2": "SHIFT", "black-3": "174410441", "black-4": "ESPIONAGE",
  "red-1": "GLORYBRINGER", "red-2": "124", "red-3": "CHAINWHIRLER", "red-4": "TRIPLE TRACTOR",
  "green-2": "MAILLARD", "green-3": "ATP8", "green-4": "FALCON",
};
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(t, progress, width = 1152) {
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
    if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  await page.goto(URL + "#/");
  t.after(() => { assert.deepEqual(errors, []); assert.deepEqual(remote, [], "saved answers require no backend"); });
  return page;
}

async function correctAttempt(page, answer) {
  await page.locator(".correct-attempt").first().waitFor();
  assert.equal(await page.locator(".correct-attempt").first().textContent(), answer);
  assert.equal(await page.locator(".correct-attempt").first().evaluate(item => getComputedStyle(item).color), "rgb(54, 87, 31)");
  assert.equal(await page.locator(".correct-attempt").first().evaluate(item => getComputedStyle(item).fontWeight), "400");
  assert.equal(await page.locator("#puzzle-answer, #puzzle-answer-form").count(), 0);
  assert.equal(await page.locator(".puzzle-content > .feedback, .page-header > .lede").count(), 0, "solved pages have no extra status messages or empty feedback space");
  assert.equal(await page.getByText("Correct. Puzzle solved.", { exact: true }).count(), 0);
  assert.equal(await page.getByText("This puzzle is solved.", { exact: true }).count(), 0);
}

async function categoryAnswers(page, expected) {
  await page.waitForFunction(expected => {
    const actual = [...document.querySelectorAll(".puzzle-status")].map(node => node.textContent.trim());
    return JSON.stringify(actual) === JSON.stringify(expected);
  }, expected);
}

for (const width of [1152, 320]) {
  test(`reaction assembly accepts MAILLARD with only its I in normal text color (${width}px)`, async t => {
    const otherProgress = { solved: true, correctAnswer: "SHIFT", attempts: ["SHIFT"] };
    const page = await fixture(t, { version: 1, identityVerified: true, puzzles: { "black-2": otherProgress } }, width);
    await page.goto(`${URL}#/puzzle/green-2`);
    for (const answer of ["ANSWER", "INVALID"]) {
      await page.locator("#puzzle-answer").fill(answer);
      await page.getByRole("button", { name: "Submit answer", exact: true }).click();
      await page.getByText("Not quite. Try again.", { exact: true }).waitFor();
      await page.waitForFunction(value => [...document.querySelectorAll(".attempt-list li")].at(-1)?.textContent === value, answer);
    }
    await page.locator(".assembly-piece").first().waitFor();
    const assembly = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).puzzles["green-2"].assembly, KEY);
    await page.locator("#puzzle-answer").fill("maillard");
    await page.getByRole("button", { name: "Submit answer", exact: true }).click();
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      await page.waitForFunction(() => {
        const answer = document.querySelector(".correct-attempt");
        return answer?.textContent === "MAILLARD" && getComputedStyle(answer).color === "rgb(54, 87, 31)";
      });
      await correctAttempt(page, "MAILLARD");
      const answer = page.locator(".correct-attempt");
      assert.equal(await answer.getAttribute("aria-label"), "MAILLARD, correct answer");
      assert.deepEqual(await answer.locator(".correct-attempt-neutral").allTextContents(), ["I"]);
      assert.deepEqual(await answer.evaluate(item => [...item.childNodes].flatMap(node =>
        [...node.textContent].map(character => ({ character, color: getComputedStyle(node.nodeType === Node.TEXT_NODE ? node.parentElement : node).color }))
      )), [..."MAILLARD"].map(character => ({ character, color: character === "I" ? "rgb(36, 28, 18)" : "rgb(54, 87, 31)" })));
      assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["ANSWER", "INVALID", "MAILLARD"]);
      assert.equal(await page.locator(".attempt-list li:not(.correct-attempt) span").count(), 0);
      await page.locator(".assembly-piece").first().waitFor();
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
      assert.deepEqual(saved.puzzles["green-2"].assembly, assembly);
      assert.deepEqual(saved.puzzles["black-2"], otherProgress);
    }
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.locator(".puzzle-content").screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `maillard-answer-${width}.png`) });
    await page.locator("#back-button").click();
    await categoryAnswers(page, ["✓", "", "", ""]);
    await page.goto(`${URL}#/puzzle/black-2`);
    await correctAttempt(page, "SHIFT");
    assert.equal(await page.locator(".correct-attempt-neutral").count(), 0, "other puzzles keep their whole correct answer green");
  });

  test(`green completion checkmarks are enlarged without changing other categories (${width}px)`, async t => {
    const progress = { version: 1, identityVerified: true, puzzles: {
      ...Object.fromEntries([1, 2, 3, 4].map(number => [`green-${number}`, { solved: true, attempts: [] }])),
      "white-1": { solved: true, correctAnswer: "PATRICK", attempts: ["PATRICK"] },
    } };
    const page = await fixture(t, progress, width);
    await page.goto(`${URL}#/category/green`);
    await categoryAnswers(page, ["✓", "✓", "✓", "✓"]);
    assert.equal(await page.locator(".puzzle-status--check").count(), 4);
    for (const check of await page.locator(".puzzle-status--check").all()) {
      assert.equal(await check.evaluate(node => getComputedStyle(node).fontSize), "32px");
      assert.equal(await check.evaluate(node => getComputedStyle(node).color), "rgb(54, 87, 31)");
      assert.equal(await check.evaluate(node => {
        const mark = node.getBoundingClientRect(), button = node.closest("button").getBoundingClientRect();
        return mark.left >= button.left && mark.right <= button.right && mark.top >= button.top && mark.bottom <= button.bottom;
      }), true, "larger checkmark fits inside its puzzle button");
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `green-checkmarks-${width}.png`), fullPage: true });
    await page.goto(`${URL}#/category/white`);
    await categoryAnswers(page, ["PATRICK", "", "", ""]);
    assert.equal(await page.locator(".puzzle-status--check").count(), 0);
    assert.equal(await page.locator(".puzzle-status.solved").evaluate(node => getComputedStyle(node).fontSize), "12px");
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
  });

  test(`solving hides the form, colors the answer, persists once, and updates the category (${width}px)`, async t => {
    const progress = { version: 1, identityVerified: true, puzzles: { "white-1": { solved: true, attempts: ["PATRICK"] } } };
    const page = await fixture(t, progress, width);
    await page.goto(URL + "#/puzzle/blue-1");
    await page.locator("#puzzle-answer").fill("wrong");
    await page.locator("#puzzle-answer").press("Enter");
    await page.getByText("Not quite. Try again.", { exact: true }).waitFor();
    assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
    assert.equal(await page.locator(".correct-attempt").count(), 0);
    await page.locator("#puzzle-answer").fill("  may-nard!  ");
    await page.evaluate(() => {
      window.oldAnswerForm = document.querySelector("#puzzle-answer-form");
      oldAnswerForm.requestSubmit();
      oldAnswerForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await correctAttempt(page, "MAYNARD");
    assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["WRONG", "MAYNARD"]);
    assert.equal(await page.locator("#nim-game").count(), 1, "solved content remains available");
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    assert.equal(saved.puzzles["blue-1"].correctAnswer, "MAYNARD");
    assert.equal(saved.puzzles["blue-1"].solved, true);
    assert.deepEqual(saved.puzzles["white-1"], progress.puzzles["white-1"]);
    await page.evaluate(() => {
      oldAnswerForm.querySelector("input").value = "AFTER SOLVING";
      oldAnswerForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), saved);
    await page.reload();
    await correctAttempt(page, "MAYNARD");
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `solved-puzzle-${width}.png`), fullPage: true });
    await page.locator("#back-button").click();
    await categoryAnswers(page, ["MAYNARD", "", "", ""]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `solved-blue-${width}.png`), fullPage: true });
  });

  test(`all saved puzzles lose their forms; all categories display answers except green checks (${width}px)`, async t => {
    const progress = { version: 1, identityVerified: true, puzzles: {
      "green-1": { solved: true, attempts: ["OLD GUESS"] },
      ...Object.fromEntries(Object.entries(ANSWERS).map(([id, answer]) => [id, { solved: true, attempts: ["BEFORE", answer, "AFTER"] }])),
    } };
    const page = await fixture(t, progress, width);
    for (const color of COLORS) {
      await page.goto(`${URL}#/category/${color}`);
      const ids = (color === "blue" ? [1, 4, 2, 3] : color === "green" ? [2, 1, 3, 4] : color === "red" ? [3, 2, 1, 4] : [1, 2, 3, 4]).map(number => `${color}-${number}`);
      await categoryAnswers(page, ids.map(id => color === "green" ? "✓" : ANSWERS[id]));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `all-solved-${color}-${width}.png`), fullPage: true });
      for (const [position, id] of ids.entries()) {
        await page.locator(".puzzle-button").nth(position).click();
        await page.locator(".puzzle-page").waitFor();
        assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
        if (id !== "green-1") {
          await correctAttempt(page, ANSWERS[id]);
          assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), progress.puzzles[id].attempts, "no guesses reordered or discarded");
        } else {
          await page.locator(".animal-tray").waitFor();
        }
        const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
        for (const [otherId, previous] of Object.entries(progress.puzzles)) {
          assert.deepEqual(saved.puzzles[otherId].attempts, previous.attempts);
          assert.equal(saved.puzzles[otherId].solved, true);
        }
        await page.locator("#back-button").click();
        await page.locator(".puzzle-button").first().waitFor();
      }
    }
  });
}

test("legacy recovery verifies hashes, marks duplicate correct guesses in place, and never changes stored history", async t => {
  const progress = { version: 1, identityVerified: true, puzzles: {
    "blue-1": { solved: true, correctAnswer: "WRONG", attempts: ["MAYNARD", "WRONG", "MAYNARD", "LATER"] },
    "red-1": { solved: true, attempts: ["NOT THE ANSWER"] },
    "red-2": { solved: false, attempts: ["124"] },
  } };
  const page = await fixture(t, progress);
  await page.goto(URL + "#/category/blue");
  await categoryAnswers(page, ["MAYNARD", "", "", ""]);
  await page.locator(".puzzle-button").first().click();
  await correctAttempt(page, "MAYNARD");
  assert.deepEqual(await page.locator(".correct-attempt").allTextContents(), ["MAYNARD", "MAYNARD"]);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), progress.puzzles["blue-1"].attempts);
  await page.goto(URL + "#/category/red");
  await categoryAnswers(page, ["", "", "✓", ""]);
  await page.locator(".puzzle-button").nth(2).click();
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  assert.equal(await page.locator(".correct-attempt").count(), 0);
  await page.goto(URL + "#/puzzle/red-2");
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  assert.equal(await page.locator(".correct-attempt").count(), 0, "a bad saved flag is not silently promoted to solved");
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
});

test("a newly solved green text puzzle colors its answer but shows only a check on the category", async t => {
  const page = await fixture(t, { version: 1, identityVerified: true, puzzles: {} });
  await page.goto(URL + "#/puzzle/green-4");
  await page.locator("#puzzle-answer").fill("falcon");
  await page.locator("#puzzle-answer").press("Enter");
  await correctAttempt(page, "FALCON");
  await page.locator("#back-button").click();
  await categoryAnswers(page, ["", "", "", "✓"]);
  assert.doesNotMatch(await page.locator("#puzzle-list").innerText(), /FALCON|SOLVED/);
});
