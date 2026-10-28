"use strict";

const RARITY_ASSETS = ["common", "uncommon", "rare", "mythic"].map(tier => `assets/donkey-${tier}.png`);
const PHYREXIAN_ASSETS = ["assets/Phyrexian-Regular.ttf", "assets/phyrexian-symbol.png"];

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress";
const BUNDLE = ["wordless.html", "wordless.css", "styles.css", "chart.js", "engine.js", "game.js", "assets/animals.mp3"];
const progress = {
  version: 1, identityVerified: true,
  puzzles: {
    "green-1": { solved: true, attempts: ["ONE"] },
    "green-3": { solved: false, attempts: ["EARLIER GUESS"] },
    "green-5": { solved: true, attempts: ["OLD FIVE"] },
    "blue-1": { solved: true, attempts: ["BLUE"] },
  },
};
let browser, server, origin;

before(async () => {
  const allowed = new Set([...RARITY_ASSETS, ...PHYREXIAN_ASSETS,
    "index.html", "app.js", "styles.css", "grading.js", "grader-config.js",
    "phyrexian-encoding.js", "phyrexian-transformations.js",
    "egg-machine.js", "egg-machine.css", "cards.js", "cards.css", "cards-data.js",
    ...BUNDLE.map(file => `games/rhythm/${file}`),
  ]);
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = pathname.startsWith("/puzzle-26/") ? pathname.slice("/puzzle-26/".length) : "";
    if (!allowed.has(file)) { res.writeHead(404).end(); return; }
    const content = fs.readFileSync(path.join(ROOT, file));
    const type = file.endsWith(".png") ? "image/png" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".mp3") ? "audio/mpeg" : "text/html";
    const headers = { "Content-Type": type, "Accept-Ranges": "bytes" };
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const start = range?.[1] ? Number(range[1]) : Math.max(0, content.length - Number(range?.[2]));
      const end = range?.[1] && range[2] ? Math.min(Number(range[2]), content.length - 1) : content.length - 1;
      if (!range || (!range[1] && !range[2]) || start > end || start >= content.length) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${content.length}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${content.length}` });
      res.end(content.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": content.length });
    res.end(content);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--mute-audio"] });
});

after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function fixture(t, route = "category/green", localFile = false) {
  const context = await browser.newContext({ viewport: { width: 1152, height: 1000 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], failedResponses = [], gatewayRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failedResponses.push(response.url()); });
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.route("https://13.59.146.74/**", route => { gatewayRequests.push(route.request().url()); return route.abort(); });
  await page.addInitScript(({ key, progress }) => {
    if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
    window.canvasText = [];
    for (const name of ["fillText", "strokeText"]) {
      const original = CanvasRenderingContext2D.prototype[name];
      CanvasRenderingContext2D.prototype[name] = function (text, ...args) {
        if (this.canvas.id === "highway") window.canvasText.push(String(text));
        return original.call(this, text, ...args);
      };
    }
  }, { key: KEY, progress });
  const base = localFile ? pathToFileURL(path.join(ROOT, "index.html")).href : `${origin}/puzzle-26/index.html`;
  await page.goto(`${base}#/${route}`);
  t.after(() => {
    assert.deepEqual(errors, [], "no uncaught errors in either document");
    assert.deepEqual(failedResponses, [], "all resources load from the project subpath");
    assert.deepEqual(gatewayRequests, [], "the rhythm game never contacts the grader");
  });
  return page;
}

async function gameFrame(page) {
  const element = await page.waitForSelector("#rhythm-game");
  const game = await element.contentFrame();
  await game.waitForFunction(() => !document.getElementById("start")?.disabled && document.getElementById("audio")?.readyState >= 3);
  return game;
}

async function assertWordless(game) {
  const text = await game.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), parts = [];
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if (parent.closest(".sr-only, [hidden], script, style")) continue;
      const style = getComputedStyle(parent);
      if (style.display !== "none" && style.visibility !== "hidden") parts.push(node.textContent);
    }
    return parts.join(" ");
  });
  assert.doesNotMatch(text, /[\p{L}\p{N}]/u);
  assert.deepEqual(await game.evaluate(() => window.canvasText), []);
}

async function screenshot(page, name) {
  if (!process.env.PUZZLE_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.PUZZLE_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, name), fullPage: true });
}

