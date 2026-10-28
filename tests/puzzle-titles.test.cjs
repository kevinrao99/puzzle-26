"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const URL = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
const KEY = "puzzle-26:v1:progress";
const SUBTITLES = {
  "white-1": "Old dudes",
  "white-2": "Good thing they are",
  "white-3": "She'd love these views",
  "white-4": "But beloved all the same",
  "blue-1": "He'll also need to be a bit clever this time",
  "blue-4": "It would be so cringe if you cheated on this one",
  "blue-2": "Average gacha addict spending habits",
  "blue-3": "Where we put the pedal to the medal",
  "black-1": "Julian blew my mind with this one back in the day",
  "black-2": "You fucking donkey",
  "black-3": "Hope your bank uses something else",
  "black-4": "Just some innocent looking reading material",
  "red-1": "Size is everything, no matter what they say",
  "red-2": "I just naturally know my way around",
  "red-3": "It's so much better to route this way",
  "red-4": "It's important to practice",
};
const progress = {
  version: 1, identityVerified: true,
  puzzles: {
    "white-1": { solved: true, attempts: ["PATRICK"] },
    "blue-2": { solved: true, attempts: ["KEEL"], eggMachine: { cardsPulled: 3 } },
    "green-4": { solved: true, attempts: ["FALCON"] },
  },
};
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(t, width) {
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
  t.after(() => {
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, [], "title changes require no remote data");
  });
  return page;
}

