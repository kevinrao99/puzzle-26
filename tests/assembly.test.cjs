"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const KEY = "puzzle-26:v1:progress", PREVIEW_KEY = "puzzle-26:assembly-preview:v1";
const PREVIEW = pathToFileURL(path.join(ROOT, "previews/reaction-assembly.html")).href;
const HUNT = pathToFileURL(path.join(ROOT, "index.html")).href + "#/puzzle/green-2";
let browser, server, hosted;
before(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  server = http.createServer(async (req, res) => {
    const route = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(ROOT, route.replace(/^\/puzzle-26\//, ""));
    if (!route.startsWith("/puzzle-26/") || !file.startsWith(ROOT + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const body = await fs.readFile(file);
      res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  hosted = `http://127.0.0.1:${server.address().port}/puzzle-26/index.html#/puzzle/green-2`;
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function fixture(t, { hunt = false, url, mobile = false } = {}) {
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 1100 }, hasTouch: mobile, isMobile: mobile });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], remote = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, route => {
    if (route.request().url().startsWith("http://127.0.0.1:")) return route.continue();
    if (!route.request().url().startsWith("https://fonts.googleapis.com/")) remote.push(route.request().url());
    return route.abort();
  });
  if (hunt) await page.addInitScript(key => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, identityVerified: true, puzzles: { "blue-2": { solved: true, attempts: ["PRIOR"], eggMachine: { cardsPulled: 3 } }, "green-2": { solved: false, attempts: ["OLD" ] } } }));
  }, KEY);
  await page.goto(url || (hunt ? HUNT : PREVIEW));
  await page.locator(".assembly-piece").first().waitFor();
  await page.locator(".assembly-stage").scrollIntoViewIfNeeded();
  t.after(() => { assert.deepEqual(errors, []); assert.deepEqual(remote, []); });
  return page;
}
async function state(page, hunt = false) {
  return page.evaluate(({ key, hunt }) => { const value = JSON.parse(localStorage.getItem(key)); return hunt ? value.puzzles["green-2"].assembly : value; }, { key: hunt ? KEY : PREVIEW_KEY, hunt });
}
async function hitPoint(page, id) {
  return page.evaluate(id => {
    const group = document.querySelector(`[data-piece="${id}"]`);
    for (const shape of group.querySelectorAll(".assembly-geometry line,.assembly-geometry path,.assembly-label text")) {
      const box = shape.getBBox();
      const p = shape.getPointAtLength ? shape.getPointAtLength(shape.getTotalLength() / 2) : new DOMPoint(box.x + box.width / 2, box.y + box.height / 2);
      const q = new DOMPoint(p.x, p.y).matrixTransform(shape.getScreenCTM());
      if (document.elementFromPoint(q.x, q.y)?.closest("[data-piece]") === group) return { x: q.x, y: q.y };
    }
    throw new Error("No exposed geometry on " + id);
  }, id);
}
async function upright(page) {
  const matrices = await page.locator(".assembly-label").evaluateAll(labels => labels.map(label => { const m = label.getScreenCTM(); return { a: m.a, b: m.b, c: m.c, d: m.d }; }));
  assert.equal(matrices.length, await page.evaluate(() => ASSEMBLY_PIECES.pieces.reduce((n,p) => n+p.labels.length,0)));
  assert.ok(matrices.length > 40);
  for (const m of matrices) { assert.ok(m.a > 0 && m.d > 0); assert.ok(Math.abs(m.b) < 1e-7 && Math.abs(m.c) < 1e-7); }
}
test("approved vector content, random starts, upright labels and no external resources", async t => {
  const page = await fixture(t);
  assert.equal(await page.locator(".assembly-piece").count(), 27);
  assert.equal(await page.locator("button, .assembly-toolbar, .assembly-help, .assembly-footer, header").count(), 0);
  assert.equal(await page.locator(".assembly-geometry [marker-end]").count(), 25);
  const content = await page.locator(".assembly-pieces").textContent();
  assert.doesNotMatch(content, /G[₄₅45]|Step|step|Finish|Start|Piece|C[₁₂₃₄1234]/);
  assert.equal(await page.locator(".assembly-geometry text").count(), 0);
  let stored = await state(page);
  assert.equal(new Set(stored.pieces.map(p => p.id)).size, 27);
  assert.ok(new Set(stored.pieces.map(p => p.angle)).size > 5);
  await upright(page);
  const original = stored.pieces;
  await page.reload();
  await page.locator(".assembly-piece").first().waitFor();
  assert.deepEqual((await state(page)).pieces, original);
  const screenshot = process.env.PUZZLE_SCREENSHOT_DIR;
  if (screenshot) await page.screenshot({ path: path.join(screenshot, "assembly-desktop.png"), fullPage: true });
});
test("drag, keyboard nudge, rotation, multiple selection, undo, pan and zoom", async t => {
  const page = await fixture(t);
  const initial = await state(page), id = initial.pieces.at(-1).id;
  const piece = page.locator(`[data-piece="${id}"]`);
  const p = await hitPoint(page, id);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 55, p.y + 20, { steps: 8 }); await page.mouse.up();
  let moved = (await state(page)).pieces.find(p => p.id === id), prior = initial.pieces.find(p => p.id === id);
  assert.ok(Math.abs(moved.x - prior.x - 55 / initial.view.zoom) < 2);
  await page.keyboard.press("ArrowRight");
  assert.equal((await state(page)).pieces.find(p => p.id === id).x, moved.x + 5);
  await page.keyboard.press("Shift+E");
  assert.equal((await state(page)).pieces.find(p => p.id === id).angle, (moved.angle + 1) % 360);
  await upright(page);
  const before = await state(page);
  await page.keyboard.press("e");
  assert.equal((await state(page)).pieces.find(p => p.id === id).angle, (before.pieces.find(p => p.id === id).angle + 15) % 360);
  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual(await state(page), before);
  await page.locator(".assembly-stage").focus();
  await piece.focus();
  const secondId = initial.pieces[0].id, second = await hitPoint(page, secondId);
  await page.keyboard.down("Shift"); await page.mouse.click(second.x, second.y); await page.keyboard.up("Shift");
  assert.equal(await page.locator('.assembly-piece[aria-pressed="true"]').count(), 2);
  const selection = await state(page), first = selection.pieces.find(p => p.id === id), other = selection.pieces.find(p => p.id === secondId);
  await page.keyboard.press("g"); await page.keyboard.press("Shift+G");
  assert.deepEqual(await state(page), selection);
  await page.keyboard.press("e");
  const rotated = await state(page), a = rotated.pieces.find(p => p.id === id), b = rotated.pieces.find(p => p.id === secondId);
  assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(first.x-other.x,first.y-other.y)) < .00001);
  assert.equal(a.angle, (first.angle + 15) % 360); assert.equal(b.angle, (other.angle + 15) % 360);
  await upright(page);
  assert.ok((await state(page)).pieces.every(p => !("group" in p)));
  const view = (await state(page)).view;
  await page.keyboard.press("+"); await page.waitForTimeout(250);
  assert.ok((await state(page)).view.zoom > view.zoom);
  await page.locator(".assembly-stage").focus(); await page.keyboard.down("Space");
  const stage = await page.locator(".assembly-stage").boundingBox();
  await page.mouse.move(stage.x+20,stage.y+20); await page.mouse.down(); await page.mouse.move(stage.x+70,stage.y+45); await page.mouse.up(); await page.keyboard.up("Space");
  assert.notEqual((await state(page)).view.x, view.x);
  await page.keyboard.press("0");
  await page.keyboard.press("f");
  assert.equal(await page.locator(".assembly-expanded").count(), 1);
  await page.keyboard.press("Escape"); assert.equal(await page.locator(".assembly-expanded").count(), 0);
});
test("free rotation keeps atom text upright at arbitrary angles; reshuffle is deliberate and undoable", async t => {
  const page = await fixture(t), start = await state(page), id = start.pieces.at(-1).id;
  await page.locator(`[data-piece="${id}"]`).focus();
  const handle = await page.locator("[data-rotate]").boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2); await page.mouse.down(); await page.mouse.move(handle.x+handle.width/2+70,handle.y+handle.height/2+35,{steps:10}); await page.mouse.up();
  assert.notEqual((await state(page)).pieces.find(p => p.id === id).angle, start.pieces.find(p => p.id === id).angle);
  await upright(page);
  const before = await state(page);
  page.once("dialog", dialog => dialog.dismiss()); await page.keyboard.press("r");
  assert.deepEqual(await state(page), before);
  page.once("dialog", dialog => dialog.accept()); await page.keyboard.press("r");
  assert.notDeepEqual((await state(page)).pieces, before.pieces);
  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual(await state(page), before);
});
for (const fromServer of [false, true]) test(`Green 02 integration preserves progress across answers and navigation (${fromServer ? "project path" : "local file"})`, async t => {
  const page = await fixture(t, { hunt: true, url: fromServer ? hosted : HUNT });
  const initial = await state(page, true), id = initial.pieces[0].id;
  await page.locator(`[data-piece="${id}"]`).focus(); await page.keyboard.press("e");
  const edited = await state(page, true);
  await page.locator("#puzzle-answer").fill("WRONG"); await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".feedback").textContent.includes("Not quite"));
  await page.locator(".assembly-piece").first().waitFor();
  assert.deepEqual(await state(page, true), edited);
  await page.locator("#back-button").click(); await page.locator(".assembly-stage").waitFor({ state: "detached" });
  assert.equal(await page.locator(".assembly-stage").count(), 0);
  await page.evaluate(() => location.hash = "#/puzzle/green-2"); await page.locator(".assembly-piece").first().waitFor();
  assert.deepEqual(await state(page, true), edited);
  await page.reload(); await page.locator(".assembly-piece").first().waitFor();
  assert.deepEqual(await state(page, true), edited);
  const progress = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  assert.deepEqual(progress.puzzles["blue-2"], { solved: true, attempts: ["PRIOR"], eggMachine: { cardsPulled: 3 } });
  assert.deepEqual(progress.puzzles["green-2"].attempts, ["OLD", "WRONG"]);
  await page.locator("#help-button").click(); page.once("dialog", d => d.accept()); await page.locator("#clear-state").click();
  await page.waitForFunction(() => location.hash === "#/");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null);
  assert.equal(await page.locator(".assembly-stage").count(), 0);
});
test("mobile board fits viewport and touch gestures save without rotating text", async t => {
  const page = await fixture(t, { mobile: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const initial = await state(page), id = initial.pieces.at(-1).id, at = await hitPoint(page, id);
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x+20, y: at.y+15 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.notEqual((await state(page)).pieces.find(p=>p.id===id).x, initial.pieces.find(p=>p.id===id).x);
  const stage = await page.locator(".assembly-stage").boundingBox(), x = stage.x+stage.width/2, y=stage.y+stage.height/2;
  const before = (await state(page)).view.zoom;
  await client.send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
  await client.send("Input.dispatchTouchEvent", {type:"touchMove",touchPoints:[{x:x-65,y,id:1},{x:x+65,y,id:2}]});
  await client.send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]});
  assert.ok((await state(page)).view.zoom > before);
  await upright(page);
  if (process.env.PUZZLE_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.PUZZLE_SCREENSHOT_DIR,"assembly-mobile.png"),fullPage:true});
});
