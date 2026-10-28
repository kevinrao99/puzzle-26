"use strict";

const RARITY_ASSETS = ["common", "uncommon", "rare", "mythic"].map(tier => `assets/donkey-${tier}.png`);
const PHYREXIAN_ASSETS = ["assets/Phyrexian-Regular.ttf", "assets/phyrexian-symbol.png"];

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const STORAGE_KEY = "puzzle-26:v1:progress";
const SESSION_KEY = "puzzle-26:v1:grader-session";
const API = "https://grader.example.test";
const SOURCE = "#include <vector>\n// MixedCase source must stay unchanged\nint main() { return 0; }\n";
let browser;
let server;
let origin;

before(async () => {
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname.replace(/^\/puzzle-26\//, "/");
    const filename = pathname === "/" ? "index.html" : pathname.slice(1);
    if (![...RARITY_ASSETS, ...PHYREXIAN_ASSETS, "index.html", "app.js", "styles.css", "grading.js", "grader-config.js", "egg-machine.js", "egg-machine.css", "cards.js", "cards.css", "cards-data.js", "phyrexian-encoding.js", "phyrexian-transformations.js", "assets/rare-egg-machine-reference.png"].includes(filename)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const content = await readFile(path.join(ROOT, filename));
      res.writeHead(200, { "Content-Type": filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : filename.endsWith(".png") ? "image/png" : "text/html" });
      res.end(content);
    } catch { res.writeHead(500).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1152, height: 900 }, reducedMotion: "reduce", hasTouch: options.hasTouch === true });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  const uploads = [];
  const logins = [];
  const jobs = new Map();
  const getRequests = [];
  const grades = [...(options.grades || [100, 100])];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "no uncaught browser errors"));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**/grader-config.js", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.PUZZLE_GRADER_CONFIG = ${JSON.stringify({
      baseUrl: options.configured === false ? "" : API,
      maxFileBytes: 256 * 1024, pollIntervalMs: 30, requestTimeoutMs: 1500, pollTimeoutMs: 5000,
    })};`,
  }));
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (body, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(body),
      headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
    });
    if (request.method() === "OPTIONS") return reply({});
    if (url.pathname === "/login") {
      const input = request.postDataJSON();
      logins.push(input);
      if (input.accessCode !== "Private-code_123!") return reply({}, 401);
      return reply({ token: "solver-session-only", expiresAt: new Date(Date.now() + 3600000).toISOString() });
    }
    assert.equal(request.headers().authorization, "Bearer solver-session-only");
    if (url.pathname === "/submissions" && request.method() === "POST") {
      uploads.push(request.postDataBuffer().toString());
      if (options.uploadFailure) return reply({}, options.uploadFailure);
      const jobId = `job-${uploads.length}`;
      jobs.set(jobId, { jobId, status: "complete", score: grades.shift() ?? 100, maximumScore: 100 });
      return reply({ jobId, status: "queued" }, 202);
    }
    const jobId = decodeURIComponent(url.pathname.split("/").at(-1));
    getRequests.push(jobId);
    if (options.onPoll) return options.onPoll({ jobId, reply, jobs, page });
    return reply(jobs.get(jobId));
  });
  const progress = options.progress || { version: 1, identityVerified: true, puzzles: {} };
  await page.addInitScript(({ progress, key }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { progress, key: STORAGE_KEY });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-4`);
  await page.waitForSelector("#grading-puzzle");
  return { page, uploads, logins, jobs, getRequests };
}

async function login(page, code = "Private-code_123!") {
  await page.locator("#grading-access-code").fill(code);
  await page.locator(".grading-login-form button").click();
  await page.waitForFunction(() => document.querySelector(".grading-connection").textContent === "Connected");
}

async function chooseFile(page, part, name = `${part}.cpp`, buffer = Buffer.from(SOURCE)) {
  await page.locator(`#${part}-file`).setInputFiles({ name, mimeType: "text/plain", buffer });
}

async function upload(page, part, name) {
  await chooseFile(page, part, name);
  const button = page.locator(`.grading-part:has(#${part}-file) .upload-form button[type=submit]`);
  assert.equal(await button.textContent(), "→");
  assert.match(await button.getAttribute("aria-label"), /^Submit .+ code$/);
  await button.click();
}

async function waitForGrade(page, part, score) {
  await page.waitForFunction(({ part, score }) => {
    const history = document.querySelector(`#${part}-file`).closest(".grading-part").querySelector(".submission-history");
    return history.textContent.includes(`Score: ${score} / 100`);
  }, { part, score });
}

