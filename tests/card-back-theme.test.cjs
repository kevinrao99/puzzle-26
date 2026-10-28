"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const KEY = "puzzle-26:v1:progress";
const COLORS = ["white", "blue", "black", "red", "green"];
const progress = {
  version: 1, identityVerified: true,
  puzzles: { "white-1": { solved: true, attempts: ["PATRICK"] } },
};
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(t, width = 1152, height = 950, verified = true) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], unexpectedRequests = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, route => {
    if (!route.request().url().startsWith("https://fonts.googleapis.com/")) unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress: { ...progress, identityVerified: verified } });
  await page.goto(URL + "#/");
  await page.locator(verified ? "#category-grid" : "#identity-form").waitFor();
  await page.evaluate(async () => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "theme requires no remote artwork or backend");
  });
  return page;
}

for (const [width, height] of [[1152, 950], [390, 844], [320, 568], [812, 375]]) {
  test(`unlabeled circles form the card-back pentagon at ${width} x ${height}`, async t => {
    const page = await fixture(t, width, height);
    assert.deepEqual(await page.evaluate(() => [document.body, document.querySelector("#category-grid")].map(element => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.backgroundImage];
    })), [["rgb(64, 45, 19)", "none"], ["rgb(139, 85, 35)", "none"]]);
    assert.equal(await page.locator(".category-button").count(), 5);
    assert.equal(await page.locator(".home-page h1, .home-page .eyebrow, .home-page .lede, .category-name, .category-count").count(), 0);
    assert.doesNotMatch(await page.locator(".home-page").textContent(), /PUZZLE 26|Choose a category|Select a color|WHITE|BLUE|BLACK|RED|GREEN/);
    const points = [];
    for (const color of COLORS) {
      const button = page.getByRole("button", { name: `Open ${color.toUpperCase()} category`, exact: true });
      const box = await button.boundingBox();
      assert.ok(Math.abs(box.width - box.height) < 0.1, `${color} stays circular`);
      assert.ok(box.width >= 44, "minimum touch target");
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(box.y >= 10 && box.y + box.height <= height - 10, "all circles fit without scrolling");
      assert.equal(await button.evaluate(el => getComputedStyle(el).borderRadius), "50%");
      const hidden = button.locator(".sr-only");
      assert.equal(await button.getAttribute("aria-describedby"), await hidden.getAttribute("id"));
      assert.equal(await hidden.evaluate(el => getComputedStyle(el).clipPath), "inset(50%)");
      assert.equal((await hidden.boundingBox()).width, 1);
      points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    const [white, blue, black, red, green] = points;
    assert.ok(white.y < blue.y && blue.y < black.y);
    assert.ok(green.x < red.x && red.x < white.x && white.x < black.x && black.x < blue.x);
    assert.ok(Math.abs(blue.y - green.y) < 1 && Math.abs(black.y - red.y) < 1);
    const sides = points.map((point, i) => Math.hypot(point.x - points[(i + 1) % 5].x, point.y - points[(i + 1) % 5].y));
    assert.ok(Math.max(...sides) - Math.min(...sides) < 2, "five equally spaced vertices");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `card-back-${width}-${height}.png`), fullPage: true });
  });
}

