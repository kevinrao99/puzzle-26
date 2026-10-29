"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress";
const BANNER = "^ǩaπa-hπŋotux-ķoɮǩum-ǩaπaxə-ɢţrɒsad-šdeχud.";
const TITLES = ["^ǩaπa-φyrxɮɒ'ɣ-χtena.", "^lo-žɒɒðk-χɬkevuk.", "^lo-sopšikthibd-naǩum."];
const ANSWERS = ["ALL WILL BE ONE", "COMPLEATED"];
const progress = {
  version: 1, identityVerified: true,
  puzzles: { "black-1": { solved: true, attempts: ["LANDS"] } },
};
let browser, server, origin;

before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(ROOT, pathname.replace(/^\/puzzle-26\//, ""));
    if (!pathname.startsWith("/puzzle-26/") || !file.startsWith(ROOT + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const content = fs.readFileSync(file);
      const type = { ".png": "image/png", ".ttf": "font/ttf", ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[path.extname(file)];
      res.writeHead(200, { "Content-Type": type || "application/octet-stream" });
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});

async function fixture(t, { width = 1152, height = 950, hosted = false, motion = "reduce", verified = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 680 });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], failedAssets = [], remote = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failedAssets.push(response.url()); });
  await page.route(/^https?:/, route => {
    const url = route.request().url();
    if (url.startsWith(origin + "/")) return route.continue();
    if (!url.startsWith("https://fonts.googleapis.com/")) remote.push(url);
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress: { ...progress, identityVerified: verified } });
  const base = hosted ? `${origin}/puzzle-26/index.html` : pathToFileURL(path.join(ROOT, "index.html")).href;
  await page.goto(base + "#/");
  await page.locator(verified ? ".home-page" : ".identity-page").waitFor();
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(failedAssets, []);
    assert.deepEqual(remote, [], "the center symbol adds no external requests");
  });
  return page;
}