test("GREEN solves without grading or sign-in, rejects ANSWER, and leaves other puzzles unchanged", async (t) => {
  const { page, uploads, logins } = await fixture(t, { configured: false });
  assert.equal(await page.locator(".grading-part").count(), 2);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  assert.equal(await page.locator("#puzzle-answer-form button").isEnabled(), true);
  assert.equal(await page.locator("#grading-answer-notice").isVisible(), false);
  assert.equal(await page.getByText("The answer box unlocks when both parts score 100/100.", { exact: true }).count(), 0);
  assert.equal(await page.locator(".grading-login-form").isVisible(), false);
  assert.match(await page.locator(".grading-connection").textContent(), /once the server is connected/);
  await chooseFile(page, "teams");
  assert.equal(await page.locator(".grading-part").first().locator("button[type=submit]").isDisabled(), true);
  await page.locator("#puzzle-answer").fill("ANSWER");
  await page.locator("#puzzle-answer").press("Enter");
  await page.getByText("Not quite. Try again.", { exact: true }).waitFor();
  await page.locator("#puzzle-answer").fill("  gRe-en!  ");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "  GREEN  ");
  await page.locator("#puzzle-answer").press("Enter");
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".correct-attempt").textContent(), "GREEN");
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  assert.deepEqual(await page.locator(".attempt-list li").allTextContents(), ["ANSWER", "GREEN"]);
  assert.equal(uploads.length, 0);
  assert.equal(logins.length, 0);
  await page.reload();
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  assert.equal(await page.locator(".grading-part").count(), 2);
  await page.locator("#back-button").click();
  await page.locator('.puzzle-status:text-is("GREEN")').waitFor();
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-3`);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  assert.equal(await page.locator(".grading-part").count(), 0);
  await page.locator("#puzzle-answer").fill("jIaChEn!");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "JIACHEN");
  await page.locator("#puzzle-answer-form button").click();
  await page.locator(".correct-attempt").waitFor();
});

test("partial scores allow retry; both 100s reveal GREEN; the answer form stays independent of grades", async (t) => {
  const { page, uploads, logins } = await fixture(t, { grades: [34, 100, 100] });
  await login(page);
  assert.deepEqual(logins, [{ accessCode: "Private-code_123!" }]);
  await upload(page, "teams");
  await waitForGrade(page, "teams", 34);
  assert.equal(await page.locator("#teams-file").isEnabled(), true);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  await upload(page, "teams");
  await waitForGrade(page, "teams", 100);
  assert.equal(await page.locator("#teams-file").isDisabled(), true);
  assert.equal(await page.locator("#railroad-file").isEnabled(), true);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  await page.reload();
  await page.waitForSelector("#teams-file");
  assert.equal(await page.locator("#teams-file").isDisabled(), true);
  assert.equal(await page.locator(".grading-login-form").isVisible(), false);
  await page.locator(".grading-part").first().locator("form").evaluate((form) =>
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(uploads.length, 2, "passed part rejects even programmatic form submission");
  await upload(page, "railroad");
  await waitForGrade(page, "railroad", 100);
  assert.equal(await page.locator("#railroad-file").isDisabled(), true);
  assert.equal(await page.locator(".revealed-answer").textContent(), "GREEN");
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  assert.equal(await page.locator(".grading-access").isVisible(), false);
  if (process.env.PUZZLE_SCREENSHOT_DIR) {
    await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "blue-02-answer-revealed.png"), fullPage: true });
  }
  const progress = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.notEqual(progress.puzzles["blue-4"].solved, true);
  assert.equal(progress.puzzles["blue-4"].grading.teams.length, 2);
  assert.ok(uploads[0].includes("teams-2015"));
  assert.ok(uploads[2].includes("railroad-2016"));
  assert.ok(uploads[0].includes(SOURCE), "source is sent without answer normalization");
  assert.ok(!JSON.stringify(progress).includes(SOURCE));
  assert.ok(!JSON.stringify(progress).includes("Private-code_123!"));
  await page.locator("#puzzle-answer").fill("wrong");
  await page.locator("#puzzle-answer-form button").click();
  await page.waitForFunction(() => document.querySelector("#attempt-history").textContent.includes("WRONG"));
  assert.equal(await page.locator("#teams-file").isDisabled(), true);
  await page.locator("#puzzle-answer").fill("green");
  await page.locator("#puzzle-answer-form button").click();
  await page.locator(".correct-attempt").waitFor();
  await page.reload();
  await page.waitForSelector("#grading-puzzle");
  assert.match(await page.locator("#attempt-history").textContent(), /WRONG[\s\S]*GREEN/);
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".correct-attempt").textContent(), "GREEN");
  assert.equal(await page.locator("#puzzle-answer-form, .revealed-answer").count(), 0);
});

test("login and upload validation reject incorrect credentials and invalid files without submitting", async (t) => {
  const { page, uploads } = await fixture(t);
  await page.locator("#grading-access-code").fill("wrong");
  await page.locator(".grading-login-form button").click();
  await page.waitForFunction(() => document.querySelector(".grading-connection").textContent.includes("not accepted"));
  await login(page);
  const section = page.locator(".grading-part").first();
  for (const [name, buffer, expected] of [
    ["solution", Buffer.from(SOURCE), ".cpp extension"],
    ["solution.c", Buffer.from(SOURCE), ".cpp extension"],
    ["solution.cc", Buffer.from(SOURCE), ".cpp extension"],
    ["solution.cxx", Buffer.from(SOURCE), ".cpp extension"],
    ["solution.h", Buffer.from(SOURCE), ".cpp extension"],
    ["solution.py", Buffer.from("print(42)"), ".cpp extension"],
    ["solution.js", Buffer.from("console.log(42)"), ".cpp extension"],
    ["document.pdf", Buffer.from("%PDF-1.7\n"), ".cpp extension"],
    ["solution.cpp.txt", Buffer.from(SOURCE), ".cpp extension"],
    ["solution.cpp.", Buffer.from(SOURCE), ".cpp extension"],
    ["bad.txt", Buffer.from(SOURCE), ".cpp extension"],
    ["empty.cpp", Buffer.alloc(0), "empty"],
    ["large.cpp", Buffer.alloc(256 * 1024 + 1, 65), "256 KB"],
  ]) {
    await chooseFile(page, "teams", name, buffer);
    assert.match(await section.locator(".upload-feedback").textContent(), new RegExp(expected));
    assert.equal(await section.locator("button[type=submit]").isDisabled(), true);
  }
  await chooseFile(page, "teams", "binary.cpp", Buffer.from([0x41, 0, 0x42]));
  await section.locator("button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector(".upload-feedback").textContent.includes("binary"));
  await chooseFile(page, "teams", "invalid.cpp", Buffer.from([0xff, 0xfe, 0xfe]));
  await section.locator("button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector(".upload-feedback").textContent.includes("UTF-8"));
  await chooseFile(page, "teams", "blank.cpp", Buffer.from(" \r\n\t"));
  await section.locator("button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector(".upload-feedback").textContent.includes("no source code"));
  await chooseFile(page, "teams", "document.cpp", Buffer.from("%PDF-1.7\n\0binary"));
  await section.locator("button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector(".upload-feedback").textContent.includes("binary"));
  await page.locator("#teams-file").setInputFiles([]);
  assert.equal(await section.locator("button[type=submit]").isDisabled(), true);
  assert.equal(uploads.length, 0);
  assert.equal(await section.locator(".upload-history li").count(), 0);
  await upload(page, "teams", "corrected.CPP");
  await waitForGrade(page, "teams", 100);
  assert.equal(uploads.length, 1, "a corrected selection can be submitted");
});

// Wrong answers, CPU/memory limits, and runtime crashes share this public result.
// Their distinct real sandbox verdicts are verified in the live backend suite.
for (const failure of ["runtime failure", "compilation failure"]) {
  test(`${failure}: numeric zero stays visible, permits retry, and leaves the answer form available`, async t => {
    const compilation = failure === "compilation failure";
    const { page, uploads } = await fixture(t, {
      onPoll({ jobId, reply }) {
        return reply({ jobId, status: "complete", score: 0, maximumScore: 100,
          ...(compilation ? { message: "Compilation failed.", compileOutput: '<img src=x onerror="window.uploadXss=1"> error: invalid C++' } : {}) });
      },
    });
    await login(page);
    await upload(page, "teams", "failure.cpp");
    await waitForGrade(page, "teams", 0);
    const section = page.locator(".grading-part").first();
    assert.equal(await page.locator("#teams-file").isEnabled(), true);
    assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
    assert.equal(await page.locator(".revealed-answer").count(), 0);
    if (compilation) {
      assert.match(await section.textContent(), /error: invalid C\+\+/);
      assert.equal(await section.locator("img").count(), 0);
      assert.equal(await page.evaluate(() => window.uploadXss), undefined);
    }
    await page.reload();
    await page.waitForSelector("#teams-file");
    await waitForGrade(page, "teams", 0);
    assert.equal(await page.locator("#teams-file").isEnabled(), true);
    await upload(page, "teams", "retry.cpp");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("puzzle-26:v1:progress")).puzzles["blue-4"].grading.teams.filter(a => a.status === "complete").length === 2);
    assert.equal(uploads.length, 2);
    assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  });
}

test("queued submissions show the concise status in feedback and history", async t => {
  const { page } = await fixture(t, {
    onPoll({ jobId, reply }) {
      return reply({ jobId, status: "queued" });
    },
  });
  await login(page);
  await upload(page, "teams");
  await page.waitForFunction(() => document.querySelector(".upload-feedback").textContent === "Queued...");
  const history = await page.locator(".grading-part").first().locator(".submission-history").textContent();
  assert.ok(history.includes("Queued..."));
  assert.ok(!history.includes("Queued for grading"));
});

test("repeated submit actions create one upload while grading is pending", async t => {
  let complete = false;
  const { page, uploads } = await fixture(t, {
    onPoll({ jobId, reply }) {
      return reply(complete ? { jobId, status: "complete", score: 0, maximumScore: 100 } : { jobId, status: "running" });
    },
  });
  await login(page);
  await chooseFile(page, "teams");
  const section = page.locator(".grading-part").first();
  await section.locator(".upload-form").evaluate(form => {
    for (let i = 0; i < 3; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("puzzle-26:v1:progress")).puzzles["blue-4"].grading.teams.at(-1)?.status === "running");
  assert.equal(uploads.length, 1);
  assert.equal(await section.locator("button[type=submit]").isDisabled(), true);
  assert.equal(await page.locator("#teams-file").isDisabled(), true);
  complete = true;
  await waitForGrade(page, "teams", 0);
  assert.equal(await page.locator("#teams-file").isEnabled(), true);
  assert.equal(uploads.length, 1);
});

test("GREEN can solve while grading is still running, without cancelling the upload", async t => {
  let complete = false;
  const { page, uploads } = await fixture(t, {
    onPoll({ jobId, reply }) {
      return reply(complete ? { jobId, status: "complete", score: 100, maximumScore: 100 } : { jobId, status: "running" });
    },
  });
  await login(page);
  await upload(page, "teams");
  await page.waitForFunction(() => document.querySelector(".upload-feedback").textContent === "Running...");
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  assert.equal(await page.locator("#puzzle-answer-form button").isEnabled(), true);
  await page.locator("#puzzle-answer").fill("green");
  await page.locator("#puzzle-answer").press("Enter");
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".correct-attempt").textContent(), "GREEN");
  assert.equal(await page.locator("#puzzle-answer-form").count(), 0);
  complete = true;
  await waitForGrade(page, "teams", 100);
  assert.equal(await page.locator("#teams-file").isDisabled(), true);
  assert.equal(await page.locator("#puzzle-answer-form, .revealed-answer").count(), 0);
  assert.equal(uploads.length, 1);
  const progress = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(progress.puzzles["blue-4"].solved, true);
  assert.equal(progress.puzzles["blue-4"].grading.teams.at(-1).score, 100);
});

test("poll failures pause and resume without duplicating uploads; output is rendered as text", async (t) => {
  let failed = false;
  const { page, uploads } = await fixture(t, {
    onPoll({ jobId, reply }) {
      if (!failed) { failed = true; return reply({}, 503); }
      return reply({ jobId, status: "compile_error", compileOutput: '<img src=x onerror="window.injected=true"> compiler message' });
    },
  });
  await login(page);
  await upload(page, "teams", "<img src=x>.cpp");
  await page.waitForSelector(".check-status:not([hidden])");
  assert.equal(uploads.length, 1);
  await page.locator(".grading-part").first().locator(".check-status").click();
  await page.waitForFunction(() => document.querySelector(".submission-history").textContent.includes("Compilation failed"));
  assert.equal(uploads.length, 1);
  assert.equal(await page.locator(".submission-history img").count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await page.locator("#teams-file").isEnabled(), true);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
});

test("pending job survives navigation and reload, then resumes after expired session is renewed", async (t) => {
  let expire = true;
  const { page, uploads } = await fixture(t, {
    onPoll({ jobId, reply }) {
      if (expire) return reply({}, 401);
      return reply({ jobId, status: "complete", score: 100, maximumScore: 100 });
    },
  });
  await login(page);
  await upload(page, "teams");
  await page.waitForSelector(".grading-login-form:not([hidden])");
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null);
  await page.locator("#back-button").click();
  await page.waitForSelector("#puzzle-list");
  await page.getByRole("button", { name: "Double Trouble, common", exact: true }).click();
  await page.waitForSelector("#grading-puzzle");
  await page.reload();
  await page.waitForSelector("#grading-puzzle");
  expire = false;
  await login(page);
  await waitForGrade(page, "teams", 100);
  assert.equal(uploads.length, 1);
});

test("malformed score never completes the part or reveals the answer", async (t) => {
  const { page } = await fixture(t, {
    onPoll: ({ jobId, reply }) => reply({ jobId, status: "complete", score: "100", maximumScore: 100 }),
  });
  await login(page);
  await upload(page, "teams");
  await page.waitForFunction(() => document.querySelector(".upload-feedback").textContent.includes("valid score"));
  assert.equal(await page.locator(".revealed-answer").count(), 0);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  assert.equal(await page.locator(".part-complete").count(), 0);
});

test("clear local progress removes grading data and sign-in, including active polling", async (t) => {
  const { page } = await fixture(t, {
    onPoll: ({ jobId, reply }) => reply({ jobId, status: "running" }),
  });
  await login(page);
  await upload(page, "teams");
  await page.waitForFunction(() => document.querySelector(".upload-feedback").textContent === "Running...");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#help-button").click();
  await page.locator("#clear-state").click();
  await page.waitForSelector("#identity-form");
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), null);
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null);
  await page.locator("#identity-answer").fill("bum");
  await page.locator("#identity-form button").click();
  await page.waitForSelector("#category-grid");
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-4`);
  await page.waitForSelector("#grading-puzzle");
  assert.equal(await page.locator(".upload-history").count(), 0);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
});