test("all five circles navigate by mouse or keyboard, with help, back, and saved progress intact", async t => {
  const page = await fixture(t);
  assert.equal(await page.locator("#category-progress-white").textContent(), "1 / 4 SOLVED");
  for (const color of COLORS) {
    const button = page.getByRole("button", { name: `Open ${color.toUpperCase()} category`, exact: true });
    if (color === "white") {
      await page.keyboard.press("Tab");
      assert.equal(await button.evaluate(el => el === document.activeElement), true);
      assert.equal(await button.evaluate(el => getComputedStyle(el).outlineStyle), "solid");
      await page.keyboard.press("Enter");
    } else {
      await button.click();
    }
    await page.locator("#category-banner").waitFor();
    assert.ok(page.url().endsWith(`#/category/${color}`));
    assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(64, 45, 19)");
    assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundImage), "none");
    assert.equal(await page.title(), `${color.toUpperCase()} · Puzzle 26`);
    assert.equal(await page.locator("#app .page-header, #app h1, #app .eyebrow, #app .lede").count(), 0);
    assert.doesNotMatch(await page.locator("#app").innerText(), /CATEGORY|Choose a puzzle\./);
    assert.equal(await page.getByRole("region", { name: `${color.toUpperCase()} puzzles`, exact: true }).count(), 1);
    assert.equal(await page.locator(".puzzle-button").count(), 4);
    assert.deepEqual(await page.locator(".puzzle-status").allTextContents().then(labels => labels.map(label => label.trim())), color === "white" ? ["PATRICK", "", "", ""] : ["", "", "", ""]);
    if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `category-${color}.png`), fullPage: true });
    await page.locator("#back-button").click();
    await page.locator("#category-grid").waitFor();
  }
  await page.getByRole("button", { name: "Open instructions" }).click();
  assert.equal(await page.locator("#help-dialog").evaluate(el => el.open), true);
  assert.equal(await page.locator("#help-title").textContent(), "Guidelines");
  assert.deepEqual(await page.locator(".help-card > p:not(.eyebrow)").allTextContents().then(paragraphs => paragraphs.map(text => text.trim())), [
    "You do not need to inspect page source, and in fact will probably find something you’re not supposed to if you do.",
    "Do not use gen ai, including Google AI Overview. Puzzles were not verified to be frontier-model-hard. They were also not verified to be Gemini/Opus/Muse/Grok-hard",
  ]);
  assert.equal(await page.locator(".testing-tools h3, .testing-tools p").count(), 0);
  let confirmationMessage;
  page.once("dialog", async dialog => {
    confirmationMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Clear local progress", exact: true }).click();
  assert.equal(confirmationMessage, "Clear all progress which is saved locally?");
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
  await page.getByRole("button", { name: "Close instructions" }).click();
  await page.reload();
  assert.equal(await page.locator("#category-progress-white").textContent(), "1 / 4 SOLVED");
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
});

test("puzzle pages share the dark background with readable headings, preserving panel text", async t => {
  const page = await fixture(t);
  for (const id of ["white-4", "blue-3", "black-4", "red-4", "green-4", "white-2", "blue-2"]) {
    await page.goto(URL + `#/puzzle/${id}`);
    await page.locator(".puzzle-page").waitFor();
    assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(64, 45, 19)");
    assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundImage), "none");
    if (id.startsWith("green-")) assert.equal(await page.locator(".page-header h1").count(), 0);
    else assert.equal(await page.locator(".page-header h1").evaluate(el => getComputedStyle(el).color), "rgb(243, 230, 197)");
    assert.equal(await page.locator(".puzzle-heading-category, .page-header .eyebrow, .page-header .puzzle-rarity-symbol").count(), 0);
    assert.equal(await page.locator(".puzzle-content label, #attempts-heading, .attempts-panel h3").count(), 0);
    assert.equal(await page.locator("#puzzle-answer").getAttribute("placeholder"), null);
    assert.equal(await page.getByRole("textbox", { name: "Answer", exact: true }).count(), 1);
    assert.equal(await page.getByRole("region", { name: "Previous attempts", exact: true }).count(), 1);
    assert.equal(await page.locator("#puzzle-answer").evaluate(el => getComputedStyle(el).color), "rgb(36, 28, 18)");
    if (id === "white-2") assert.equal(await page.locator("#puzzle-images figcaption").count(), 0);
    if (id === "blue-2") {
      assert.equal(await page.locator(".card-collection-empty").count(), 0);
      assert.equal((await page.locator("#card-collection").innerText()).trim(), "");
    }
    if (process.env.PUZZLE_SCREENSHOT_DIR && id === "white-4") await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "dark-background-white-meta.png"), fullPage: true });
  }
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
});

