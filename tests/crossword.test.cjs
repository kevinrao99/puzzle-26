"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { createHash } = require("node:crypto");
const { createServer } = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress";
const FILE_URL = pathToFileURL(path.join(ROOT, "index.html")).href;
const SVG_HASH = "1e65656b962cce89a451ae800cde9731ec1775529d3b4876d23f20617c8413e2";
const CLUES = {
  "across": [
    {
      "number": 1,
      "clue": "City home to the world’s largest baseball bat"
    },
    {
      "number": 5,
      "clue": "City famous for a 35-foot fork once billed as the world’s largest"
    },
    {
      "number": 9,
      "clue": "___ City, home of the world’s largest ball of sisal twine"
    },
    {
      "number": 13,
      "clue": "___ Monument, the world’s tallest freestanding stone structure"
    },
    {
      "number": 14,
      "clue": "City home to the world’s largest military aviation museum"
    },
    {
      "number": 15,
      "clue": "The world’s longest undeveloped stretch of barrier island"
    },
    {
      "number": 17,
      "clue": "Lake ___, crossed by the world’s longest continuous bridge over water"
    },
    {
      "number": 18,
      "clue": "The world’s tallest mountain from base to summit"
    },
    {
      "number": 19,
      "clue": "Town with Guinness records for the world’s largest rocking chair and mailbox"
    },
    {
      "number": 20,
      "clue": "Beaver-branded chain containing the world’s largest convenience store"
    },
    {
      "number": 23,
      "clue": "The world’s largest museum, education, and research complex"
    },
    {
      "number": 24,
      "clue": "The world’s largest active volcano"
    },
    {
      "number": 25,
      "clue": "___ Cave, the world’s longest known cave system"
    },
    {
      "number": 26,
      "clue": "City containing the world’s largest factory by volume"
    },
    {
      "number": 27,
      "clue": "City whose potato museum displays a Guinness-record giant potato crisp"
    }
  ],
  "down": [
    {
      "number": 2,
      "clue": "General ___, the world’s largest tree by trunk volume"
    },
    {
      "number": 3,
      "clue": "The world’s largest freshwater lake by surface area"
    },
    {
      "number": 4,
      "clue": "Home of the world’s largest fully steerable telescope"
    },
    {
      "number": 6,
      "clue": "Organisms responsible for the Guinness-record brightest bioluminescent bay"
    },
    {
      "number": 7,
      "clue": "The world’s largest piedmont glacier"
    },
    {
      "number": 8,
      "clue": "Site of the world’s largest gypsum dunefield"
    },
    {
      "number": 10,
      "clue": "___ Monument, the world’s tallest war memorial"
    },
    {
      "number": 11,
      "clue": "Town home to the World’s Largest Truckstop"
    },
    {
      "number": 12,
      "clue": "The world’s tallest active geyser"
    },
    {
      "number": 16,
      "clue": "Site of the world’s highest officially recorded air temperature"
    },
    {
      "number": 17,
      "clue": "What a 30-foot “world’s largest” roadside sculpture represents"
    },
    {
      "number": 21,
      "clue": "Library of ___, the world’s largest library"
    },
    {
      "number": 22,
      "clue": "Material making up the world’s largest ball of its kind"
    }
  ]
};
const OUTLINED = [[2,18],[3,9],[3,24],[5,1],[6,6],[6,21],[7,14],[10,10],[13,24],[13,28],[14,14],[16,10]];
const progress = { version: 1, identityVerified: true, puzzles: {
  "red-1": { solved: false, attempts: ["EARLIER GUESS"] },
  "red-2": { solved: false, attempts: [] },
  "red-3": { solved: true, attempts: ["CHAINWHIRLER"] },
  "red-4": { solved: false, attempts: ["META GUESS"] },
  "blue-4": { solved: false, attempts: [], grading: {} },
} };
let browser, server, origin;

