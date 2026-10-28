"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress";
const FILE = pathToFileURL(path.join(ROOT, "index.html")).href + "#/puzzle/green-1";
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ["data.js", "board.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, "games/animals", file), "utf8"), sandbox);
const { AnimalMatching: rules, ANIMAL_MATCHING_DATA: data } = sandbox.window;
const pairs = {
  predation: [["ringed-seal", "polar-bear"], ["snowshoe-hare", "canada-lynx"], ["rock-pigeon", "peregrine-falcon"]],
  parasitism: [["european-hedgehog", "hedgehog-flea"], ["honey-bee", "varroa-mite"], ["lake-sturgeon", "sea-lamprey"]],
  cleaning: [["banded-mongoose", "common-warthog"], ["yellow-tang", "green-sea-turtle"], ["laysan-albatross", "ocean-sunfish"]],
};
const copy = object => JSON.parse(JSON.stringify(object));
function solution() {
  const slots = {};
  for (const [category, rows] of Object.entries(pairs)) rows.forEach((pair, row) => pair.forEach((id, side) => { slots[`${category}-${row}-${side}`] = id; }));
  return { version: 1, slots };
}
const prior = { version: 1, identityVerified: true, puzzles: {
  "green-1": { solved: false, attempts: ["OLD GUESS"] },
  "green-4": { solved: true, attempts: ["FALCON"] },
  "blue-2": { solved: false, attempts: [], eggMachine: { cardsPulled: 3 } },
} };
let browser, server, hosted;
before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  server = http.createServer((req, res) => {
    const route = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(ROOT, route.replace(/^\/puzzle-26\//, ""));
    if (!route.startsWith("/puzzle-26/") || !file.startsWith(ROOT + path.sep)) { res.writeHead(404).end(); return; }
    try {
      res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".jpg": "image/jpeg", ".png": "image/png" })[path.extname(file)] || "text/plain");
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  hosted = `http://127.0.0.1:${server.address().port}/puzzle-26/index.html#/puzzle/green-1`;
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function fixture(t, { url = FILE, width = 1200, matching, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width > 700 ? 1350 : 844 }, hasTouch: touch, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], remote = [];
  page.setDefaultTimeout(7000);
  page.on("pageerror", e => errors.push(e.message));
  await page.route(/^https?:/, route => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith("http://127.0.0.1:")) return route.continue();
    if (!requestUrl.startsWith("https://fonts.googleapis.com/")) remote.push(requestUrl);
    return route.abort();
  });
  const initial = copy(prior);
  if (matching) initial.puzzles["green-1"].matching = matching;
  await page.addInitScript(({ key, initial }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
  }, { key: KEY, initial });
  await page.goto(url);
  await page.locator(".animal-tile").first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("#animal-matching img")].every(img => img.complete && img.naturalWidth > 0));
  t.after(() => { assert.deepEqual(errors, []); assert.deepEqual(remote, []); });
  return page;
}
const progress = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
async function place(page, id, key, keyboard = false) {
  const tile = page.locator(`[data-animal="${id}"]`);
  const target = page.locator(`[data-slot="${key}"] button`);
  if (keyboard) { await tile.focus(); await tile.press("Enter"); await target.focus(); await target.press("Enter"); }
  else { await tile.click(); await target.click(); }
}

test("all 216 category row permutations pass, but reversed sides, partners, categories, and duplicates fail", () => {
  assert.equal(data.animals.length, 24);
  assert.equal(new Set(data.trayOrder).size, 18);
  const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for (const a of permutations) for (const b of permutations) for (const c of permutations) {
    const arrangement = solution();
    Object.keys(pairs).forEach((category, index) => [a,b,c][index].forEach((original, row) => {
      pairs[category][original].forEach((id, side) => { arrangement.slots[`${category}-${row}-${side}`] = id; });
    }));
    assert.equal(rules.isComplete(arrangement), true);
  }
  for (const category of Object.keys(pairs)) for (let row = 0; row < 3; row++) {
    const bad = solution(), left = `${category}-${row}-0`, right = `${category}-${row}-1`;
    [bad.slots[left],bad.slots[right]] = [bad.slots[right],bad.slots[left]];
    assert.equal(rules.isComplete(bad), false, `${category} reversed row ${row}`);
  }
  for (const category of Object.keys(pairs)) {
    const bad = solution();
    [bad.slots[`${category}-0-1`],bad.slots[`${category}-1-1`]] = [bad.slots[`${category}-1-1`],bad.slots[`${category}-0-1`]];
    assert.equal(rules.isComplete(bad), false, "right column alone is insufficient");
  }
  const wrongCategory = solution();
  for (const side of [0,1]) [wrongCategory.slots[`predation-0-${side}`],wrongCategory.slots[`parasitism-0-${side}`]] = [wrongCategory.slots[`parasitism-0-${side}`],wrongCategory.slots[`predation-0-${side}`]];
  assert.equal(rules.isComplete(wrongCategory), false);
  const duplicate = solution(); duplicate.slots["predation-0-0"] = duplicate.slots["predation-1-0"];
  assert.equal(rules.isComplete(duplicate), false);
  assert.equal(rules.isComplete({ version: 9, slots: solution().slots }), false);
});

