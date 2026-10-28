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
const IMAGE = "assets/black-02-dot.svg";
const BODY = "You fucking donkey";
const ROW_LABELS = "ABCEFX";
const COLUMN_LABELS = "DGHIOV";
const GRID = ["ABCDEH", "GJKLMN", "OIPQRU", "FVWXYZ", "S01234", "5678T9"];
const progress = {
  version: 1, identityVerified: true,
  puzzles: {
    "black-1": { solved: true, attempts: ["LANDS"] },
    "black-2": { solved: false, attempts: ["EARLIER GUESS"] },
    "black-3": { solved: true, attempts: ["174410441"] },
  },
};
let browser, server, origin;

before(async () => {
  const allowed = new Set([...RARITY_ASSETS, ...PHYREXIAN_ASSETS, "index.html", "app.js", "styles.css", "grader-config.js", "grading.js", "egg-machine.js", "egg-machine.css", "cards-data.js", "cards.js", "cards.css", "phyrexian-encoding.js", "phyrexian-transformations.js", IMAGE]);
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = pathname.startsWith("/puzzle-26/") ? pathname.slice("/puzzle-26/".length) : "";
    if (!allowed.has(file)) { res.writeHead(404).end(); return; }
    const type = file.endsWith(".png") ? "image/png" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
    res.writeHead(200, { "Content-Type": type });
    res.end(fs.readFileSync(path.join(ROOT, file)));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});

async function fixture(t, width = 1152, localFile = true, deviceScaleFactor = 1) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", deviceScaleFactor });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], unexpectedRequests = [];
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, route => {
    const url = route.request().url();
    if (url.startsWith(origin + "/")) return route.continue();
    if (!url.startsWith("https://fonts.googleapis.com/")) unexpectedRequests.push(url);
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  const base = localFile ? pathToFileURL(path.join(ROOT, "index.html")).href : `${origin}/puzzle-26/index.html`;
  await page.goto(`${base}#/category/black`);
  assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["Very Weak", "ADFGVXCODE", "A Six-Foot Thick Wooden Door", "The Declaration of Independence"]);
  await page.getByRole("button", { name: "ADFGVXCODE, common", exact: true }).click();
  await page.locator("#microdot-puzzle").waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(".microdot-image");
    return image?.complete && image.naturalWidth === 1000;
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "no Notion or grading requests");
  });
  return page;
}