test("rhythm bundle is self-contained and matches the standalone source when available", () => {
  for (const file of BUNDLE) {
    const target = path.join(ROOT, "games/rhythm", file);
    assert.equal(fs.lstatSync(target).isFile(), true, "not a sibling-checkout symlink");
    const source = path.resolve(ROOT, "../ddr-prototype/dist", file);
    if (fs.existsSync(source)) assert.deepEqual(fs.readFileSync(target), fs.readFileSync(source), file);
  }
  const engine = require("../games/rhythm/engine.js");
  assert.equal(engine.HIT_WINDOW, .200);
  assert.equal(engine.FAIL_AT_MISTAKES, 4);
  const html = fs.readFileSync(path.join(ROOT, "games/rhythm/wordless.html"), "utf8");
  assert.doesNotMatch(html, /ddr-prototype|\.\.\//);
});

test("Green has four stable slots, Green 03 embeds the game, and ordinary answers still control completion", { timeout: 20000 }, async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-list").waitFor();
  assert.deepEqual(await page.locator(".puzzle-rarity-symbol").evaluateAll(images => images.map(image => image.alt)), ["common", "common", "uncommon", "rare"]);
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  assert.equal(await page.locator(".puzzle-button").nth(1).locator(".puzzle-status").textContent().then(text => text.trim()), "✓");
  await page.locator(".puzzle-button").nth(2).click();
  assert.ok(page.url().endsWith("#/puzzle/green-3"));
  const game = await gameFrame(page);
  assert.equal(game.url(), `${origin}/puzzle-26/games/rhythm/wordless.html`);
  assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS"]);
  assert.equal(await game.locator("#workshop").count(), 0);
  assert.equal(await game.locator(".mistake-mark").count(), 4);
  assert.equal(await game.locator(".timing-tick").count(), 3);
  assert.equal(await game.evaluate(() => window.ANIMALS_CHART.notes.length), 243);
  const answerBox = await page.locator("#puzzle-answer").boundingBox(), frameBox = await page.locator("#rhythm-game").boundingBox();
  assert.ok(answerBox.y + answerBox.height < frameBox.y, "answer stays above the game");
  await assertWordless(game);
  await screenshot(page, "green-03-desktop.png");

  await game.locator("#start").click();
  await game.waitForFunction(() => !document.getElementById("audio").paused, null, { timeout: 5000 });
  await game.evaluate(() => {
    const audio = document.getElementById("audio"), stage = document.getElementById("stage");
    audio.pause();
    for (const note of window.ANIMALS_CHART.notes) {
      audio.currentTime = note.time;
      const key = "Arrow" + note.direction[0].toUpperCase() + note.direction.slice(1);
      stage.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      stage.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    }
    audio.currentTime = window.ANIMALS_CHART.notes.at(-1).time + 4.9;
    return audio.play();
  });
  await game.waitForFunction(() => document.getElementById("overlay-main").getAttribute("aria-label") === "COMPLETE", null, { timeout: 3000 }).catch(async error => {
    const diagnostic = await game.evaluate(() => {
      const audio = document.getElementById("audio");
      return { time: audio.currentTime, duration: audio.duration, paused: audio.paused, seeking: audio.seeking, seekable: Array.from({ length: audio.seekable.length }, (_, i) => [audio.seekable.start(i), audio.seekable.end(i)]), overlay: document.getElementById("overlay-main").textContent, mistakes: document.getElementById("mistakes").dataset.count, status: document.getElementById("status").textContent };
    });
    assert.fail(`${error.message}: ${JSON.stringify(diagnostic)}`);
  });
  assert.equal(await game.locator("#overlay-main").textContent(), "");
  assert.equal(await game.evaluate(() => document.getElementById("audio").paused), true);
  assert.equal(await game.evaluate(() => document.getElementById("audio").volume), 0);
  assert.equal(await game.locator("#progress").evaluate(bar => bar.style.width), "100%");
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress, "completing the game does not mutate hunt progress");
  await assertWordless(game);

  await page.locator("#puzzle-answer").fill("aNsWeR!");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "ANSWER");
  await page.locator("#puzzle-answer-form button").click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).puzzles["green-3"].attempts.includes("ANSWER"), KEY);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).puzzles["green-3"].solved, KEY), false, "the old placeholder no longer solves Green 03");
  await page.locator("#puzzle-answer").fill("aTp8!");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "ATP8");
  await page.locator("#puzzle-answer-form button").click();
  await page.locator(".correct-attempt").waitFor();
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["green-3"].solved, true);
  assert.deepEqual(stored.puzzles["green-3"].attempts, ["EARLIER GUESS", "ANSWER", "ATP8"]);
  for (const id of ["green-1", "green-5", "blue-1"]) assert.deepEqual(stored.puzzles[id], progress.puzzles[id]);
  await page.locator("#back-button").click();
  await page.waitForSelector("#puzzle-list");
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  await page.locator("#back-button").click();
  assert.match(await page.getByRole("button", { name: "Open GREEN category" }).textContent(), /2 \/ 4 SOLVED/);
  for (const color of ["WHITE", "BLACK", "RED"]) assert.match(await page.getByRole("button", { name: `Open ${color} category` }).textContent(), /\/ 4 SOLVED/);
  await page.evaluate(() => { location.hash = "#/puzzle/green-5"; });
  await page.waitForSelector("h1:text-is('Page not found')");
  assert.equal(await page.locator("#rhythm-game").count(), 0);
});