test("24 bundled photos and source credits match their recorded checksums", () => {
  const records = JSON.parse(fs.readFileSync(path.join(ROOT,"assets/green-01-image-sources.json")));
  assert.equal(records.length, 24);
  for (const record of records) {
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT,record.src))).digest("hex"), record.sha256);
    assert.ok(record.sourceUrl.startsWith("https://commons.wikimedia.org/"));
    assert.ok(record.license);
  }
  assert.match(fs.readFileSync(path.join(ROOT,"assets/green-01/GFDL-1.2.txt"),"utf8"), /GNU Free Documentation License/);
});

for (const [width, fromServer] of [[1200,false],[320,false],[1200,true]]) test(`layout, fixed examples, and local images at ${width}px (${fromServer ? "project path" : "file"})`, async t => {
  const page = await fixture(t, { width, url: fromServer ? hosted : FILE });
  assert.equal(await page.locator("h1").count(), 0);
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  assert.equal(await page.locator(".animal-category").count(), 3);
  assert.equal(await page.locator(".animal-tray .animal-tile").count(), 18);
  assert.equal(await page.locator(".animal-slot").count(), 18);
  assert.deepEqual(await page.locator("[data-fixed]").evaluateAll(nodes => nodes.map(node => node.dataset.fixed)),
    ["brown-throated-sloth","harpy-eagle","cow","common-vampire-bat","mediterranean-cleaner-shrimp","mediterranean-moray-eel"]);
  assert.equal(await page.locator("[data-fixed] button").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal((await progress(page)).puzzles["green-1"].solved, false);
  if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.PUZZLE_SCREENSHOT_DIR,`animals-${width}.png`),fullPage:true});
});

test("mouse dragging, fixed example rejection, occupied swaps, and returning to tray", async t => {
  const page = await fixture(t);
  const tile = page.locator('[data-animal="honey-bee"]');
  const source = await tile.boundingBox(), target = await page.locator('[data-slot="parasitism-0-0"]').boundingBox();
  await page.mouse.move(source.x+source.width/2,source.y+source.height/2); await page.mouse.down();
  await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12}); await page.mouse.up();
  assert.equal(await page.locator('[data-slot="parasitism-0-0"] [data-animal="honey-bee"]').count(),1);
  await page.waitForTimeout(360);
  await place(page, "lake-sturgeon", "parasitism-0-0");
  assert.equal(await page.locator('.animal-tray [data-animal="honey-bee"]').count(),1);
  await place(page, "honey-bee", "parasitism-1-0");
  await place(page, "honey-bee", "parasitism-0-0");
  assert.equal(await page.locator('[data-slot="parasitism-1-0"] [data-animal="lake-sturgeon"]').count(),1);
  await page.locator('[data-animal="honey-bee"]').click();
  await page.locator('[data-fixed="cow"]').click();
  assert.equal(await page.locator('[data-slot="parasitism-0-0"] [data-animal="honey-bee"]').count(),1);
  await page.getByRole("button",{name:"Return selected photo to tray"}).click();
  assert.equal(await page.locator('.animal-tray [data-animal="honey-bee"]').count(),1);
  assert.equal(await page.locator(".animal-tile").count(),18);
});