test("mobile layout stays within viewport", async (t) => {
  const { page } = await fixture(t, { configured: false });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator("#railroad-file").isVisible(), true);
});

test("file preview loads actual scripts and asks for a private code without contacting the gateway", async (t) => {
  const context = await browser.newContext({ viewport: { width: 1152, height: 900 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage();
  let gatewayRequests = 0;
  await page.route("https://13.59.146.74/**", route => { gatewayRequests++; return route.abort(); });
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 1, identityVerified: true, puzzles: {} })), STORAGE_KEY);
  await page.goto(`${pathToFileURL(path.join(ROOT, "index.html")).href}#/puzzle/blue-4`);
  await page.waitForSelector("#grading-puzzle");
  assert.equal(await page.locator(".page").count(), 1);
  assert.equal(await page.locator(".grading-part").count(), 2);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  assert.equal(await page.locator("#grading-access-code").isVisible(), true);
  assert.equal(await page.locator(".grading-connection").isVisible(), false);
  assert.equal(gatewayRequests, 0);
  if (process.env.PUZZLE_SCREENSHOT_DIR) {
    await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "blue-02-desktop.png"), fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator("#teams-file").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "blue-02-mobile.png"), animations: "disabled" });
    await page.locator("#railroad-file").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.PUZZLE_SCREENSHOT_DIR, "blue-02-mobile-part2.png"), animations: "disabled" });
  }
});

