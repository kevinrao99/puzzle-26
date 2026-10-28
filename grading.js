"use strict";

window.PuzzleGrading = (() => {
  const SESSION_KEY = "puzzle-26:v1:grader-session";
  const PENDING = new Set(["queued", "compiling", "running", "scoring"]);
  const TERMINAL = new Set(["complete", "compile_error", "failed"]);
  const LABELS = {
    uploading: "Uploading…",
    queued: "Queued for grading…",
    compiling: "Compiling…",
    running: "Running tests…",
    scoring: "Calculating score…",
    compile_error: "Compilation failed.",
    failed: "Grading failed.",
    interrupted: "Upload interrupted before confirmation. Submit the file again to retry.",
  };

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Memory-only fallback. */ }
  }

  function hasFullScore(history) {
    return Array.isArray(history) && history.some((attempt) =>
      attempt?.status === "complete" && attempt.score === 100 && attempt.maximumScore === 100);
  }

  function normalizeAttempts(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
        filename: typeof item.filename === "string" ? item.filename.slice(0, 255) : "Submission",
        submittedAt: typeof item.submittedAt === "string" ? item.submittedAt : "",
        jobId: typeof item.jobId === "string" ? item.jobId : null,
        status: item.status === "uploading" ? "interrupted"
          : PENDING.has(item.status) || TERMINAL.has(item.status) ? item.status : "interrupted",
        score: Number.isFinite(item.score) ? item.score : null,
        maximumScore: item.maximumScore === 100 ? 100 : null,
        compileOutput: typeof item.compileOutput === "string" ? item.compileOutput.slice(0, 8192) : "",
        message: typeof item.message === "string" ? item.message.slice(0, 500) : "",
      }));
  }

  function createController({ config, parts, initialAttempts, onChange }) {
    let baseUrl = "";
    let configurationError = "";
    if (config.baseUrl) {
      try {
        const url = new URL(config.baseUrl);
        const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) {
          throw new Error("Invalid grading server address.");
        }
        baseUrl = url.href.replace(/\/$/, "");
      } catch {
        configurationError = "The grading connection is unavailable. Please contact the hunt organizer.";
      }
    }

    const attempts = Object.fromEntries(parts.map((part) => [part.id, normalizeAttempts(initialAttempts?.[part.id])]));
    const listeners = new Set();
    const polling = new Set();
    const pollErrors = new Map();
    const lifetime = new AbortController();
    let destroyed = false;
    let session = null;
    let authBusy = false;
    let authMessage = "";
    let restoredSession = false;

    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (saved?.baseUrl === baseUrl && validSession(saved)) session = saved;
      else clearSession();
    } catch { clearSession(); }

    function validSession(value) {
      return typeof value?.token === "string" && value.token.length > 0 && value.token.length <= 4096
        && !/[\r\n]/.test(value.token) && Date.parse(value.expiresAt) > Date.now();
    }

    function connected() {
      if (session && !validSession(session)) {
        session = null;
        clearSession();
        authMessage = "Your grading session expired. Enter your access code again.";
      }
      return Boolean(session);
    }

    function notify(save = false) {
      if (destroyed) return;
      if (save) onChange(JSON.parse(JSON.stringify(attempts)));
      for (const listener of listeners) listener();
    }

    async function request(path, { method = "GET", body, authenticated = true } = {}) {
      if (!baseUrl) throw new Error("The grading server has not been connected yet.");
      if (authenticated && !connected()) throw new Error("Enter your grading access code to continue.");
      const controller = new AbortController();
      const abort = () => controller.abort();
      lifetime.signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, config.requestTimeoutMs);
      try {
        const headers = { Accept: "application/json" };
        if (authenticated) headers.Authorization = `Bearer ${session.token}`;
        if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
        const response = await fetch(`${baseUrl}${path}`, {
          method, headers,
          body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
          credentials: "omit", cache: "no-store", redirect: "error",
          referrerPolicy: "no-referrer", signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          if (authenticated) {
            session = null;
            clearSession();
            authMessage = "Your grading session expired or was rejected. Connect again to continue.";
            notify();
          }
          throw new Error(authenticated ? authMessage : "The grading access code was not accepted.");
        }
        if (response.status === 413) throw new Error("This file exceeds the server’s upload limit.");
        if (response.status === 429) throw new Error("The grader is busy. Please wait before trying again.");
        if (!response.ok) throw new Error(`The grading server could not complete the request (${response.status}).`);
        const data = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid grading response.");
        return data;
      } catch (error) {
        if (error.name === "AbortError") throw new Error("The grading request timed out. Please try checking its status again.");
        if (error instanceof TypeError) throw new Error("Could not reach the grading server. Check your connection and try again.");
        if (error instanceof SyntaxError) throw new Error("The grading server returned an unreadable response.");
        throw error;
      } finally {
        clearTimeout(timeout);
        lifetime.signal.removeEventListener("abort", abort);
      }
    }

    function waitForPoll() {
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          lifetime.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, config.pollIntervalMs);
        lifetime.signal.addEventListener("abort", done, { once: true });
      });
    }

    async function poll(attempt) {
      if (destroyed || !connected() || !attempt.jobId || !PENDING.has(attempt.status) || polling.has(attempt.id)) return;
      polling.add(attempt.id);
      pollErrors.delete(attempt.id);
      notify();
      const deadline = Date.now() + config.pollTimeoutMs;
      try {
        while (!destroyed && connected() && PENDING.has(attempt.status)) {
          const data = await request(`/submissions/${encodeURIComponent(attempt.jobId)}`);
          if (destroyed) return;
          if (data.jobId !== attempt.jobId || (!PENDING.has(data.status) && !TERMINAL.has(data.status))) {
            throw new Error("The grader returned an unexpected job response. Check its status again.");
          }
          if (data.status === "complete" &&
              (!Number.isFinite(data.score) || data.score < 0 || data.score > 100 || data.maximumScore !== 100)) {
            throw new Error("The grader did not return a valid score out of 100. Check its status again.");
          }
          attempt.status = data.status;
          attempt.score = data.status === "complete" ? data.score : null;
          attempt.maximumScore = data.status === "complete" ? data.maximumScore : null;
          attempt.compileOutput = typeof data.compileOutput === "string" ? data.compileOutput.slice(0, 8192) : "";
          attempt.message = typeof data.message === "string" ? data.message.slice(0, 500) : "";
          notify(true);
          if (!PENDING.has(attempt.status)) return;
          if (Date.now() >= deadline) throw new Error("Grading is taking longer than expected. Check its status again later.");
          await waitForPoll();
        }
      } catch (error) {
        if (!destroyed) pollErrors.set(attempt.id, error.message);
      } finally {
        polling.delete(attempt.id);
        notify();
      }
    }

    function resumeJobs() {
      for (const history of Object.values(attempts)) {
        for (const attempt of history) {
          if (PENDING.has(attempt.status)) void poll(attempt);
        }
      }
    }

    async function restoreHistory() {
      if (!config.recoverHistory) return;
      const data = await request('/history');
      if (!Array.isArray(data.submissions) || data.submissions.length > 102) throw new Error('The grader returned invalid submission history.');
      const restored = {};
      for (const part of parts) {
        const rows = data.submissions.filter(item => item.task === part.taskId);
        if (rows.some(item => typeof item.jobId !== 'string' || !item.jobId ||
            (!PENDING.has(item.status) && !TERMINAL.has(item.status)) ||
            (item.status === 'complete' && (!Number.isFinite(item.score) || item.score < 0 || item.score > 100 || item.maximumScore !== 100)))) {
          throw new Error('The grader returned invalid submission history.');
        }
        restored[part.id] = normalizeAttempts(rows.map(item => ({ ...item, id: item.jobId })));
      }
      Object.assign(attempts, restored);
      restoredSession = true;
      notify(true);
    }

    async function login(accessCode) {
      authBusy = true;
      authMessage = "Connecting…";
      notify();
      try {
        const data = await request("/login", { method: "POST", body: { accessCode }, authenticated: false });
        if (destroyed) return;
        if (!validSession(data)) throw new Error("The grader did not return a valid session. Please contact the hunt organizer.");
        session = { baseUrl, token: data.token, expiresAt: data.expiresAt };
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* Keep session in memory. */ }
        await restoreHistory();
        authMessage = "";
        resumeJobs();
      } catch (error) {
        if (!destroyed) { session = null; clearSession(); authMessage = error.message; }
      } finally {
        authBusy = false;
        notify();
      }
    }

    function validateFile(file) {
      if (!file) throw new Error("Choose a C++ (.cpp) file first.");
      if (!/\.cpp$/i.test(file.name)) throw new Error("Choose a file with the .cpp extension.");
      if (file.size === 0) throw new Error("The selected file is empty.");
      if (file.size > config.maxFileBytes) throw new Error(`Choose a file no larger than ${Math.floor(config.maxFileBytes / 1024)} KB.`);
    }

    async function submit(part, file) {
      if (authBusy) throw new Error("Wait for grading sign-in to finish.");
      if (hasFullScore(attempts[part.id])) throw new Error("This part already has a full score.");
      validateFile(file);
      let source;
      try { source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error("The file must contain UTF-8 text."); }
      if (source.includes("\0")) throw new Error("The file appears to contain binary data. Choose a C++ source file.");
      if (!source.trim()) throw new Error("The selected file contains no source code.");
      if (destroyed) return;
      if (hasFullScore(attempts[part.id])) return;
      if (!connected()) throw new Error("Enter your grading access code to continue.");
      const attempt = {
        id: crypto.randomUUID(), filename: file.name, submittedAt: new Date().toISOString(),
        jobId: null, status: "uploading", score: null, maximumScore: null, compileOutput: "", message: "",
      };
      attempts[part.id].push(attempt);
      notify(true);
      const form = new FormData();
      form.append("task", part.taskId);
      form.append("source", file, file.name);
      try {
        const data = await request("/submissions", { method: "POST", body: form });
        if (destroyed) return;
        if (typeof data.jobId !== "string" || !data.jobId || data.jobId.length > 200 || data.status !== "queued") {
          throw new Error("The grader did not confirm the upload with a job ID.");
        }
        attempt.jobId = data.jobId;
        attempt.status = "queued";
        notify(true);
        void poll(attempt);
      } catch (error) {
        if (destroyed) return;
        attempt.status = "interrupted";
        attempt.message = `${error.message} Receipt was not confirmed; this file has not been automatically resubmitted.`;
        notify(true);
      }
    }

    function describeAttempt(attempt) {
      if (attempt.status === "complete") return `Score: ${attempt.score} / ${attempt.maximumScore}`;
      return LABELS[attempt.status] || "Awaiting a result.";
    }

    function renderHistory(container, history) {
      container.replaceChildren();
      if (!history.length) {
        const empty = document.createElement("p");
        empty.className = "empty-attempts";
        empty.textContent = "No previous submissions.";
        container.append(empty);
        return;
      }
      const list = document.createElement("ul");
      list.className = "attempt-list upload-history";
      for (const attempt of history) {
        const item = document.createElement("li");
        const result = document.createElement("p");
        result.textContent = `${attempt.filename} — ${describeAttempt(attempt)}`;
        item.append(result);
        if (attempt.message) {
          const message = document.createElement("p");
          message.className = "submission-detail";
          message.textContent = attempt.message;
          item.append(message);
        }
        if (attempt.compileOutput) {
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = "Compiler output";
          const output = document.createElement("pre");
          output.textContent = attempt.compileOutput;
          details.append(summary, output);
          item.append(details);
        }
        list.append(item);
      }
      container.append(list);
    }

    function mount(root) {
      root.innerHTML = `
        <section class="panel grading-access" aria-label="Grading access">
          <p class="grading-connection" role="status"></p>
          <form class="grading-login-form">
            <label for="grading-access-code">ACCESS CODE</label>
            <div class="answer-row">
              <input class="grading-code-input" id="grading-access-code" type="password"
                autocomplete="off" spellcheck="false" required />
              <button class="primary-button" type="submit">CONNECT</button>
            </div>
          </form>
        </section>
        <div class="grading-parts"></div>`;
      const connection = root.querySelector(".grading-connection");
      const loginForm = root.querySelector(".grading-login-form");
      const codeInput = root.querySelector("#grading-access-code");
      const loginButton = loginForm.querySelector("button");
      const partViews = parts.map((part) => {
        const section = document.createElement("section");
        section.className = "panel grading-part";
        section.setAttribute("aria-label", part.title);
        section.innerHTML = `
          <form class="upload-form">
            <input class="source-file" id="${part.id}-file" type="file" accept=".cpp" required />
            <button class="primary-button" type="submit" aria-label="Submit code">→</button>
            <p class="feedback upload-feedback" role="status" aria-live="polite"></p>
            <button class="secondary-button check-status" type="button" hidden>CHECK STATUS</button>
          </form>
          <section class="attempts-panel" aria-labelledby="${part.id}-attempts-heading">
            <h3 id="${part.id}-attempts-heading">PREVIOUS SUBMISSIONS</h3>
            <div class="submission-history"></div>
          </section>`;
        section.querySelector(".source-file").setAttribute("aria-label", `${part.title} C++ source file`);
        root.querySelector(".grading-parts").append(section);
        const form = section.querySelector("form");
        const input = section.querySelector("input");
        const button = form.querySelector('button[type="submit"]');
        const feedback = section.querySelector(".upload-feedback");
        const retry = section.querySelector(".check-status");
        const history = section.querySelector(".submission-history");
        let error = "";
        let submitting = false;
        let historyKey = "";
        function update() {
          const list = attempts[part.id];
          const last = list.at(-1);
          const passed = hasFullScore(list);
          const pending = list.some((attempt) => attempt.status === "uploading" || PENDING.has(attempt.status));
          input.disabled = passed || submitting || pending;
          button.disabled = passed || !baseUrl || !connected() || authBusy || !input.files.length || submitting || pending || Boolean(error);
          button.textContent = passed ? "FULL SCORE" : submitting || last?.status === "uploading" ? "UPLOADING…" : "→";
          button.setAttribute("aria-label", button.textContent === "→" ? `Submit ${part.title} code` : button.textContent);
          const pollingError = last && pollErrors.get(last.id);
          feedback.textContent = passed ? "100 / 100 — This part is complete." : error || pollingError || (last ? describeAttempt(last) : "");
          feedback.dataset.type = error || pollingError || ["compile_error", "failed", "interrupted"].includes(last?.status)
            ? "error" : passed ? "success" : "";
          section.classList.toggle("part-complete", passed);
          retry.hidden = !list.some((attempt) => PENDING.has(attempt.status) && !polling.has(attempt.id));
          retry.disabled = !connected();
          const key = JSON.stringify(list);
          if (key !== historyKey) { renderHistory(history, list); historyKey = key; }
        }
        input.addEventListener("change", () => {
          error = "";
          if (input.files.length) {
            try { validateFile(input.files[0]); } catch (failure) { error = failure.message; }
          }
          update();
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (submitting || hasFullScore(attempts[part.id]) || attempts[part.id].some((attempt) => attempt.status === "uploading" || PENDING.has(attempt.status))) return;
          submitting = true;
          error = "";
          update();
          try { await submit(part, input.files[0]); }
          catch (failure) { error = failure.message; }
          finally { submitting = false; update(); }
        });
        retry.addEventListener("click", resumeJobs);
        return { update };
      });

      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (authBusy || !codeInput.value) return;
        const code = codeInput.value;
        codeInput.value = "";
        await login(code);
      });
      function update() {
        const authenticated = connected();
        root.querySelector(".grading-access").hidden = parts.every((part) => hasFullScore(attempts[part.id]));
        connection.textContent = configurationError || (!baseUrl
          ? "Grading will be available here once the server is connected."
          : authMessage || (authenticated ? "Connected to the grading server." : ""));
        connection.hidden = !connection.textContent;
        loginForm.hidden = !baseUrl || authenticated;
        loginButton.disabled = authBusy;
        loginButton.textContent = authBusy ? "CONNECTING…" : "CONNECT";
        codeInput.disabled = authBusy;
        for (const view of partViews) view.update();
      }
      listeners.add(update);
      update();
      if (config.recoverHistory && connected() && !restoredSession) {
        authBusy = true;
        notify();
        void restoreHistory().then(resumeJobs).catch(error => {
          session = null; clearSession(); authMessage = error.message;
        }).finally(() => { authBusy = false; notify(); });
      } else resumeJobs();
      return () => listeners.delete(update);
    }

    return {
      mount,
      destroy() { destroyed = true; lifetime.abort(); listeners.clear(); session = null; },
    };
  }

  return Object.freeze({ createController, clearSession, hasFullScore });
})();
