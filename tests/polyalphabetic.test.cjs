"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const KEY = "puzzle-26:v1:progress";
const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const STATEMENT = "Jt drvum jf a gufjt idcjgfwc biau winbm uhshf ynwqlf kbyymo tp kben tffu winrz noclmnb iu hppf cxlby – xkp jam uhfb srwojnh?\nI_ _____ b_ _ _____ ac_____t ____ t___e _____ ____l_ ____e_ __ ___e ____ ___i_ _______ a_ ____ ___b_ _ ___ ___ ____ __ng____";
const priorProgress = {
  version: 1, identityVerified: true,
  puzzles: {
    "black-1": { solved: false, attempts: ["EARLIER GUESS"] },
    "black-3": { solved: true, attempts: ["174410441"] },
    "blue-4": { solved: false, attempts: [], grading: {} },
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
  await page.getByRole("button", { name: "Very Weak, common", exact: true }).click();
  await page.locator("#puzzle-statement").waitFor();
  return page;
}

for (const width of [1152, 320]) {
  test("Black 01 preserves exact text and character alignment at " + width + "px", async t => {
    const page = await fixture(t, width);
    assert.ok(page.url().endsWith("#/puzzle/black-1"));
    assert.equal(await page.locator("h1").textContent(), "Very Weak");
    const statement = page.locator("#puzzle-statement");
    assert.equal(await statement.inputValue(), STATEMENT);
    assert.equal(await statement.isEditable(), false);
    assert.equal(await statement.getAttribute("wrap"), "off");
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.doesNotMatch(await page.locator("#app").innerText(), /10131998|It could be a freak accident|FINAL puzzle|LANDS|will be added later/);
    const alignment = await statement.evaluate(box => {
      const rows = box.value.split("\n"), style = getComputedStyle(box);
      const context = document.createElement("canvas").getContext("2d");
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.fontKerning = "none";
      const widths = [...new Set(rows.join(""))].map(character => context.measureText(character).width);
      const underscore = context.measureText("_");
      const gap = parseFloat(style.letterSpacing);
      return {
        lengths: rows.map(row => row.length),
        aligned: Math.max(...widths) - Math.min(...widths) < 0.01,
        noWrap: box.wrap === "off" && style.whiteSpace === "pre",
        noVerticalOverflow: box.scrollHeight <= box.clientHeight,
        canScroll: box.scrollWidth > box.clientWidth,
        weight: style.fontWeight,
        fontFamily: style.fontFamily,
        underlineGap: underscore.width + gap - underscore.actualBoundingBoxLeft - underscore.actualBoundingBoxRight,
      };
    });
    assert.deepEqual(alignment.lengths, [124, 124]);
    assert.equal(alignment.aligned, true);
    assert.equal(alignment.noWrap, true);
    assert.equal(alignment.noVerticalOverflow, true);
    assert.equal(alignment.canScroll, true);
    assert.equal(alignment.weight, "400");
    assert.match(alignment.fontFamily, /IBM Plex Mono/);
    assert.ok(alignment.underlineGap >= 1, "each underline has a visible gap before the next");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const answer = await page.locator("#puzzle-answer").boundingBox(), body = await statement.boundingBox();
    assert.ok(answer.y + answer.height < body.y);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "black-01-" + width + ".png"), fullPage: true });
    }
    await statement.focus();
    await statement.evaluate(box => box.setSelectionRange(box.value.length - 1, box.value.length - 1));
    await statement.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector("#puzzle-statement").scrollLeft > 0);
    await statement.evaluate(pre => { pre.scrollLeft = 0; pre.blur(); });
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), priorProgress);
  });
}

test("Black 01 accepts LANDS, rejects ANSWER, and retains history on reload", async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite."));
  await page.locator("#puzzle-answer").fill("lands");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "LANDS");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.equal(await page.locator("#puzzle-statement").inputValue(), STATEMENT);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS", "ANSWER", "LANDS"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["black-1"].solved, true);
  assert.deepEqual(stored.puzzles["black-3"], priorProgress.puzzles["black-3"]);
  assert.deepEqual(stored.puzzles["blue-4"], priorProgress.puzzles["blue-4"]);
  await page.locator("#back-button").click();
  await page.waitForURL(/#\/category\/black$/);
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").first().locator(".puzzle-status").textContent().then(text => text.trim()), "LANDS");
});