for (const width of [1152, 320]) {
  test(`unlabeled puzzle answers retain keyboard submission, accessible names, and attempt history (${width}px)`, async t => {
    const page = await fixture(t, width);
    await page.goto(URL + "#/puzzle/black-1");
    const input = page.getByRole("textbox", { name: "Answer", exact: true });
    const attempts = page.getByRole("region", { name: "Previous attempts", exact: true });
    await input.waitFor();
    assert.equal(await input.inputValue(), "");
    assert.equal(await input.getAttribute("placeholder"), null);
    assert.equal(await page.locator('label[for="puzzle-answer"], #attempts-heading, .attempts-panel h3').count(), 0);
    assert.equal(await attempts.innerText(), "No previous attempts.");
    assert.equal(await input.evaluate(el => getComputedStyle(el).fontWeight), "400");
    assert.match(await input.evaluate(el => getComputedStyle(el).fontFamily), /IBM Plex Mono/);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    await input.fill("wrong");
    await input.press("Enter");
    await page.getByText("Not quite. Try again.", { exact: true }).waitFor();
    assert.deepEqual(await attempts.locator("li").allTextContents(), ["WRONG"]);
    await input.fill("lands!");
    assert.equal(await input.inputValue(), "LANDS");
    await input.press("Enter");
    await attempts.locator(".correct-attempt").waitFor();
    await page.reload();
    await attempts.locator(".correct-attempt").waitFor();
    assert.deepEqual(await attempts.locator("li").allTextContents(), ["WRONG", "LANDS"]);
    assert.equal(await input.count(), 0);
    assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
    assert.equal(await page.locator('label[for="puzzle-answer"], #attempts-heading, .attempts-panel h3').count(), 0);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    assert.equal(saved.puzzles["black-1"].solved, true);
    assert.deepEqual(saved.puzzles["white-1"], progress.puzzles["white-1"]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `unlabeled-answer-${width}.png`), fullPage: true });
    }
  });
}

test("hidden and disabled categories retain their assigned pentagon positions", async t => {
  const page = await fixture(t);
  const before = {};
  for (const color of COLORS) before[color] = await page.locator(`[data-category="${color}"]`).boundingBox();
  await page.evaluate(() => {
    for (const id of ["green", "blue"]) {
      const category = SITE_CONFIG.categories.find(item => item.id === id);
      category.unlock = { type: "puzzleSolved", puzzleId: "white-2" };
      category.lockedBehavior = id === "green" ? "hidden" : "disabled";
    }
    renderHome();
  });
  await page.evaluate(async () => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  assert.equal(await page.locator('[data-category="green"]').count(), 0);
  assert.equal(await page.locator('[data-category="blue"]').isDisabled(), true);
  for (const color of COLORS.filter(color => color !== "green")) {
    assert.deepEqual(await page.locator(`[data-category="${color}"]`).boundingBox(), before[color]);
  }
});

for (const width of [1152, 320]) {
  test(`help button blinks only on the identity screen and remains usable (${width}px)`, async t => {
    const page = await fixture(t, width, 844, false);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const help = page.getByRole("button", { name: "Open instructions", exact: true });
    const animationName = () => help.evaluate(el => getComputedStyle(el).animationName);
    assert.equal(await animationName(), "identity-help-blink");
    assert.deepEqual(await help.evaluate(el => {
      const animation = el.getAnimations().find(item => item.animationName === "identity-help-blink");
      animation.pause();
      const opacities = [0, 800, 1600].map(time => {
        animation.currentTime = time;
        return Number(getComputedStyle(el).opacity);
      });
      const { duration, iterations } = animation.effect.getTiming();
      animation.play();
      return { opacities, duration, repeating: iterations === Infinity };
    }), { opacities: [1, 0.35, 1], duration: 1600, repeating: true });
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), { ...progress, identityVerified: false });

    await help.click();
    assert.equal(await page.locator("#help-dialog").evaluate(el => el.open), true);
    await page.getByRole("button", { name: "Close instructions", exact: true }).click();
    await page.locator("#identity-answer").fill("WRONG");
    await page.getByRole("button", { name: "Submit identity verification", exact: true }).click();
    await page.getByText("That password does not match.", { exact: true }).waitFor();
    assert.equal(await animationName(), "identity-help-blink");

    await page.locator("#identity-answer").fill("BUM");
    await page.getByRole("button", { name: "Submit identity verification", exact: true }).click();
    await page.locator("#category-grid").waitFor();
    assert.equal(await animationName(), "none");
    await page.getByRole("button", { name: "Open WHITE category", exact: true }).click();
    await page.locator("#puzzle-list").waitFor();
    assert.equal(await animationName(), "none");
    await page.getByRole("button", { name: "The One Left Out, rare", exact: true }).click();
    await page.locator(".puzzle-page").waitFor();
    assert.equal(await animationName(), "none");
    await page.reload();
    await page.locator(".puzzle-page").waitFor();
    assert.equal(await animationName(), "none");
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);

    await help.click();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Clear local progress", exact: true }).click();
    await page.locator("#identity-form").waitFor();
    assert.equal(await animationName(), "identity-help-blink", "returning to the gate restores emphasis");
  });
}