before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  server = createServer(async (req, res) => {
    const filename = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/puzzle-26\//, "");
    const target = path.resolve(ROOT, filename);
    if (!target.startsWith(ROOT + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const body = await readFile(target);
      const mime = target.endsWith(".js") ? "text/javascript" : target.endsWith(".css") ? "text/css" : target.endsWith(".svg") ? "image/svg+xml" : target.endsWith(".png") ? "image/png" : "text/html";
      res.writeHead(200, { "Content-Type": mime });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function fixture(t, width = 1152, hosted = false) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], remote = [], failures = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.route(/^https?:/, route => {
    const url = route.request().url();
    if (url.startsWith(origin + "/")) return route.continue();
    if (!url.startsWith("https://fonts.googleapis.com/")) remote.push(url);
    return route.abort();
  });
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: KEY, progress });
  const base = hosted ? origin + "/puzzle-26/index.html" : FILE_URL;
  await page.goto(base + "#/category/red");
  const button = page.locator(".puzzle-button").nth(2);
  assert.equal(await button.locator(".puzzle-rarity-symbol").getAttribute("src"), "assets/donkey-uncommon.png");
  await button.click();
  await page.locator("#crossword-puzzle").waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector("#puzzle-image");
    return image.complete && image.naturalWidth === 1200;
  });
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, [], "crossword has no remote dependencies");
    assert.deepEqual(failures, []);
  });
  return page;
}

test("the unchanged blank SVG has 200 cells, 45 crossings, 28 entries, and exactly the 12 approved outlines", async t => {
  const svg = await readFile(path.join(ROOT, "assets/red-01-crossword.svg"), "utf8");
  assert.equal(createHash("sha256").update(svg).digest("hex"), SVG_HASH);
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const parsed = await page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    return {
      tags: [...new Set([...doc.querySelectorAll("*")].map(node => node.localName))],
      letters: [...doc.querySelectorAll("text")].map(node => node.textContent),
      cells: [...doc.querySelectorAll('rect[fill="white"]')].map(node => [
        (Number(node.getAttribute("y")) - 0.5) / 40,
        (Number(node.getAttribute("x")) - 0.5) / 40,
      ]),
      outlined: [...doc.querySelectorAll('rect[stroke-width="4"]')].map(node => [
        (Number(node.getAttribute("y")) - 2) / 40,
        (Number(node.getAttribute("x")) - 2) / 40,
      ]),
      numbers: [...doc.querySelectorAll("text")].map(node => [
        (Number(node.getAttribute("y")) - 14) / 40,
        (Number(node.getAttribute("x")) - 6) / 40,
        Number(node.textContent),
      ]),
    };
  }, svg);
  assert.deepEqual(parsed.tags, ["svg", "title", "desc", "rect", "text"]);
  assert.ok(parsed.letters.every(text => /^\d+$/.test(text)), "grid contains only clue numbers, no solution letters");
  assert.equal(parsed.cells.length, 200);
  assert.equal(new Set(parsed.cells.map(cell => cell.join(","))).size, 200);
  assert.equal(Math.max(...parsed.cells.map(([row]) => row)) + 1, 19);
  assert.equal(Math.max(...parsed.cells.map(([, col]) => col)) + 1, 30);
  assert.deepEqual(parsed.outlined, OUTLINED);
  assert.equal(parsed.outlined.length, 12);

  const occupied = new Set(parsed.cells.map(cell => cell.join(",")));
  const numbers = new Map(parsed.numbers.map(([r, c, n]) => [[r, c].join(","), n]));
  const coverage = new Map();
  for (const [direction, dr, dc] of [["across", 0, 1], ["down", 1, 0]]) {
    const starts = [];
    for (const [r, c] of parsed.cells) {
      if (occupied.has([r - dr, c - dc].join(",")) || !occupied.has([r + dr, c + dc].join(","))) continue;
      starts.push(numbers.get([r, c].join(",")));
      for (let row = r, col = c; occupied.has([row, col].join(",")); row += dr, col += dc) {
        const key = [row, col].join(",");
        coverage.set(key, (coverage.get(key) || 0) + 1);
      }
    }
    assert.deepEqual(starts, CLUES[direction].map(item => item.number));
  }
  assert.equal(coverage.size, 200);
  assert.equal([...coverage.values()].filter(count => count === 2).length, 45);
  assert.ok([...coverage.values()].every(count => count === 1 || count === 2));
});