async function assertScriptsFit(page) {
  await page.waitForFunction(() => [...document.querySelectorAll(".phyrexian-text")]
    .every(span => getComputedStyle(span).visibility === "visible"));
  const scripts = await page.locator(".phyrexian-text").evaluateAll(spans => spans.map(span => {
    const css = getComputedStyle(span), parent = span.parentElement.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(span);
    return {
      font: css.fontFamily, weight: css.fontWeight, spacing: css.letterSpacing,
      color: css.color, stroke: css.webkitTextStrokeColor,
      loaded: document.fonts.check('48px "Phyrexian Script"', span.textContent),
      fits: [...range.getClientRects()].every(rect => rect.left >= parent.left - 1 && rect.right <= parent.right + 1),
      overflow: span.scrollWidth > span.clientWidth + 1,
    };
  }));
  for (const script of scripts) {
    assert.match(script.font, /Phyrexian Script/);
    assert.equal(script.weight, "400");
    assert.equal(script.spacing, "normal");
    assert.equal(script.color, "rgb(0, 0, 0)");
    assert.equal(script.stroke, "rgb(255, 255, 255)");
    assert.equal(script.loaded, true);
    assert.equal(script.fits, true, "words stay within the banner, button, or heading");
    assert.equal(script.overflow, false, "no clipped or horizontally overflowing inscription");
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.doesNotMatch(await page.locator("#app").innerText(), /Fall to your knees|Behold Phyrexian|Distribute matrices|Create a color circle|puzzle 0[123]/);
}

test("the center symbol preserves the supplied transparent PNG bytes", () => {
  const bytes = fs.readFileSync(path.join(ROOT, "assets/phyrexian-symbol.png"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "c8eb70920ecf6648fb20df7079bcdacf7ff16f49c925bd85ab1408758e28cb12");
});

for (const [width, height, hosted] of [[1152, 950, false], [390, 844, false], [320, 568, false], [812, 375, false], [1152, 950, true], [320, 568, true]]) {
  test(`center symbol and three mythic puzzles fit and navigate (${width}x${height}, ${hosted ? "project subpath" : "file"})`, async t => {
    const page = await fixture(t, { width, height, hosted });
    const button = page.getByRole("button", { name: "Open PHYREXIAN category", exact: true });
    await button.locator("img").evaluate(img => img.decode());
    assert.equal(await page.locator(".category-button").count(), 5);
    assert.equal(await page.locator(".phyrexian-symbol-button").count(), 1);
    assert.equal(await button.locator("img").getAttribute("src"), "assets/phyrexian-symbol.png");
    assert.equal(await button.locator("img").getAttribute("alt"), "");
    assert.equal(await button.locator(".sr-only").textContent(), "0 / 3 SOLVED");
    const center = await button.boundingBox();
    assert.ok(center.width >= 44 && center.height >= 44, "touch target is at least 44px");
    assert.ok(Math.abs(center.width - center.height) < 0.1, "the transparent target stays circular");
    assert.equal(await button.evaluate(el => getComputedStyle(el).borderRadius), "50%");
    const circles = await page.locator(".category-button").evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    for (const axis of ["x", "y"]) {
      const size = axis === "x" ? "width" : "height";
      const average = circles.reduce((sum, box) => sum + box[axis] + box[size] / 2, 0) / 5;
      assert.ok(Math.abs(center[axis] + center[size] / 2 - average) < 1, "symbol is centered among the circles");
    }
    // Border-radius clips the hit areas; overlapping bounding-box corners are not clickable.
    for (const circle of circles) {
      const distance = Math.hypot(
        center.x + center.width / 2 - circle.x - circle.width / 2,
        center.y + center.height / 2 - circle.y - circle.height / 2,
      );
      assert.ok(distance >= (center.width + circle.width) / 2, "the circular targets do not overlap");
    }
    assert.equal(await page.locator(".category-button").evaluateAll(nodes => nodes.every(node => {
      const rect = node.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      return Array.from({ length: 8 }, (_, index) => index * Math.PI / 4).every(angle =>
        node.contains(document.elementFromPoint(x + Math.cos(angle) * rect.width * 0.4, y + Math.sin(angle) * rect.height * 0.4)));
    })), true, "the center control cannot intercept clicks on the color circles");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
    assert.match(await button.locator("img").evaluate(img => getComputedStyle(img).filter), /brightness\(0\) invert\(1\).*drop-shadow/);
    assert.equal(await button.locator("img").evaluate(img => getComputedStyle(img).animationName), "none", "reduced motion leaves a static glow");
    if (process.env.PUZZLE_SCREENSHOT_DIR && !hosted) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `phyrexian-home-${width}-${height}.png`), fullPage: true });
    }
    if (width < 680) await button.tap();
    else {
      await button.focus();
      assert.equal(await button.evaluate(el => getComputedStyle(el).outlineStyle), "solid");
      await button.press("Enter");
    }
    await page.locator(".category-page").waitFor();
    assert.ok(page.url().endsWith("#/category/phyrexian"));
    assert.equal(await page.title(), "PHYREXIAN · Puzzle 26");
    await page.locator(".category-banner.script-ready").waitFor();
    assert.equal(await page.locator(".category-banner").getAttribute("aria-label"), "Phyrexian inscription");
    const finish = await page.locator(".category-banner").evaluate(el => {
      const css = getComputedStyle(el);
      return { color: css.backgroundColor, image: css.backgroundImage, shadow: css.boxShadow };
    });
    assert.equal(finish.color, "rgb(165, 169, 180)");
    assert.match(finish.image, /repeating-linear-gradient/);
    assert.match(finish.image, /linear-gradient\(110deg/);
    assert.match(finish.image, /rgb\(165, 169, 180\)/);
    assert.match(finish.shadow, /inset/);
    assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(64, 45, 19)");
    assert.equal(await page.locator(".category-banner img, .category-page h1").count(), 0);
    assert.equal(await page.locator(".category-inscription").textContent(), BANNER);
    assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), TITLES);
    assert.equal(await page.locator(".phyrexian-text[aria-hidden=true]").count(), 4);
    await assertScriptsFit(page);
    assert.deepEqual(await page.locator(".puzzle-rarity-symbol").evaluateAll(images => images.map(image => [image.alt, image.getAttribute("src")])),
      Array.from({ length: 3 }, () => ["mythic", "assets/donkey-mythic.png"]));
    await page.waitForFunction(() => [...document.querySelectorAll(".puzzle-rarity-symbol")].every(img => img.complete && img.naturalWidth === 1254));
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    if (process.env.PUZZLE_SCREENSHOT_DIR && !hosted) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `phyrexian-category-${width}-${height}.png`), fullPage: true });
    }
    for (const number of [1, 2, 3]) {
      const name = `PHYREXIAN puzzle ${number}`;
      await page.getByRole("button", { name: `${name}, mythic`, exact: true }).click();
      await page.locator(".puzzle-page").waitFor();
      assert.ok(page.url().endsWith(`#/puzzle/phyrexian-${number}`));
      await page.locator(".phyrexian-puzzle-heading.script-ready").waitFor();
      assert.equal(await page.locator("h1").textContent(), TITLES[number - 1]);
      assert.equal(await page.locator("h1").getAttribute("aria-label"), name);
      assert.equal(await page.title(), `${name} · Puzzle 26`);
      await assertScriptsFit(page);
      assert.equal(await page.getByRole("textbox", { name: "Answer", exact: true }).count(), number === 3 ? 0 : 1);
      if (process.env.PUZZLE_SCREENSHOT_DIR && !hosted && number === 1) {
        await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `phyrexian-heading-${width}-${height}.png`), fullPage: true });
      }
      await page.locator("#back-button").click();
      await page.locator(".category-page").waitFor();
    }
    await page.reload();
    await page.locator(".category-page").waitFor();
    assert.equal(await page.locator(".puzzle-button").count(), 3);
    await page.locator("#back-button").click();
    await button.waitFor();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
  });
}