test("blue 03 rolls the egg off left, switches to a grounded egg, glows, and reveals card 1", async (t) => {
  const { page, uploads } = await fixture(t, { configured: false });
  async function assertAnimationSpeed() {
    const rates = await page.locator(".egg-machine-stage").evaluate(stage => stage.getAnimations({ subtree: true })
      .filter(animation => animation.effect.getTiming().iterations !== Infinity)
      .map(animation => animation.playbackRate));
    assert.ok(rates.length > 0);
    assert.ok(rates.every(rate => rate === 1.5), "every phase runs 1.5× faster");
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("#back-button").click();
  await page.getByRole("button", { name: "Endless Gacha, uncommon", exact: true }).click();
  await page.waitForSelector(".egg-machine");
  assert.match(page.url(), /#\/puzzle\/blue-2$/);
  assert.equal(await page.locator(".page-header .eyebrow, .page-header .puzzle-rarity-symbol").count(), 0);
  assert.equal(await page.locator(".page-header h1").textContent(), "Endless Gacha");
  assert.equal(await page.title(), "Endless Gacha · BLUE · Puzzle 26");
  assert.equal(await page.locator(".egg-machine button, .egg-machine-controls").count(), 0);
  assert.doesNotMatch(await page.locator(".egg-machine").innerText(), /PULL THE ARM|PULL AGAIN/);
  assert.equal(await page.getByRole("button", { name: "Pull the dragon's arm", exact: true }).count(), 1);
  assert.equal(await page.locator(".egg-machine-pull").evaluate(node => node.tagName), "path");
  assert.equal((await page.locator(".egg-machine").boundingBox()).height <= page.viewportSize().height, true);
  assert.equal(await page.locator("#puzzle-answer").isEnabled(), true);
  // This also verifies the artwork works below the GitHub Pages project path.
  await page.evaluate(async () => {
    const artwork = new Image();
    artwork.src = document.querySelector("#rem-art").getAttribute("href");
    await artwork.decode();
    if (!artwork.naturalWidth) throw new Error("Missing dragon artwork");
  });
  const progressBefore = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0);
  const button = page.locator(".egg-machine-pull");
  await button.click();
  assert.equal(await button.isDisabled(), true);
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "pulling");
  await assertAnimationSpeed();
  await button.evaluate(node => node.dispatchEvent(new MouseEvent("click")));
  await page.waitForFunction(() => {
    const transform = getComputedStyle(document.querySelector(".rem-arm-motion")).transform;
    return transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)";
  });
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".rem-hatch")).opacity) > .9);
  await page.waitForFunction(() => {
    const egg = document.querySelector(".rem-egg-flight");
    const transform = new DOMMatrix(getComputedStyle(egg).transform);
    return Number(getComputedStyle(egg).opacity) === 1 && transform.e < 350;
  });
  assert.equal(await button.isDisabled(), true, "replay stays disabled while the egg rolls");
  assert.equal(await page.locator(".rem-egg-shadow").evaluate(shadow => new DOMMatrix(getComputedStyle(shadow).transform).e < 0), true);
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "grounded");
  await assertAnimationSpeed();
  assert.equal(await page.locator(".egg-machine-reveal").isVisible(), true);
  assert.equal(await page.locator(".egg-machine-scene").isVisible(), false);
  assert.equal(await page.locator(".rem-ground-egg").evaluate(egg => getComputedStyle(egg).opacity), "1");
  assert.equal(await page.locator(".egg-reveal-card .hunt-card").count(), 0);
  const stageBounds = await page.locator(".egg-machine-stage").boundingBox();
  for (const selector of [".rem-egg-flight", ".rem-egg-shadow"]) {
    const right = await page.locator(selector).evaluate(node => node.getBoundingClientRect().right);
    assert.equal(right < stageBounds.x, true, `${selector} exits completely off the left edge`);
  }
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "glowing");
  await assertAnimationSpeed();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), progressBefore);
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0);
  assert.equal(await button.isDisabled(), true);
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "revealing");
  await assertAnimationSpeed();
  assert.equal(await page.locator(".egg-reveal-card .hunt-card").getAttribute("data-card-number"), "1");
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0, "append after the reveal finishes");
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).puzzles["blue-2"].eggMachine.cardsPulled, STORAGE_KEY), 1);
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "complete");
  assert.equal(await button.isDisabled(), true, "arm stays unavailable while the revealed card is displayed");
  assert.equal(await page.locator(".rem-egg-flight").evaluate(egg => getComputedStyle(egg).opacity), "1");
  assert.equal(await page.locator(".rem-hatch").evaluate(hatch => getComputedStyle(hatch).opacity), "0");
  assert.equal(await page.locator(".card-collection .hunt-card").getAttribute("data-card-number"), "1");
  assert.equal(await page.locator('.egg-reveal-card [data-field="name"]').textContent(), await page.locator('.card-collection [data-field="name"]').textContent());
  assert.equal(uploads.length, 0);
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "idle");
  assert.equal(await button.isVisible(), true);
  assert.equal(await button.isEnabled(), true);
  assert.equal(await page.locator(".egg-machine-reveal").isVisible(), false);
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 1);
  await button.click();
  assert.equal(await button.isDisabled(), true);
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "pulling");
  // Leaving during the second pull must cancel it, with no delayed mutation.
  await page.locator("#back-button").click();
  await page.waitForSelector("#puzzle-list");
  assert.equal(await page.locator(".egg-machine").count(), 0);
  await page.getByRole("button", { name: "Endless Gacha, uncommon", exact: true }).click();
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "idle");
  assert.equal(await page.locator(".egg-machine-pull").isEnabled(), true);
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 1, "cancelled second pull consumes no card");
});