test("SVG preserves the exact custom grid and keyword, and SHIFT enciphers to the title", () => {
  const svg = fs.readFileSync(path.join(ROOT, IMAGE), "utf8");
  const groupText = id => [...svg.match(new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`))[1].matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match => match[1]).join("");
  assert.equal(groupText("column-labels"), COLUMN_LABELS);
  for (let r = 0; r < GRID.length; r++) assert.equal(groupText("row-" + ROW_LABELS[r]), ROW_LABELS[r] + GRID[r]);
  assert.equal(new Set(GRID.join("")).size, 36);
  assert.match(svg, />KEYWORD: BLACK<\/text>/);
  assert.match(svg, /<rect width="1000" height="1000" fill="#f3e6c5"\/>/);
  assert.match(svg, /stroke="#402d13"/);
  assert.match(svg, /<g fill="#402d13" font-family=/);
  assert.doesNotMatch(svg, /SHIFT|script|href=|https?:\/\/(?!www\.w3\.org)/);
  const keyword = "BLACK", columns = Array.from(keyword, () => "");
  const fractionated = [..."SHIFT"].map(letter => {
    const r = GRID.findIndex(row => row.includes(letter));
    return ROW_LABELS[r] + COLUMN_LABELS[GRID[r].indexOf(letter)];
  }).join("");
  [...fractionated].forEach((letter, i) => { columns[i % keyword.length] += letter; });
  const ciphertext = [...keyword].map((letter, i) => ({ letter, i })).sort((a, b) => a.letter.localeCompare(b.letter)).map(({ i }) => columns[i]).join("");
  assert.equal(ciphertext, "ADFGVXCODE");
});

for (const [width, localFile] of [[1152, true], [320, true], [1152, false]]) {
  test(`cream microdot subtitle replaces the i dot at ${width}px via ${localFile ? "file" : "project path"}`, async t => {
    const page = await fixture(t, width, localFile);
    assert.equal(await page.locator("h1").textContent(), "ADFGVXCODE");
    assert.equal(await page.locator(".microdot-message").textContent(), BODY);
    assert.equal(await page.locator(".puzzle-subtitle.microdot-message").count(), 1, "microdot uses the shared subtitle slot");
    assert.equal(await page.locator(".microdot-letter").textContent(), "i");
    assert.equal(await page.locator(".page-header > h1 + .microdot-message").count(), 1);
    assert.equal(await page.locator(".microdot-puzzle, .panel .microdot-message").count(), 0, "the old body panel is gone");
    assert.equal(await page.locator(".microdot-message").evaluate(node => getComputedStyle(node).color), "rgb(243, 230, 197)");
    assert.equal(await page.locator(".microdot-letter").evaluate(node => getComputedStyle(node, "::before").color), "rgb(243, 230, 197)");
    assert.equal(await page.locator(".placeholder-puzzle").count(), 0);
    assert.doesNotMatch(await page.locator("#app").innerText(), /SHIFT|KEYWORD|will be added later/);
    const dot = await page.locator(".microdot-image").boundingBox();
    const letter = await page.locator(".microdot-letter").boundingBox();
    const answer = await page.locator("#puzzle-answer").boundingBox();
    const title = await page.locator("h1").boundingBox();
    const subtitle = await page.locator(".microdot-message").boundingBox();
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `black-02-${width}-${localFile ? "file" : "http"}.png`), fullPage: true });
      await page.locator(".page-header").screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `black-02-subtitle-${width}-${localFile ? "file" : "http"}.png`) });
    }
    assert.equal(dot.width, 2.25);
    assert.equal(dot.height, 2.25);
    assert.ok(Math.abs(dot.x + dot.width / 2 - letter.x - letter.width / 2) < 0.1);
    assert.ok(dot.y >= letter.y && dot.y + dot.height < letter.y + letter.height / 2);
    assert.ok(title.y + title.height <= subtitle.y);
    assert.ok(subtitle.y + subtitle.height < answer.y, "subtitle sits above the answer form");
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML, { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 });
    assert.ok(hit?.startsWith('<img class="microdot-image"'), JSON.stringify({ dot, letter, hit }));
    assert.equal(await page.locator(".microdot-image").evaluate(img => img.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (!localFile) assert.equal(await page.locator(".microdot-image").evaluate(img => img.src), `${origin}/puzzle-26/${IMAGE}`);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
  });
}

for (const deviceScaleFactor of [1, 2]) {
  test(`microdot aligns with the visible stem at 10x size and ${deviceScaleFactor}x pixel density`, async t => {
    const page = await fixture(t, 1152, true, deviceScaleFactor);
    await page.locator(".microdot-message").evaluate(message => { message.style.fontSize = "180px"; });
    const shot = await page.locator(".microdot-letter").screenshot();
    const centers = await page.evaluate(async dataUrl => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const inkCenter = (start, end) => {
        let left = width, right = -1;
        for (let y = Math.ceil(height * start); y < height * end; y++) {
          for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            if (data[offset] > 200 && data[offset + 1] > 190 && data[offset + 2] > 150 && data[offset + 3] > 200) {
              left = Math.min(left, x);
              right = Math.max(right, x);
            }
          }
        }
        return right >= left ? (left + right) / 2 : null;
      };
      return { dot: inkCenter(0.1, 0.3), stem: inkCenter(0.55, 0.8) };
    }, `data:image/png;base64,${shot.toString("base64")}`);
    assert.notEqual(centers.dot, null, "dot has visible pixels");
    assert.notEqual(centers.stem, null, "stem has visible pixels");
    assert.ok(Math.abs(centers.dot - centers.stem) / deviceScaleFactor < 1, JSON.stringify(centers));
    assert.equal(await page.locator(".microdot-message").textContent(), BODY);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.locator(".microdot-word").screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `microdot-alignment-10x-dpr${deviceScaleFactor}.png`) });
    }
  });
}

test("the full SVG opens independently with legible grid text", async t => {
  const context = await browser.newContext({ viewport: { width: 1050, height: 1050 } });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(ROOT, IMAGE)).href);
  assert.equal(await page.locator("#column-labels text").allTextContents().then(text => text.join("")), COLUMN_LABELS);
  for (let r = 0; r < GRID.length; r++) assert.equal(await page.locator(`#row-${ROW_LABELS[r]} text`).allTextContents().then(text => text.join("")), ROW_LABELS[r] + GRID[r]);
  if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "microdot-full.png") });
});

test("SHIFT solves Black 02; incorrect guesses, history, and other puzzles retain normal behavior", async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite."));
  await page.locator("#puzzle-answer").fill("shift");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "SHIFT");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.equal(await page.locator(".microdot-message").textContent(), BODY);
  assert.equal(await page.locator(".page-header > h1 + .microdot-message").count(), 1);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["EARLIER GUESS", "ANSWER", "SHIFT"]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(stored.puzzles["black-2"].solved, true);
  assert.deepEqual(stored.puzzles["black-1"], progress.puzzles["black-1"]);
  assert.deepEqual(stored.puzzles["black-3"], progress.puzzles["black-3"]);
  await page.locator("#back-button").click();
  await page.locator("#puzzle-list").waitFor();
  assert.equal(await page.locator(".puzzle-button").nth(1).locator(".puzzle-status").textContent().then(text => text.trim()), "SHIFT");
});

test("other puzzles share the subtitle styling without inheriting a microdot", async t => {
  const page = await fixture(t);
  await page.locator("#back-button").click();
  await page.getByRole("button", { name: "Very Weak, common, solved", exact: true }).click();
  await page.locator("#puzzle-statement").waitFor();
  assert.equal(await page.locator(".microdot-message, .microdot-image").count(), 0);
  assert.equal(await page.locator(".puzzle-subtitle").textContent(), "Julian blew my mind with this one back in the day");
  assert.equal(await page.locator(".puzzle-subtitle").evaluate(node => getComputedStyle(node).color), "rgb(243, 230, 197)");
  assert.equal(await page.locator(".page-header > h1").textContent(), "Very Weak");
  assert.equal(await page.locator(".page-header > h1").evaluate(node => getComputedStyle(node).color), "rgb(243, 230, 197)");
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
});