test("white glow gently pulses and becomes static when reduced motion is requested", async t => {
  const page = await fixture(t, { motion: "no-preference" });
  const image = page.locator(".phyrexian-symbol-button img");
  const animation = await image.evaluate(img => {
    const css = getComputedStyle(img);
    return [css.animationName, css.animationDuration, css.animationIterationCount];
  });
  assert.deepEqual(animation, ["phyrexian-glow", "3s", "infinite"]);
  const sample = time => image.evaluate(async (img, time) => {
    const animation = img.getAnimations()[0];
    animation.pause();
    animation.currentTime = time;
    await new Promise(requestAnimationFrame);
    const css = getComputedStyle(img);
    return { opacity: Number(css.opacity), filter: css.filter };
  }, time);
  const low = await sample(0), high = await sample(1500);
  assert.ok(high.opacity > low.opacity);
  assert.notEqual(high.filter, low.filter);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await image.evaluate(img => getComputedStyle(img).animationName), "none");
  assert.match(await image.evaluate(img => getComputedStyle(img).filter), /drop-shadow/);
});

for (const hosted of [false, true]) {
  test(`Phyrexian answers persist independently (${hosted ? "project subpath" : "file"})`, async t => {
    const page = await fixture(t, { hosted });
    await page.getByRole("button", { name: "Open PHYREXIAN category", exact: true }).click();
    for (const number of [1, 2]) {
      const answer = ANSWERS[number - 1];
      await page.getByRole("button", { name: `PHYREXIAN puzzle ${number}, mythic`, exact: true }).click();
      const input = page.getByRole("textbox", { name: "Answer", exact: true });
      await input.fill("wrong");
      await input.press("Enter");
      await page.getByText("Incorrect", { exact: true }).waitFor();
      await input.fill(answer.toLowerCase());
      await input.press("Enter");
      await page.locator(".correct-attempt").waitFor();
      assert.equal(await input.count(), 0);
      assert.deepEqual(await page.locator("#attempt-history li").allTextContents(), ["WRONG", answer]);
      await page.locator("#back-button").click();
      await page.locator(`#puzzle-status-phyrexian-${number}`).filter({ hasText: answer }).waitFor();
    }
    await page.reload();
    await page.locator(".category-page").waitFor();
    await page.waitForFunction(answers => [...document.querySelectorAll(".puzzle-status")]
      .map(el => el.textContent.trim()).join("|") === answers.join("|"), [...ANSWERS, ""]);
    await assertScriptsFit(page);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    assert.deepEqual(saved.puzzles["black-1"], progress.puzzles["black-1"]);
    for (const number of [1, 2]) {
      assert.equal(saved.puzzles[`phyrexian-${number}`].solved, true);
      assert.deepEqual(saved.puzzles[`phyrexian-${number}`].attempts, ["WRONG", ANSWERS[number - 1]]);
    }
    await page.locator("#back-button").click();
    await page.locator("#category-progress-phyrexian").waitFor({ state: "attached" });
    assert.equal(await page.locator("#category-progress-phyrexian").textContent(), "2 / 3 SOLVED");
  });
}