test("keyboard completion locks and saves the arrangement while preserving other hunt progress", async t => {
  const page = await fixture(t, { url: hosted });
  for (const [key,id] of Object.entries(solution().slots)) await place(page,id,key,true);
  assert.equal(await page.locator("#animal-matching").getAttribute("data-complete"),"true");
  assert.match(await page.locator(".animal-status").textContent(),/Puzzle solved/);
  const saved = await progress(page);
  assert.equal(saved.puzzles["green-1"].solved,true);
  assert.deepEqual(saved.puzzles["green-1"].attempts,["OLD GUESS"]);
  assert.deepEqual(saved.puzzles["green-1"].matching,solution());
  for (const id of ["green-4","blue-2"]) assert.deepEqual(saved.puzzles[id],prior.puzzles[id]);
  assert.equal(await page.locator('.animal-tile:disabled').count(),18);
  assert.equal(await page.locator('.animal-return').isDisabled(),true);
  const source = await page.locator('[data-animal="ringed-seal"]').boundingBox();
  const target = await page.locator('[data-slot="predation-0-1"]').boundingBox();
  await page.mouse.move(source.x+source.width/2,source.y+source.height/2);
  await page.mouse.down();
  await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});
  await page.mouse.up();
  assert.equal(await page.locator('.animal-drag-ghost').count(),0);
  await page.locator('[data-animal="ringed-seal"] img').dispatchEvent('click');
  await page.locator('[data-animal="polar-bear"] img').dispatchEvent('click');
  await page.locator('.animal-return').dispatchEvent('click');
  assert.equal(await page.locator('.animal-tile[aria-pressed="true"]').count(),0);
  assert.deepEqual(await progress(page),saved);
  await page.locator("#back-button").click();
  assert.match(await page.getByRole("button",{name:"GREEN puzzle 2, common, solved",exact:true}).textContent(),/✓/);
  await page.getByRole("button",{name:"GREEN puzzle 2, common, solved",exact:true}).click();
  await page.locator('[data-complete="true"]').waitFor();
  await page.reload(); await page.locator('[data-complete="true"]').waitFor();
  assert.equal(await page.locator('.animal-tile:disabled').count(),18);
  assert.equal(await page.locator('.animal-return').isDisabled(),true);
  assert.deepEqual((await progress(page)).puzzles["green-1"].matching,solution());
});

test("a full but wrongly oriented board never solves; repairing the swap does", async t => {
  const matching = solution();
  [matching.slots["cleaning-1-0"],matching.slots["cleaning-1-1"]] = [matching.slots["cleaning-1-1"],matching.slots["cleaning-1-0"]];
  const page = await fixture(t,{matching});
  assert.match(await page.locator(".animal-status").textContent(),/not matched correctly/);
  assert.equal((await progress(page)).puzzles["green-1"].solved,false);
  await place(page,"yellow-tang","cleaning-1-0");
  assert.equal((await progress(page)).puzzles["green-1"].solved,true);
});

test("touch drag, tap selection, reload, and clear-progress work on a phone", async t => {
  const matching = {version:1, slots:{"predation-0-0":"ringed-seal"}};
  const page = await fixture(t,{width:390,touch:true,matching});
  const source = await page.locator('[data-animal="ringed-seal"]').boundingBox();
  const target = await page.locator('[data-slot="predation-0-1"]').boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:source.x+source.width/2,y:source.y+source.height/2}]});
  await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:target.x+target.width/2,y:target.y+target.height/2}]});
  await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  assert.equal((await progress(page)).puzzles["green-1"].matching.slots["predation-0-1"],"ringed-seal");
  await page.waitForTimeout(360);
  await page.locator('[data-animal="ringed-seal"]').tap();
  await page.locator('[data-slot="predation-0-0"] button').tap();
  await page.reload(); await page.locator('[data-slot="predation-0-0"] [data-animal="ringed-seal"]').waitFor();
  await page.locator("#help-button").click();
  page.once("dialog",dialog=>dialog.accept()); await page.locator("#clear-state").click();
  await page.waitForFunction(()=>location.hash==="#/");
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),null);
  assert.equal(await page.locator(".animal-matching,.animal-drag-ghost").count(),0);
});

test("corrupt saved placements cannot duplicate photos or move the fixed examples", async t => {
  const page = await fixture(t,{matching:{version:1,slots:{"predation-0-0":"cow","predation-0-1":"polar-bear","predation-1-0":"polar-bear","cleaning-0-0":"unknown"}}});
  assert.equal(await page.locator(".animal-tray .animal-tile").count(),17);
  assert.equal(await page.locator(".animal-tile").count(),18);
  assert.equal(await page.locator(".animal-slot [data-animal]").count(),1);
  assert.equal(await page.locator("#animal-matching").getAttribute("data-complete"),"false");
});

test("storage failures show recovery feedback, and navigation cleans up active drags", async t => {
  const page = await fixture(t);
  await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error("storage full"); }; });
  await place(page,"polar-bear","predation-0-1");
  assert.equal(await page.locator(".animal-save-error").isVisible(),true);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await place(page,"ringed-seal","predation-0-0");
  assert.equal(await page.locator(".animal-save-error").isVisible(),false);
  assert.equal((await progress(page)).puzzles["green-1"].matching.slots["predation-0-1"],"polar-bear");
  const tile=await page.locator('[data-animal="honey-bee"]').boundingBox();
  await page.mouse.move(tile.x+tile.width/2,tile.y+tile.height/2); await page.mouse.down();
  await page.mouse.move(tile.x+tile.width/2+20,tile.y+tile.height/2-20);
  assert.equal(await page.locator(".animal-drag-ghost").count(),1);
  await page.evaluate(()=>location.hash="#/category/green");
  await page.locator("#puzzle-list").waitFor(); await page.mouse.up();
  assert.equal(await page.locator(".animal-drag-ghost").count(),0);
});