test("egg machine respects reduced motion and mobile width, leaving normal answer verification intact", async (t) => {
  const { page } = await fixture(t, { configured: false });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "complete");
  assert.equal(await page.locator(".egg-machine-pull").isDisabled(), true);
  assert.equal(await page.locator(".rem-egg-flight").evaluate(egg => getComputedStyle(egg).opacity), "1");
  const stageBounds = await page.locator(".egg-machine-stage").boundingBox();
  const cardBounds = await page.locator(".egg-reveal-card .hunt-card").boundingBox();
  assert.equal(cardBounds.x >= stageBounds.x && cardBounds.x + cardBounds.width <= stageBounds.x + stageBounds.width, true);
  assert.equal(cardBounds.y >= stageBounds.y && cardBounds.y + cardBounds.height <= stageBounds.y + stageBounds.height, true);
  assert.equal(await page.locator(".rem-egg-shadow").evaluate(shadow => getComputedStyle(shadow).opacity), "0");
  assert.equal(await page.locator(".egg-machine-scene").evaluate(scene => scene.getAnimations({ subtree: true }).length), 0);
  assert.equal(await page.locator(".egg-machine-reveal").evaluate(scene => scene.getAnimations({ subtree: true }).length), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "complete");
  await page.locator("#puzzle-answer").fill("answer");
  await page.locator("#puzzle-answer-form button").click();
  await page.waitForFunction(() => document.querySelector('.feedback[data-type="error"]')?.textContent.includes("Not quite"));
  assert.equal(await page.locator(".lede").count(), 0);
  await page.locator("#puzzle-answer").fill("  keEl!  ");
  assert.equal(await page.locator("#puzzle-answer").inputValue(), "  KEEL  ");
  await page.locator("#puzzle-answer-form button").click();
  await page.locator(".correct-attempt").waitFor();
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "idle");
  assert.match(await page.locator("#attempt-history").textContent(), /ANSWER[\s\S]*KEEL/);
  assert.deepEqual(await page.locator(".card-collection .hunt-card").evaluateAll(nodes => nodes.map(node => node.dataset.cardNumber)), ["1", "2"]);
  await page.reload();
  assert.equal(await page.locator(".lede, .feedback").count(), 0);
  assert.deepEqual(await page.locator(".card-collection .hunt-card").evaluateAll(nodes => nodes.map(node => node.dataset.cardNumber)), ["1", "2"]);
  await page.locator("#back-button").click();
  await page.waitForSelector("#puzzle-list");
  assert.equal(await page.getByRole("button", { name: "Endless Gacha, uncommon, solved", exact: true }).count(), 1);
});