test("embedded keyboard controls, fourth-mistake skull, audio, responsive layout and navigation cleanup", { timeout: 25000 }, async t => {
  const page = await fixture(t, "puzzle/green-3");
  let game = await gameFrame(page);
  await game.locator("#start").click();
  assert.equal(await game.locator("#overlay-main").textContent(), "● ● ●");
  for (let count = 1; count <= 4; count++) {
    await page.keyboard.press("ArrowLeft");
    assert.equal(await game.locator(".mistake-mark.used").count(), count, "real keyboard events reach the focused iframe");
  }
  assert.equal(await game.locator("#overlay-main").textContent(), "💀");
  await page.waitForTimeout(3100);
  assert.equal(await game.evaluate(() => document.getElementById("audio").paused), true);
  assert.equal(await game.evaluate(() => document.getElementById("audio").currentTime), 0);
  await assertWordless(game);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await game.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await screenshot(page, `green-03-mobile-${width}.png`);
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll("body *")].filter(node => node.getBoundingClientRect().right > innerWidth).map(node => ({ tag: node.tagName, id: node.id, className: node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right })) }));
    assert.ok(layout.scrollWidth <= layout.width, JSON.stringify(layout));
    assert.ok(await game.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await game.evaluate(() => document.documentElement.scrollHeight <= innerHeight), "the iframe fits its game with no nested vertical scrollbar");
  }
  await screenshot(page, "green-03-mobile-skull.png");
  await game.locator("#start").click();
  await game.waitForFunction(() => !document.getElementById("audio").paused);
  assert.equal(await game.locator(".mistake-mark.used").count(), 0);
  const oldGame = game;
  await page.locator("#back-button").click();
  await page.waitForSelector("#puzzle-list");
  assert.equal(oldGame.isDetached(), true, "leaving destroys the audio-owning document");
  assert.equal(page.frames().length, 1);
  await page.locator(".puzzle-button").nth(2).click();
  game = await gameFrame(page);
  assert.equal(await game.evaluate(() => document.getElementById("audio").paused), true);
  assert.equal(await game.evaluate(() => document.getElementById("audio").currentTime), 0);
  assert.equal(await game.locator(".mistake-mark.used").count(), 0);
  await page.reload();
  await gameFrame(page);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS"]);
});

test("Green 03 also loads directly from file URLs and preserves answer-input keyboard behavior", { timeout: 10000 }, async t => {
  const page = await fixture(t, "puzzle/green-3", true);
  const game = await gameFrame(page);
  assert.ok(game.url().startsWith("file:"));
  assert.equal(await game.locator("#start").isEnabled(), true);
  await assertWordless(game);
  await page.locator("#puzzle-answer").fill("TEST");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await game.locator(".mistake-mark.used").count(), 0, "keys in the answer box never count against the game");
  await game.locator("#start").click();
  await game.waitForFunction(() => !document.getElementById("audio").paused);
  await game.locator("#stop").click();
  assert.equal(await game.evaluate(() => document.getElementById("audio").currentTime), 0);
  assert.equal(await game.locator("#overlay-main").textContent(), "■");
});