for (const width of [1152, 320]) {
  test(`all puzzle pages have the requested subtitles and category visibility (${width}px)`, async t => {
    const page = await fixture(t, width);
    await page.goto(`${URL}#/`);
    const ids = await page.evaluate(() => SITE_CONFIG.categories.flatMap(category => category.puzzles.map(puzzle => puzzle.id)));
    assert.equal(ids.length, 23);
    for (const id of ids) {
      await page.goto(`${URL}#/puzzle/${id}`);
      const puzzlePage = page.locator(`.puzzle-page[data-puzzle-id="${id}"]`);
      await puzzlePage.waitFor();
      const header = puzzlePage.locator(".page-header");
      const subtitle = header.locator(".puzzle-subtitle");
      if (id.startsWith("green-") || id.startsWith("phyrexian-")) {
        assert.equal(await subtitle.count(), 0, "category subtitles are omitted, not merely blank");
        assert.equal(await header.count(), id.startsWith("green-") ? 0 : 1, "only named puzzles retain their heading");
        continue;
      }
      await subtitle.waitFor();
      assert.equal(await subtitle.count(), 1);
      assert.equal(await subtitle.textContent(), SUBTITLES[id] ?? "subtitle");
      assert.deepEqual(await subtitle.evaluate(node => {
        const style = getComputedStyle(node);
        return [style.color, style.fontFamily, style.fontSize, style.fontWeight];
      }), ["rgb(243, 230, 197)", "Arial, Helvetica, sans-serif", "18px", "400"]);
      if (await header.locator("h1").count()) {
        assert.equal(await header.locator("h1 + .puzzle-subtitle").count(), 1);
      } else {
        assert.ok(id.startsWith("green-"), "only deliberately unnamed puzzles omit their title");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.PUZZLE_SCREENSHOT_DIR && ["white-3", "blue-4", "black-1", "red-2"].includes(id)) {
        await header.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `subtitle-${id}-${width}.png`) });
      }
    }
  });

  test(`requested titles appear on category buttons, puzzle pages, and browser tabs (${width}px)`, async t => {
    const page = await fixture(t, width);
    for (const [color, position, id, title, tier] of [
      ["white", 1, "white-1", "All Around Me Are...", "common"],
      ["white", 2, "white-2", "That Belongs in a Museum", "common"],
      ["white", 3, "white-3", "Classic Angela", "uncommon"],
      ["white", 4, "white-4", "The One Left Out", "rare"],
      ["blue", 2, "blue-4", "Double Trouble", "common"],
      ["blue", 3, "blue-2", "Endless Gacha", "uncommon"],
      ["blue", 4, "blue-3", "Fields of Knowledge", "rare"],
      ["black", 1, "black-1", "Very Weak", "common"],
      ["black", 3, "black-3", "A Six-Foot Thick Wooden Door", "uncommon"],
      ["black", 4, "black-4", "The Declaration of Independence", "rare"],
      ["red", 1, "red-3", "Aspire for Greatness", "common"],
      ["red", 2, "red-2", "To Sum Up Our Experiences?", "common"],
      ["red", 3, "red-1", "Permitted Travel", "uncommon"],
      ["red", 4, "red-4", "Skill Based Game", "rare"],
    ]) {
      await page.goto(`${URL}#/category/${color}`);
      const button = page.locator(".puzzle-button").nth(position - 1);
      assert.equal(await button.locator(".puzzle-name").textContent(), title);
      assert.equal(await button.locator(".puzzle-rarity-symbol").getAttribute("alt"), tier);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await button.click();
      await page.locator(".puzzle-page").waitFor();
      assert.ok(page.url().endsWith(`#/puzzle/${id}`), "stable ID, including reordered blue and red puzzles");
      assert.equal(await page.locator(".page-header h1").textContent(), title);
      assert.equal(await page.locator(".puzzle-subtitle").textContent(), SUBTITLES[id] ?? "subtitle");
      assert.equal(await page.title(), `${title} · ${color.toUpperCase()} · Puzzle 26`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), progress);
      if (process.env.PUZZLE_SCREENSHOT_DIR && color === "black") {
        await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `renamed-black-meta-${width}.png`), fullPage: true });
      }
    }
  });

  test(`all green puzzles are unnamed but retain accessible navigation, content, symbols, and saved progress (${width}px)`, async t => {
    const page = await fixture(t, width);
    await page.goto(`${URL}#/category/green`);
    const tiers = ["common", "common", "uncommon", "rare"];
    const ids = ["green-2", "green-1", "green-3", "green-4"];
    const content = ["#reaction-assembly .assembly-stage", "#animal-matching .animal-tray", "#rhythm-game", "#puzzle-statement"];
    let initialAssembly;
    assert.deepEqual(await page.locator(".puzzle-name").allTextContents(), ["", "", "", ""]);
    assert.deepEqual(await page.locator(".puzzle-button").allTextContents().then(texts => texts.map(text => text.trim())), ["", "", "", "✓"]);
    if (process.env.PUZZLE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `unnamed-green-category-${width}.png`), fullPage: true });
    }
    for (let index = 0; index < 4; index++) {
      const label = `GREEN puzzle ${index + 1}, ${tiers[index]}${index === 3 ? ", solved" : ""}`;
      const button = page.getByRole("button", { name: label, exact: true });
      await button.focus();
      await page.keyboard.press("Enter");
      await page.locator(content[index]).waitFor();
      assert.ok(page.url().endsWith(`#/puzzle/${ids[index]}`));
      assert.equal(await page.locator(".page-header h1").count(), 0, "no blank or placeholder heading");
      assert.equal(await page.title(), "GREEN · Puzzle 26", "former puzzle titles are not exposed in browser tabs");
      assert.equal(await page.locator(".puzzle-heading-category, .page-header .eyebrow, .page-header .puzzle-rarity-symbol").count(), 0);
      assert.equal(await page.locator(".page-header").count(), 0, "hidden subtitles leave no empty header on unnamed puzzles");
      assert.equal(await page.locator(".puzzle-subtitle").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
      assert.equal(saved.identityVerified, progress.identityVerified);
      assert.equal(saved.version, progress.version);
      for (const [id, existing] of Object.entries(progress.puzzles)) assert.deepEqual(saved.puzzles[id], existing);
      // Opening an unvisited assembly puzzle normally saves its initial layout.
      if (index === 0) {
        initialAssembly = saved.puzzles["green-2"];
        assert.equal(initialAssembly.solved, false);
        assert.deepEqual(initialAssembly.attempts, []);
        assert.equal(initialAssembly.assembly.pieces.length, 27);
      } else assert.deepEqual(saved.puzzles["green-2"], initialAssembly);
      if (process.env.PUZZLE_SCREENSHOT_DIR && index === 3) {
        await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, `unnamed-green-meta-${width}.png`), fullPage: true });
      }
      await page.locator("#back-button").click();
      await page.locator(".puzzle-button").first().waitFor();
    }
  });
}

test("subtitle metadata is customizable plain text and survives solving and reload", async t => {
  const page = await fixture(t, 1152);
  await page.goto(`${URL}#/puzzle/black-1`);
  await page.evaluate(() => {
    const puzzle = SITE_CONFIG.categories.find(category => category.id === "black").puzzles.find(puzzle => puzzle.id === "black-1");
    puzzle.subtitle = "Custom <em>subtitle</em> & text";
    renderRoute();
  });
  assert.equal(await page.locator(".puzzle-subtitle").textContent(), "Custom <em>subtitle</em> & text");
  assert.equal(await page.locator(".puzzle-subtitle > *").count(), 0, "plain text is not interpreted as markup");
  await page.locator("#puzzle-answer").fill("LANDS");
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".puzzle-subtitle").textContent(), "Custom <em>subtitle</em> & text");
  await page.reload();
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".puzzle-subtitle").textContent(), SUBTITLES["black-1"], "reload uses the saved source configuration, not transient test customization");
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(saved.puzzles["black-1"].solved, true);
  for (const [id, existing] of Object.entries(progress.puzzles)) assert.deepEqual(saved.puzzles[id], existing);
});