test("only the arm triggers a pull, including keyboard and touch activation", async (t) => {
  const { page } = await fixture(t, { configured: false, hasTouch: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  const arm = page.getByRole("button", { name: "Pull the dragon's arm", exact: true });
  const stage = page.locator(".egg-machine-stage");
  await stage.click({ position: { x: 20, y: 20 } });
  assert.equal(await stage.getAttribute("data-phase"), "idle");
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0);
  await arm.focus();
  assert.equal(await arm.evaluate(node => node.matches(":focus-visible")), true);
  await page.keyboard.press("Enter");
  assert.equal(await stage.getAttribute("data-phase"), "complete");
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 1);
  // Even synthetic events cannot bypass the in-progress guard.
  await page.locator(".egg-machine-pull").dispatchEvent("click");
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 1);
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "idle");
  assert.equal(await arm.evaluate(node => document.activeElement === node), true);
  await arm.dispatchEvent("keydown", { key: "Enter", repeat: true });
  assert.equal(await stage.getAttribute("data-phase"), "idle", "holding a key must not auto-pull");
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.press("Space");
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 2);
  assert.equal(await page.evaluate(() => scrollY), scrollBefore);
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "idle");
  await arm.tap();
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test("leaving during the card hold cancels the return timer without losing the card", async (t) => {
  const { page } = await fixture(t, { configured: false });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  // Observe the machine's timer so cleanup is checked without a timing race.
  await page.evaluate(() => {
    const originalSet = window.setTimeout;
    const originalClear = window.clearTimeout;
    window.setTimeout = function (callback, delay, ...args) {
      const id = originalSet.call(this, callback, delay, ...args);
      if (delay === 1200) window.machineReturnTimer = id;
      return id;
    };
    window.clearTimeout = function (id) {
      if (id === window.machineReturnTimer) window.machineReturnCancelled = true;
      return originalClear.call(this, id);
    };
  });
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "complete");
  await page.locator("#back-button").click();
  await page.waitForSelector("#puzzle-list");
  assert.equal(await page.evaluate(() => window.machineReturnCancelled), true);
  await page.getByRole("button", { name: "Endless Gacha, uncommon", exact: true }).click();
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "idle");
  assert.equal(await page.locator(".card-collection .hunt-card").getAttribute("data-card-number"), "1");
});

test("first-five preview renders the fixed deck, exact highlights, and responsive layout without changing progress", async (t) => {
  const { page } = await fixture(t, { configured: false });
  const progressBefore = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await page.goto(pathToFileURL(path.join(ROOT, "previews/first-five-cards.html")).href);
  await page.waitForSelector(".card-template-preview");
  assert.equal(await page.locator(".hunt-card").count(), 5);
  const sun = page.locator('.hunt-card[data-card-number="1"]');
  const moon = page.locator('.hunt-card[data-card-number="2"]');
  const cards = await page.evaluate(() => window.PUZZLE_CARD_DECK.cards.slice(0, 5));
  for (const card of cards) {
    const node = page.locator(`.hunt-card[data-card-number="${card.id}"]`);
    for (const [field, value] of Object.entries({ name: card.name, number: String(card.number), typeLine: card.typeLine, stats: `${card.power}/${card.toughness}`, serial: card.serial })) {
      assert.equal(await node.locator(`[data-field="${field}"]`).textContent(), value);
    }
    assert.equal(await node.locator('[data-field="artShape"] rect').count(), 5);
    assert.deepEqual((await node.locator('[data-highlighted="true"]').evaluateAll(nodes => nodes.map(node => node.dataset.property))).sort(), [...card.redFields].sort());
  }
  assert.notEqual(await sun.locator('[data-field="celestial"]').innerHTML(), await moon.locator('[data-field="celestial"]').innerHTML());
  assert.match(await moon.locator("desc").textContent(), /Moon; number 7; glider art; triangle rarity/);
  assert.equal(await page.locator(".hunt-card [id]").evaluateAll(nodes => new Set(nodes.map(node => node.id)).size === nodes.length), true);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  // Resize/media-query changes are asynchronous; check both bounds together
  // after the browser has switched to the mobile layout.
  await page.waitForFunction(() => {
    const [first, second] = [...document.querySelectorAll(".hunt-card")].map(card => card.getBoundingClientRect());
    return second.top >= first.bottom;
  });
  const original = await page.evaluate(() => JSON.stringify(window.PUZZLE_CARD_DECK.cards));
  await page.reload();
  await page.waitForSelector(".card-template-preview");
  assert.equal(await page.evaluate(() => JSON.stringify(window.PUZZLE_CARD_DECK.cards)), original);
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), progressBefore);
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0);
});