test("help button stays steady for reduced-motion users on the identity screen", async t => {
  const page = await fixture(t, 320, 844, false);
  const help = page.getByRole("button", { name: "Open instructions", exact: true });
  assert.deepEqual(await help.evaluate(el => {
    const style = getComputedStyle(el);
    return [style.animationName, style.opacity];
  }), ["none", "1"]);
  await help.focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#help-dialog").evaluate(el => el.open), true);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), { ...progress, identityVerified: false });
});

for (const width of [1152, 390, 320]) {
test(`identity gate matches the main palette and keeps normal verification at ${width}px`, async t => {
  const page = await fixture(t, width, 844, false);
  assert.equal(await page.locator(".home-page").count(), 0);
  assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(64, 45, 19)");
  assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundImage), "none");
  assert.equal(await page.locator(".identity-page .panel").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(139, 85, 35)");
  assert.equal(await page.locator(".identity-page h1").evaluate(el => getComputedStyle(el).color), "rgb(243, 230, 197)");
  assert.equal(await page.locator(".identity-page h1").textContent(), "Identity verification");
  assert.equal(await page.locator(".identity-page .eyebrow, .identity-page .lede, .identity-page label").count(), 0);
  assert.doesNotMatch(await page.locator(".identity-page").innerText(), /PUZZLE 26|Enter the verification password|PASSWORD|VERIFY/);
  assert.equal(await page.locator("#identity-answer").getAttribute("placeholder"), null);
  assert.equal(await page.getByRole("textbox", { name: "Verification password", exact: true }).count(), 1);
  const submit = page.getByRole("button", { name: "Submit identity verification", exact: true });
  assert.equal(await submit.textContent(), "→");
  const inputBox = await page.locator("#identity-answer").boundingBox(), submitBox = await submit.boundingBox();
  assert.equal(submitBox.width, 52);
  assert.ok(Math.abs(inputBox.y - submitBox.y) < 1);
  assert.ok(submitBox.x > inputBox.x + inputBox.width);
  assert.equal(await page.locator("#identity-answer").evaluate(el => getComputedStyle(el).fontWeight), "400");
  assert.equal(await page.locator("#identity-answer").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(243, 230, 197)");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `identity-${width}.png`), fullPage: true });
  await page.locator("#identity-answer").fill("WRONG");
  await submit.click();
  await page.getByText("That password does not match.", { exact: true }).waitFor();
  assert.equal(await page.locator(".identity-page .feedback").evaluate(el => getComputedStyle(el).color), "rgb(255, 227, 207)");
  await page.locator("#identity-answer").fill("bum");
  if (width === 320) await page.locator("#identity-answer").press("Enter");
  else await submit.click();
  await page.locator("#category-grid").waitFor();
  await page.getByRole("button", { name: "Open WHITE category", exact: true }).click();
  await page.getByRole("button", { name: "The One Left Out, rare", exact: true }).click();
  assert.equal(await page.locator("#puzzle-answer").evaluate(el => getComputedStyle(el).fontWeight), "400");
  assert.match(await page.locator("#puzzle-answer").evaluate(el => getComputedStyle(el).fontFamily), /IBM Plex Mono/);
  assert.equal(await page.locator("#puzzle-answer").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(243, 230, 197)");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
}