for (const [width, hosted] of [[1152, false], [375, true]]) {
  test(`encoding examples and matrix-only challenge render without spoilers (${width}px)`, async t => {
    const page = await fixture(t, { width, hosted });
    await page.evaluate(() => { location.hash = "#/puzzle/phyrexian-1"; });
    await page.locator("#phyrexian-encoding .script-ready").first().waitFor();
    await assertScriptsFit(page);
    assert.equal(await page.locator(".encoding-example").count(), 4);
    assert.equal(await page.locator(".encoding-inscription").count(), 3);
    assert.equal(await page.locator(".encoding-example--challenge .phyrexian").count(), 0);
    assert.equal(await page.locator(".placeholder-puzzle, .lede").count(), 0);
    const matrices = await page.locator(".encoding-matrix").evaluateAll(tables => tables.map(table =>
      [...table.rows].map(row => [...row.cells].map(cell => Number(cell.textContent.replace("−", "-"))))));
    assert.deepEqual(matrices.map(rows => rows.map(row => row.length)),
      [15, 30, 26, 14].map(n => [n, n, n, n]));
    // Check the circle's zero column and the continuation of signed positions.
    assert.deepEqual(matrices[2].map(row => row[18]), [0, 0, 0, 0]);
    assert.equal(matrices[2][3][19], 20);
    assert.equal(matrices[2][3][25], -26);
    assert.deepEqual(matrices[3][3], [1, -2, 3, -4, 5, 6, -7, -8, 9, -10, 11, 12, -13, 14]);
    assert.doesNotMatch(await page.locator(".puzzle-page").innerText(), /surrender|elesh norn|fair basilica|great work|new phyrexia|all will be one|placeholder/i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const scroll = page.locator(".encoding-matrix-scroll").nth(2);
    if (width < 680) {
      assert.ok(await scroll.evaluate(el => el.scrollWidth > el.clientWidth));
      await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      assert.ok(await scroll.evaluate(el => el.scrollLeft > 0));
      await scroll.evaluate(el => { el.scrollLeft = 0; });
    } else {
      assert.ok(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    }
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `phyrexian-encoding-${width}.png`), fullPage: true });
    }
  });
}

for (const [width, hosted] of [[1152, false], [320, true]]) {
  test(`transformation diagram preserves hints and supplies only the worked result (${width}px)`, async t => {
    const page = await fixture(t, { width, hosted });
    await page.evaluate(() => { location.hash = "#/puzzle/phyrexian-2"; });
    await page.locator("#phyrexian-transformations .script-ready").first().waitFor();
    await assertScriptsFit(page);
    const source = JSON.parse(fs.readFileSync(path.resolve(ROOT, "../../phyrexian-reference/puzzle-prototype/intermediate/construction.json"), "utf8"));
    assert.deepEqual(await page.locator(".transformation-inscription").allTextContents(), source.inputs.map(item => item.word));
    const hints = await page.locator("#phyrexian-transformations .encoding-matrix").evaluateAll(tables => tables.map(table =>
      [...table.rows].map(row => [...row.cells].map(cell => Number(cell.textContent)))));
    assert.deepEqual(hints, source.inputs.map(item => item.hint));
    assert.deepEqual(await page.locator(".transformation-node-inscription").allTextContents(), source.inputs.map(item => item.word));
    assert.equal(await page.locator(".transformation-result-inscription").textContent(), source.outputs[1].word);
    const boxes = await page.locator(".transformation-flow").evaluate(flow => Object.fromEntries(
      ["oil", "being", "blood", "result"].map(name => {
        const { x, y, width, height } = flow.querySelector(`.transformation-${name}`).getBoundingClientRect();
        return [name, { x, y, width, height }];
      })));
    assert.ok(boxes.being.y + boxes.being.height < boxes.oil.y);
    assert.ok(boxes.oil.x < boxes.blood.x);
    assert.ok(Math.abs(boxes.oil.y - boxes.blood.y) < 1);
    assert.ok(boxes.result.y > boxes.blood.y + boxes.blood.height);
    assert.ok(Math.abs(boxes.blood.x + boxes.blood.width / 2 - boxes.result.x - boxes.result.width / 2) < 1);
    assert.deepEqual(await page.locator(".transformation-branches text").allTextContents(), ["+", "−"]);
    assert.equal(await page.locator("#phyrexian-transformations h2, #phyrexian-transformations h3, #phyrexian-transformations p, #phyrexian-transformations ol").count(), 0);
    assert.equal(await page.locator("#phyrexian-transformations button, #phyrexian-transformations a, .placeholder-puzzle, .lede").count(), 0);
    assert.doesNotMatch(await page.locator(".puzzle-page").innerText(), /organic being|oil|blood|compleated|corpse|plinexs|guided solution|modulo|Hint H/i);
    const publicData = fs.readFileSync(path.join(ROOT, "phyrexian-transformations.js"), "utf8");
    assert.doesNotMatch(publicData, /compleated|corpse|plinexs|"outputs"|"signal"|"alphabet"/i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    await page.locator("#puzzle-answer").fill("ANSWER");
    await page.locator("#puzzle-answer").press("Enter");
    await page.getByText("Incorrect", { exact: true }).waitFor();
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `phyrexian-transformations-${width}.png`), fullPage: true });
    }
  });
}