test("each pull appends the next fixed card and survives reload", async (t) => {
  const { page } = await fixture(t, { configured: false });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  assert.doesNotMatch(await page.locator("#app").innerText(), /Pull an egg to hatch your first card\.|Pull the arm to release an egg\./);
  assert.equal(await page.locator(".card-collection-empty, .page-header .lede").count(), 0);
  assert.equal((await page.locator(".card-collection").innerText()).trim(), "");
  assert.equal(await page.locator(".card-collection header, .card-collection-count").count(), 0);
  for (let id = 1; id <= 5; id++) {
    await page.locator(".egg-machine-pull").click();
    assert.equal(await page.locator(".card-collection .hunt-card").count(), id);
    assert.equal(await page.locator(".egg-reveal-card .hunt-card").getAttribute("data-card-number"), String(id));
  }
  const names = await page.locator('.card-collection [data-field="name"]').allTextContents();
  assert.deepEqual(names, await page.evaluate(() => PUZZLE_CARD_DECK.cards.slice(0, 5).map(card => card.name)));
  assert.doesNotMatch(await page.locator(".card-collection").innerText(), /Your cards|cards? pulled|In pull order/i);
  assert.equal(await page.locator(".egg-reveal-caption, .card-collection .card-preview-number").count(), 0);
  assert.doesNotMatch(await page.locator(".egg-machine-reveal").innerText(), /\bCARD\s+0[1-5]\b/i);
  assert.doesNotMatch(await page.locator(".card-collection").innerText(), /\bCARD\s+0[1-5]\b/i);
  await page.reload();
  assert.deepEqual(await page.locator('.card-collection [data-field="name"]').allTextContents(), names);
  assert.doesNotMatch(await page.locator("#app").innerText(), /Pull an egg to hatch your first card\.|Pull the arm to release an egg\./);
  assert.equal(await page.locator(".card-collection header, .card-collection-count").count(), 0);
  assert.equal(await page.locator(".card-collection figcaption").count(), 0);
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "idle");
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".egg-reveal-card .hunt-card").getAttribute("data-card-number"), "6");
  assert.deepEqual(await page.locator(".card-collection .hunt-card").evaluateAll(nodes => nodes.map(node => node.dataset.cardNumber)), ["1", "2", "3", "4", "5", "6"]);
});

async function finishAnimations(page, selector) {
  await page.locator(selector).evaluate(node => {
    for (const animation of node.getAnimations()) {
      if (animation.effect.getTiming().iterations !== Infinity) animation.finish();
    }
  });
}

test("leaving during glow consumes nothing; reloading during card appearance retains the awarded card", async (t) => {
  const { page } = await fixture(t, { configured: false });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  async function reachGlow() {
    await page.locator(".egg-machine-pull").click();
    await finishAnimations(page, ".rem-egg-flight");
    await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "grounded");
    await finishAnimations(page, ".rem-ground-egg");
    await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "glowing");
  }
  await reachGlow();
  await page.locator("#back-button").click();
  await page.getByRole("button", { name: "Endless Gacha, uncommon", exact: true }).click();
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0);
  await reachGlow();
  await finishAnimations(page, ".rem-reveal-glow");
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "revealing");
  await page.reload();
  assert.equal(await page.locator(".card-collection .hunt-card").getAttribute("data-card-number"), "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".egg-reveal-card .hunt-card").getAttribute("data-card-number"), "2");
});

test("card 100 is awarded once, exhausted pulls show the exact error, and reset starts at the same card 1", async (t) => {
  const { page } = await fixture(t, { configured: false, progress: { version: 1, identityVerified: true, puzzles: { "blue-2": { eggMachine: { cardsPulled: 99 } } } } });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 100);
  assert.equal(await page.locator(".egg-reveal-card .hunt-card").getAttribute("data-card-number"), "100");
  for (let repeat = 0; repeat < 2; repeat++) {
    await page.locator(".egg-machine-pull").click();
    assert.equal(await page.locator(".egg-machine-feedback").textContent(), "Out of eggs!");
    assert.equal(await page.locator(".card-collection .hunt-card").count(), 100);
  }
  await page.reload();
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".egg-machine-feedback").textContent(), "Out of eggs!");
  await page.locator("#help-button").click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#clear-state").click();
  await page.waitForSelector("#identity-form");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null);
  await page.locator("#identity-answer").fill("BUM");
  await page.locator("#identity-form button").click();
  await page.waitForSelector("#category-grid");
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0);
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator('.egg-reveal-card [data-field="name"]').textContent(), await page.evaluate(() => PUZZLE_CARD_DECK.cards[0].name));
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 1);
});

test("failed local save does not award or consume a card, and retry succeeds", async (t) => {
  const { page } = await fixture(t, { configured: false });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  await page.evaluate(key => {
    window.originalStorageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Storage full", "QuotaExceededError");
      return window.originalStorageSet.call(this, name, value);
    };
  }, STORAGE_KEY);
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".egg-machine-stage").getAttribute("data-phase"), "error");
  assert.match(await page.locator(".egg-machine-feedback").textContent(), /no card was used/);
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0);
  assert.equal(await page.locator(".egg-reveal-card .hunt-card").count(), 0);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageSet; });
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".card-collection .hunt-card").getAttribute("data-card-number"), "1");
});

test("clearing progress during the glow cancels the pending reveal and leaves a clean deck", async (t) => {
  const { page } = await fixture(t, { configured: false });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  await page.locator(".egg-machine-pull").click();
  await finishAnimations(page, ".rem-egg-flight");
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "grounded");
  await finishAnimations(page, ".rem-ground-egg");
  await page.waitForFunction(() => document.querySelector(".egg-machine-stage").dataset.phase === "glowing");
  await page.locator("#help-button").click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#clear-state").click();
  await page.waitForSelector("#identity-form");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null);
  assert.equal(await page.locator(".egg-machine").count(), 0);
  await page.locator("#identity-answer").fill("BUM");
  await page.locator("#identity-form button").click();
  await page.waitForSelector("#category-grid");
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  assert.equal(await page.locator(".card-collection .hunt-card").count(), 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".egg-machine-pull").click();
  assert.equal(await page.locator(".card-collection .hunt-card").getAttribute("data-card-number"), "1");
});