for (const width of [1152, 320]) {
  for (const hosted of [false, true]) {
    test("Red 03 preserves exact clues and blank grid at " + width + "px via " + (hosted ? "project subpath" : "file"), async t => {
      const page = await fixture(t, width, hosted);
      assert.ok(page.url().endsWith("#/puzzle/red-1"));
      assert.equal(await page.locator("h1").textContent(), "Permitted Travel");
      for (const direction of ["across", "down"]) {
        const actual = await page.locator("#crossword-" + direction + " li").evaluateAll(items =>
          items.map(item => ({ number: item.value, clue: item.textContent })));
        assert.deepEqual(actual, CLUES[direction], "native text preserves clue punctuation and numbering");
      }
      assert.equal(await page.getByRole("heading", { name: "Across", exact: true }).count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Down", exact: true }).count(), 1);
      assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
      assert.equal(await page.locator("#crossword-puzzle input, #crossword-puzzle textarea").count(), 0);
      assert.equal(await page.locator(".placeholder-puzzle, .lede").count(), 0);
      assert.doesNotMatch(await page.locator("#app").innerText(), /GLORYBRINGER|anagram|extraction|word bank|will be added later/i);
      assert.equal(await page.locator("#crossword-puzzle a").count(), 0, "no authoring references are exposed");
      const answer = await page.locator("#puzzle-answer").boundingBox();
      const grid = await page.locator(".crossword-grid-scroll").boundingBox();
      assert.ok(answer.y + answer.height < grid.y);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const scroll = page.locator(".crossword-grid-scroll");
      const size = await scroll.evaluate(node => ({ client: node.clientWidth, scroll: node.scrollWidth }));
      const image = await page.locator("#puzzle-image").boundingBox();
      assert.ok(image.width >= 960, "grid does not shrink to illegible mobile cells");
      if (width === 320) {
        assert.ok(size.scroll > size.client, "only the grid scrolls horizontally");
        await scroll.focus();
        await page.keyboard.press("End");
        await scroll.evaluate(node => { node.scrollLeft = node.scrollWidth; });
        assert.ok(await scroll.evaluate(node => node.scrollLeft > 0));
        const right = await page.locator("#puzzle-image").boundingBox();
        const viewport = await scroll.boundingBox();
        assert.ok(Math.abs(right.x + right.width - viewport.x - viewport.width) < 2, "rightmost squares are reachable");
        await scroll.evaluate(node => { node.scrollLeft = 0; });
      }
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
      if (process.env.PUZZLE_SCREENSHOT_DIR && !hosted) {
        await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "red-01-" + width + ".png"), fullPage: true });
        await page.locator(".crossword-clues").screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "red-01-clues-" + width + ".png") });
      }
      await page.getByRole("button", { name: "Open instructions" }).click();
      assert.equal(await page.locator("#help-dialog").isVisible(), true);
      await page.getByRole("button", { name: "Close instructions" }).click();
      await page.locator("#back-button").click();
      await page.waitForURL(/#\/category\/red$/);
      await page.locator("#puzzle-list").waitFor();
      assert.equal(await page.locator(".puzzle-button").count(), 4);
    });
  }
}

test("Red 03 rejects ANSWER, accepts normalized GLORYBRINGER, and preserves other progress and crossword content", async t => {
  const page = await fixture(t);
  await page.locator("#puzzle-answer").fill("answer");
  await page.locator("#puzzle-answer").press("Enter");
  await page.getByText("Incorrect", { exact: true }).waitFor();
  await page.locator("#puzzle-answer").fill("  gLoRy-bringer!  ");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "  GLORYBRINGER  ");
  await page.locator("#puzzle-answer").press("Enter");
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".correct-attempt").textContent(), "GLORYBRINGER");
  assert.equal(await page.locator(".correct-attempt").evaluate(node => getComputedStyle(node).color), "rgb(54, 87, 31)");
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(saved.puzzles["red-1"].solved, true);
  assert.deepEqual(saved.puzzles["red-1"].attempts, ["EARLIER GUESS", "ANSWER", "GLORYBRINGER"]);
  for (const id of ["red-2", "red-3", "red-4", "blue-4"]) assert.deepEqual(saved.puzzles[id], progress.puzzles[id]);
  await page.reload();
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  assert.equal(await page.locator("#crossword-across li").count(), 15);
  assert.equal(await page.locator("#crossword-down li").count(), 13);
  assert.equal(await page.locator("#puzzle-image").getAttribute("src"), "assets/red-01-crossword.svg");
  await page.locator("#back-button").click();
  await page.locator('.puzzle-button:nth-child(3) .puzzle-status:text-is("GLORYBRINGER")').waitFor();
});