for (const [width, hosted] of [[1152, false], [320, true]]) {
  test(`faction puzzle keeps only the pentagon for in-person handouts (${width}px)`, async t => {
    const page = await fixture(t, { width, hosted });
    await page.evaluate(() => { location.hash = "#/puzzle/phyrexian-3"; });
    await page.locator(".faction-board").waitFor();
    await assertScriptsFit(page);
    assert.equal(await page.locator(".faction-board polygon").count(), 2);
    assert.equal(await page.locator(".faction-board circle").count(), 10);
    assert.equal(await page.locator(".faction-card, .encoding-matrix, #phyrexian-factions img, #puzzle-answer-form, .puzzle-content, .attempts-panel, .feedback, #attempt-history").count(), 0);
    assert.equal(await page.locator(".faction-board image, .faction-board text, #phyrexian-factions button, #phyrexian-factions p, .placeholder-puzzle, .lede").count(), 0);
    assert.equal((await page.locator("#phyrexian-factions").innerText()).trim(), "");
    assert.equal(await page.locator('script[src="phyrexian-factions.js"]').count(), 0);
    assert.equal(fs.existsSync(path.join(ROOT, "phyrexian-factions.js")), false);
    assert.equal(fs.existsSync(path.join(ROOT, "assets/phyrexian-03")), false);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    await page.reload();
    await page.locator(".faction-board").waitFor();
    await assertScriptsFit(page);
    assert.equal(await page.locator("#puzzle-answer-form, .faction-card, #attempt-history").count(), 0);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `phyrexian-factions-${width}.png`), fullPage: true });
    }
  });
}

test("the new category retains the ordinary browser-local identity gate", async t => {
  const page = await fixture(t, { verified: false });
  await page.evaluate(() => { location.hash = "#/category/phyrexian"; });
  await page.locator(".identity-page").waitFor();
  assert.equal(await page.locator(".phyrexian-symbol-button, .category-page, .puzzle-button").count(), 0);
  await page.getByRole("textbox", { name: "Verification password", exact: true }).fill("BUM");
  await page.getByRole("button", { name: "Submit identity verification", exact: true }).click();
  await page.getByRole("button", { name: "Open PHYREXIAN category", exact: true }).waitFor();
});

test("missing script font hides romanization on both buttons and headings without breaking navigation", async t => {
  const page = await fixture(t, { hosted: true });
  await page.route("**/Phyrexian-Regular.ttf", route => route.abort());
  await page.getByRole("button", { name: "Open PHYREXIAN category", exact: true }).click();
  await page.getByRole("img", { name: "Phyrexian inscription unavailable", exact: true }).waitFor();
  assert.deepEqual(await page.locator(".phyrexian-text").evaluateAll(spans => spans.map(span => getComputedStyle(span).visibility)), Array(4).fill("hidden"));
  await page.getByRole("button", { name: "PHYREXIAN puzzle 1, mythic", exact: true }).click();
  await page.locator(".phyrexian-puzzle-heading[aria-label='Phyrexian inscription unavailable']").waitFor();
  assert.equal(await page.locator(".puzzle-title-inscription").evaluate(span => getComputedStyle(span).visibility), "hidden");
  assert.equal(await page.getByRole("textbox", { name: "Answer", exact: true }).count(), 1);
  await page.locator("#back-button").click();
  await page.locator(".category-page").waitFor();
  assert.equal(await page.locator(".puzzle-button").count(), 3);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
});