test("all 100 rendered cards use red only on the assigned properties, with readable title parts", async (t) => {
  const { page } = await fixture(t, { configured: false });
  const issues = await page.evaluate(() => {
    const root = document.createElement("div");
    document.body.append(root);
    const issues = [];
    for (const card of window.PUZZLE_CARD_DECK.cards) {
      const node = window.HuntCards.createCard(card);
      root.append(node);
      const actual = [...node.querySelectorAll('[data-highlighted="true"]')].map(field => field.dataset.property).sort();
      if (JSON.stringify(actual) !== JSON.stringify([...card.redFields].sort())) issues.push(`card ${card.id}: highlights`);
      for (const field of node.querySelectorAll("[data-property]")) {
        const key = field.dataset.property;
        const expected = card.redFields.includes(key) ? (key === "serial" ? "rgb(255, 64, 64)" : "rgb(191, 20, 36)") : (key === "serial" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");
        if (getComputedStyle(field).fill !== expected) issues.push(`card ${card.id}: ${key} color`);
        if (["title.A", "title.O", "title.V", "title.S", "types.0", "types.1", "rarity", "serial"].includes(key)) {
          const normalInk = key === "serial" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
          if (getComputedStyle(field).fill !== normalInk || field.hasAttribute("data-highlighted")) issues.push(`card ${card.id}: random property ${key} must not be red`);
        }
      }
      for (const line of node.querySelectorAll('[data-field="name"] > tspan')) {
        if (line.getBBox().width > 209) issues.push(`card ${card.id}: title overflow`);
      }
      if (node.querySelector('[data-field="typeLine"]').getBBox().width > 257) issues.push(`card ${card.id}: type overflow`);
    }
    root.remove();
    return issues;
  });
  assert.deepEqual(issues, []);
});

test("four layered rarity emblems fit the frame and every mark inherits black or red ink", async (t) => {
  const { page } = await fixture(t, { configured: false });
  const result = await page.evaluate(() => {
    const root = document.createElement("div");
    document.body.append(root);
    const issues = [];
    const designs = [];
    for (const rarity of ["circle", "triangle", "diamond", "star"]) {
      for (const red of [false, true]) {
        const card = window.HuntCards.createCard({ rarity, redFields: red ? ["rarity"] : [] });
        root.append(card);
        const emblem = card.querySelector('[data-field="rarity"]');
        const expected = red ? "rgb(191, 20, 36)" : "rgb(0, 0, 0)";
        for (const mark of emblem.querySelectorAll("path, circle")) {
          const style = getComputedStyle(mark);
          if (!["none", expected].includes(style.fill) || !["none", expected].includes(style.stroke)) issues.push(`${rarity}: incorrect ink`);
          if (style.fill === "none" && style.stroke === "none") issues.push(`${rarity}: invisible mark`);
        }
        const box = emblem.getBBox();
        if (box.x < -15 || box.y < -15 || box.x + box.width > 15 || box.y + box.height > 15) issues.push(`${rarity}: out of bounds`);
        if (!red) designs.push(emblem.innerHTML);
      }
    }
    const diamond = root.querySelector('[data-rarity="diamond"] [data-field="rarity"] path');
    if (diamond.getAttribute("d").match(/M/g).length !== 2) issues.push("diamond: expected two nested outlines");
    root.remove();
    return { issues, distinct: new Set(designs).size };
  });
  assert.deepEqual(result, { issues: [], distinct: 4 });
  await page.goto(pathToFileURL(path.join(ROOT, "previews/rarity-symbols.html")).href);
  assert.equal(await page.locator(".symbol-large").count(), 4);
  assert.equal(await page.locator(".symbol-small").count(), 4);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test("card data can change independently of the template without interpreting text as HTML", async (t) => {
  const { page } = await fixture(t, { configured: false });
  await page.goto(`${origin}/puzzle-26/index.html#/puzzle/blue-2`);
  // An empty collection has no visible text or height until a card is added.
  await page.waitForSelector(".card-template-preview", { state: "attached" });
  await page.evaluate(() => {
    document.querySelector(".card-template-grid").replaceChildren(window.HuntCards.createCard({
      celestial: "moon", name: 'A Very Long Name <img src=x onerror="alert(1)">', number: 27,
      power: 12, toughness: 34, typeLine: "Placeholder — A longer type line", serial: "000042", rarity: "placeholder",
    }));
  });
  const card = page.locator(".hunt-card");
  assert.match(await card.locator('[data-field="name"]').textContent(), /<img src=x/);
  assert.equal(await card.locator("img").count(), 0);
  assert.equal(await card.locator('[data-field="number"]').textContent(), "27");
  assert.equal(await card.locator('[data-field="stats"]').textContent(), "12/34");
  assert.equal(await card.locator('[data-field="serial"]').textContent(), "000042");
  assert.equal(await card.locator('[data-field="name"]').getAttribute("textLength"), "208");
  assert.equal(await card.locator('[data-field="name"]').evaluate(node => node.getBBox().width <= 209), true);
  assert.equal(await page.evaluate(() => window.HuntCards.TEMPLATE_CARD.name), "Lorem Ipsum");
  const rejected = await page.evaluate(() => {
    return [{ celestial: "unknown" }, { artShape: "not-yet-defined" }, { power: NaN }].map(data => {
      try { window.HuntCards.createCard(data); return false; }
      catch (error) { return error instanceof TypeError; }
    });
  });
  assert.deepEqual(rejected, [true, true, true]);
});
