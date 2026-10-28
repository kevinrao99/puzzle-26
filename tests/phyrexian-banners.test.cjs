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
// Word forms from the user's glossary; Loyalty is the explicitly chosen wiki form.
const INSCRIPTIONS = {
  white: ["^'ə'wgwəww-θpoŋkp.", "rgb(229, 214, 157)"],
  blue: ["^bən'-ǧytπt.", "rgb(67, 142, 157)"],
  black: ["^əxťeķibrs-ganwr.", "rgb(55, 56, 43)"],
  red: ["^'ɴuŋəža-huqtkeɴt.", "rgb(189, 78, 45)"],
  green: ["^vriθkv-ɢiss.", "rgb(103, 139, 60)"],
};
const progress = {
  version: 1, identityVerified: true,
  puzzles: { "black-4": { solved: false, attempts: ["OLD GUESS"] } },
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
      const type = { ".ttf": "font/ttf", ".png": "image/png", ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[path.extname(file)];
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

async function fixture(t, width, hosted = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
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
  }, { key: KEY, progress });
  const base = hosted ? `${origin}/puzzle-26/index.html` : pathToFileURL(path.join(ROOT, "index.html")).href;
  await page.goto(base + "#/");
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(failedAssets, []);
    assert.deepEqual(remote, [], "Phyrexian inscriptions require no external service");
  });
  return page;
}

test("bundled Phyrexian font is the unchanged reference font with its rights notice", () => {
  const bytes = fs.readFileSync(path.join(ROOT, "assets/Phyrexian-Regular.ttf"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "a62fa75fbdb9f70e4a7873696158c5cdf440d78d156fd5557457b9ab7dc66ed7");
  const notice = fs.readFileSync(path.join(ROOT, "assets/PHYREXIAN-NOTICE.txt"), "utf8");
  assert.match(notice, /Copyright © 2019 by Wizards of the Coast/);
  assert.match(notice, /All rights reserved/);
  assert.match(notice, /not claims of attested official sentences/);
});

for (const width of [1152, 320]) for (const hosted of [false, true]) {
  test(`five connected inscriptions fit their original colors (${width}px, ${hosted ? "project subpath" : "file"})`, async t => {
    const page = await fixture(t, width, hosted);
    for (const [color, [text, background]] of Object.entries(INSCRIPTIONS)) {
      await page.getByRole("button", { name: `Open ${color.toUpperCase()} category`, exact: true }).click();
      await page.locator(".category-banner.script-ready").waitFor();
      await page.locator(".category-inscription").waitFor();
      assert.equal(await page.locator(".category-inscription").textContent(), text);
      assert.ok(!/\s/.test(text), "no gaps in the spine");
      assert.equal((text.match(/-/g) || []).length, 1, "one squiggle separates the two words");
      assert.equal(await page.getByRole("img", { name: "Phyrexian inscription", exact: true }).count(), 1);
      assert.equal(await page.locator(".category-inscription").getAttribute("aria-hidden"), "true");
      assert.equal(await page.locator(".category-banner [title], .category-page h1, .category-page .eyebrow").count(), 0);
      assert.equal(await page.locator(".category-banner--metallic").count(), 0, "metallic finish is exclusive to the Phyrexian category");
      assert.equal(await page.locator(".category-banner").evaluate(el => getComputedStyle(el).backgroundImage), "none");
      assert.equal(await page.locator(".puzzle-button").count(), 4);
      const style = await page.locator(".category-inscription").evaluate(span => {
        const css = getComputedStyle(span), banner = span.parentElement, rect = span.getBoundingClientRect(), box = banner.getBoundingClientRect();
        return {
          fontLoaded: document.fonts.check('48px "Phyrexian Script"', span.textContent),
          family: css.fontFamily, color: css.color, strokeColor: css.webkitTextStrokeColor,
          strokeWidth: parseFloat(css.webkitTextStrokeWidth), fontSize: parseFloat(css.fontSize),
          synthesis: css.fontSynthesis, paintOrder: css.paintOrder, filter: css.filter,
          background: getComputedStyle(banner).backgroundColor, visibility: css.visibility,
          fits: rect.left >= box.left + 20 && rect.right <= box.right - 20 && rect.top >= box.top && rect.bottom <= box.bottom,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.ok(style.fontLoaded);
      assert.match(style.family, /^"Phyrexian Script"/);
      assert.equal(style.color, "rgb(0, 0, 0)");
      assert.equal(style.strokeColor, "rgb(255, 255, 255)");
      assert.ok(Math.abs(style.strokeWidth - style.fontSize * 0.04) < 0.01);
      assert.equal(style.paintOrder, "stroke");
      assert.equal(style.synthesis, "none");
      assert.match(style.filter, /phyrexian-rough-edge/);
      assert.equal(style.background, background);
      assert.equal(style.visibility, "visible");
      assert.equal(style.fits, true, `${color} stays inside its color bar`);
      assert.equal(style.overflow, false);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
      if (process.env.PUZZLE_SCREENSHOT_DIR && !hosted) {
        await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `phyrexian-${color}-${width}.png`), fullPage: true });
      }
      if (color === "black") {
        await page.getByRole("button", { name: "The Declaration of Independence, rare", exact: true }).click();
        await page.locator(".puzzle-page").waitFor();
        assert.equal(await page.locator(".category-banner, .category-inscription").count(), 0);
        assert.equal(await page.locator("#puzzle-answer").count(), 1);
        await page.locator("#back-button").click();
        await page.locator(".category-banner.script-ready").waitFor();
      }
      await page.locator("#back-button").click();
      await page.locator(".home-page").waitFor();
      assert.equal(await page.locator(".category-inscription").count(), 0);
    }
    await page.reload();
    await page.locator(".home-page").waitFor();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
  });
}

test("an unavailable font never shows the phonetic source as fallback text", async t => {
  const page = await fixture(t, 390, true);
  await page.route("**/Phyrexian-Regular.ttf", route => route.abort());
  await page.getByRole("button", { name: "Open RED category", exact: true }).click();
  await page.getByRole("img", { name: "Phyrexian inscription unavailable", exact: true }).waitFor();
  assert.equal(await page.locator(".category-inscription").evaluate(span => getComputedStyle(span).visibility), "hidden");
  assert.equal(await page.locator(".puzzle-button").count(), 4);
  await page.locator("#back-button").click();
  await page.locator(".home-page").waitFor();
});
