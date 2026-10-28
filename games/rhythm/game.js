(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  // Presentation only: both pages use the same chart, clock, controls and judging.
  const wordless = document.body.dataset.presentation === "wordless";
  const overlayIcons = { "LET’S PLAY": "▶", "TRY IT OUT": "▶", GO: "▶", STOPPED: "■", FAILED: "💀", COMPLETE: "", "NO AUDIO": "!" };
  const engine = window.RhythmEngine;
  const hitWindowMs = Math.round(engine.HIT_WINDOW * 1000);
  const original = window.ANIMALS_CHART;
  const audio = $("audio"), canvas = $("highway"), ctx = canvas.getContext("2d");
  const playbackVolume = .7, fadeSeconds = 5;
  audio.volume = playbackVolume;
  const symbols = { left: "←", down: "↓", up: "↑", right: "→" };
  const colors = ["#dafa8c", "#8ce4d3", "#b5b3ff", "#ffb29c"];
  // Left / down / up / right: two long, three long, two short, three short.
  const targetClues = [{ count: 2, length: 24 }, { count: 3, length: 24 }, { count: 2, length: 12 }, { count: 3, length: 12 }];
  const keyMap = { ArrowLeft: "left", ArrowDown: "down", ArrowUp: "up", ArrowRight: "right" };
  // Keep edits scoped to their default chart. Earlier drafts remain stored, but cannot
  // silently override a newly selected timing take after a reload.
  const storageKey = "rhythm-lab:animals:chart:v1:" + original.audioSha256 + (original.revision ? ":" + original.revision : "");
  let notes = engine.validateNotes(original.notes, original.duration);
  let mode = "ready", run = engine.createRun(notes);
  let countdownEnd = 0, playToken = 0, judgmentUntil = 0;
  let width = 480, height = 500, ready = false;
  const pressed = new Set(), flashes = new Map();
  let savedMessage = "";
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      notes = engine.validateNotes(JSON.parse(saved).notes, original.duration);
      run = engine.createRun(notes);
      savedMessage = " Your saved chart edits are loaded.";
    }
  } catch { savedMessage = " Saved chart could not be read; using the original."; }

  function timeLabel(time) {
    time = Math.max(0, time);
    return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
  }

  function songTime() {
    if (mode === "countdown") return -Math.max(0, countdownEnd - performance.now()) / 1000;
    if (mode === "ready" || mode === "stopped") return -3;
    return audio.currentTime;
  }

  function gameEndTime() {
    return Math.min(notes[notes.length - 1].time + fadeSeconds, audio.duration || original.duration);
  }

  function finishGame() {
    if (mode !== "playing") return;
    engine.expire(run, Infinity);
    if (run.failed) { showMistake(); return; }
    playToken++;
    audio.pause();
    audio.volume = 0;
    audio.currentTime = gameEndTime();
    updateMistakeCount();
    mode = "ended"; updateControls();
    pressed.clear();
    $("judgment").classList.remove("show");
    const total = `${run.mistakes} mistake${run.mistakes === 1 ? "" : "s"}`;
    setOverlay("TRACK COMPLETE", "COMPLETE", `${total}. Restart to try again.`);
    $("status").textContent = `Track complete: ${total}. Restart for another attempt.`;
  }

  function updatePlayback(time) {
    if (mode !== "playing") return;
    if (engine.expire(run, time)) showMistake();
    if (mode !== "playing") return;
    // Tie the fade to the audio clock and the final target timestamp, not the
    // player's early/late hit or elapsed animation frames.
    const fadeProgress = Math.max(0, Math.min(1, (time - notes[notes.length - 1].time) / fadeSeconds));
    audio.volume = playbackVolume * (1 - fadeProgress);
    if (time >= gameEndTime()) finishGame();
  }

  function setOverlay(kicker, main, detail, countdown = false) {
    $("overlay").hidden = false;
    $("overlay").classList.toggle("countdown", countdown);
    $("overlay-kicker").textContent = kicker;
    $("overlay-main").textContent = wordless ? (overlayIcons[main] || "") : main;
    if (wordless) $("overlay-main").setAttribute("aria-label", main);
    if (countdown && /^\d+$/.test(main)) setCountdown(Number(main));
    $("overlay-detail").textContent = detail;
  }

  function setCountdown(seconds) {
    $("overlay-main").textContent = wordless ? Array(seconds).fill("●").join(" ") : String(seconds);
    if (wordless) $("overlay-main").setAttribute("aria-label", `${seconds} seconds`);
  }

  function updateControls() {
    $("start").disabled = !ready;
    $("start").textContent = wordless ? (mode === "ready" ? "▶" : "↻") : (mode === "ready" ? "Play song  ↗" : "Restart  ↻");
    if (wordless) $("start").setAttribute("aria-label", mode === "ready" ? "Start from the beginning" : "Restart from the beginning");
    $("stop").disabled = !["playing", "countdown", "starting", "listening"].includes(mode);
    if ($("listen")) $("listen").disabled = !ready;
  }

  function updateChartInfo() {
    if ($("note-count")) $("note-count").textContent = `${notes.length} NOTES / ${original.timingStatus === "recorded" ? "RECORDED CHART" : "DRAFT CHART"}`;
    updateMistakeCount();
  }

  function updateMistakeCount() {
    const markers = $("mistakes");
    markers.dataset.count = String(run.mistakes);
    markers.setAttribute("aria-label", `${run.mistakes} of ${engine.FAIL_AT_MISTAKES} mistakes. The fourth mistake ends the run.`);
    markers.querySelectorAll(".mistake-mark").forEach((marker, index) => marker.classList.toggle("used", index < run.mistakes));
  }

  function showJudgment(hit) {
    const milliseconds = Math.round(Math.abs(hit.offsetMs));
    $("judgment-note").textContent = `NOTE ${String(hit.noteIndex + 1).padStart(3, "0")}`;
    $("judgment-timing").textContent = milliseconds === 0 ? "0 ms · on time" : `${milliseconds} ms ${hit.offsetMs < 0 ? "early" : "late"}`;
    $("judgment").style.color = "#ddfb8b";
    $("judgment").classList.add("show");
    // The meter extends one-third beyond the tolerance ticks on each side.
    const meterRangeMs = hitWindowMs * 4 / 3;
    const position = Math.max(0, Math.min(100, 50 + hit.offsetMs / meterRangeMs * 50));
    const marker = $("timing-marker");
    marker.style.left = `${position}%`;
    marker.getAnimations().forEach(animation => animation.cancel());
    marker.animate([{ opacity: 1 }, { opacity: 1, offset: .65 }, { opacity: 0 }], { duration: 480, easing: "ease-out" });
    $("timing-meter").setAttribute("aria-label", `${$("judgment-note").textContent}: ${$("judgment-timing").textContent}. Early is left, exact timing is center, late is right. Tolerance is plus or minus ${hitWindowMs} milliseconds.`);
    judgmentUntil = performance.now() + 480;
  }

  function beginCountdown() {
    playToken++;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = playbackVolume;
    run = engine.createRun(notes);
    updateChartInfo();
    mode = "countdown";
    countdownEnd = performance.now() + 3000;
    pressed.clear();
    flashes.clear();
    $("judgment").classList.remove("show");
    if ($("workshop")) $("workshop").open = false;
    $("status").textContent = "Get ready. The song starts after 3, 2, 1.";
    setOverlay("GET READY", "3", "←   ↓   ↑   →", true);
    updateControls();
    $("stage").focus({ preventScroll: true });
  }

  async function startAudio() {
    mode = "starting";
    const token = playToken;
    setOverlay("GET READY", "GO", "", true);
    try {
      await audio.play();
      if (token !== playToken) return;
      mode = "playing";
      $("overlay").hidden = true;
      $("status").textContent = `Hit each note within ±${hitWindowMs} ms. The fourth mistake ends the run. Escape to stop.`;
    } catch {
      if (token !== playToken) return;
      stopGame("Playback was blocked. Click Restart to try again from the beginning.");
      setOverlay("AUDIO NEEDS A CLICK", "STOPPED", "Click Restart to try playback again.");
    }
    updateControls();
  }

  function stopGame(reason = "Stopped. Restart plays from the beginning with a new countdown.") {
    if (!["playing", "countdown", "starting", "listening"].includes(mode)) return;
    playToken++;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = playbackVolume;
    mode = "stopped";
    pressed.clear();
    $("judgment").classList.remove("show");
    setOverlay("RUN ENDED", "STOPPED", "Restart from the beginning.");
    $("status").textContent = reason;
    updateControls();
  }

  function showMistake() {
    updateMistakeCount();
    let reason;
    if (run.lastMistake.type === "invalid-press") {
      const direction = run.lastMistake.direction;
      reason = `Unexpected ${symbols[direction]} press: no unhit matching note within ±${hitWindowMs} ms.`;
    } else {
      const number = String(run.lastMistake.noteIndex + 1).padStart(3, "0");
      reason = `Missed note ${number}: not hit within ±${hitWindowMs} ms.`;
    }
    if (run.failed) {
      // Cancel pending countdown/playback as well as an already playing song.
      playToken++;
      audio.pause();
      mode = "failed";
      pressed.clear(); flashes.clear();
      $("judgment").classList.remove("show");
      setOverlay("ATTEMPT ENDED", "FAILED", `${run.mistakes} mistakes. Restart to try again.`);
      $("status").textContent = `${reason} Fourth mistake: run ended. Restart from the beginning.`;
      updateControls();
    } else {
      $("status").textContent = `${reason} Keep going.`;
    }
  }

  function stopListening() {
    if (mode !== "listening") return;
    playToken++;
    audio.pause();
    // Auditioning never changes where the next attempt starts.
    audio.currentTime = 0;
    audio.volume = playbackVolume;
    mode = "ready";
    run = engine.createRun(notes);
    setOverlay("READY WHEN YOU ARE", "LET’S PLAY", "3-second countdown · then you’re on");
    updateControls(); updateChartInfo();
  }

  function resetAfterEdit() {
    playToken++;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = playbackVolume;
    mode = "ready";
    run = engine.createRun(notes);
    setOverlay("UPDATED CHART", "TRY IT OUT", "3-second countdown · then you’re on");
    updateChartInfo(); updateControls();
  }

  function persistChart() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, notes }));
      $("editor-status").textContent = "Saved in this browser. Export JSON for a portable copy.";
    } catch {
      $("editor-status").textContent = "Browser storage is unavailable. Export JSON to keep your edits.";
    }
    resetAfterEdit();
  }

  function commitNotes(candidate) {
    notes = engine.validateNotes(candidate, original.duration);
    persistChart();
    renderEditor();
  }

  function renderEditor() {
    if (!$("workshop")) return;
    const from = Math.max(0, Number($("filter-time").value) || 0);
    const fragment = document.createDocumentFragment();
    notes.map((note, index) => ({ note, index })).filter(({ note }) => note.time >= from).slice(0, 100).forEach(({ note, index }) => {
      const row = document.createElement("tr");
      const number = document.createElement("td"); number.textContent = String(index + 1).padStart(3, "0");
      const timeCell = document.createElement("td"), directionCell = document.createElement("td"), deleteCell = document.createElement("td");
      const time = document.createElement("input");
      time.type = "number"; time.min = "0"; time.max = String(original.duration); time.step = "0.01"; time.value = note.time.toFixed(3);
      time.setAttribute("aria-label", `Note ${index + 1} time`);
      time.addEventListener("change", () => {
        try {
          if (time.value === "") throw new Error("Enter a time.");
          commitNotes(notes.map((n, i) => i === index ? { ...n, time: Number(time.value) } : n));
        } catch (error) { $("editor-status").textContent = error.message; time.value = note.time.toFixed(3); }
      });
      const direction = document.createElement("select"); direction.setAttribute("aria-label", `Note ${index + 1} direction`);
      engine.DIRECTIONS.forEach(d => { const option = document.createElement("option"); option.value = d; option.textContent = `${symbols[d]}  ${d}`; direction.append(option); });
      direction.value = note.direction;
      direction.addEventListener("change", () => commitNotes(notes.map((n, i) => i === index ? { ...n, direction: direction.value } : n)));
      const remove = document.createElement("button"); remove.textContent = "Remove"; remove.setAttribute("aria-label", `Remove note ${index + 1}`);
      remove.addEventListener("click", () => { try { commitNotes(notes.filter((_, i) => i !== index)); } catch (error) { $("editor-status").textContent = error.message; } });
      timeCell.append(time); directionCell.append(direction); deleteCell.append(remove);
      row.append(number, timeCell, directionCell, deleteCell); fragment.append(row);
    });
    $("note-rows").replaceChildren(fragment);
  }

  function arrow(x, y, direction, color, filled = true, size = 22) {
    const angles = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
    ctx.save(); ctx.translate(x, y); ctx.rotate(angles[direction]); ctx.beginPath();
    ctx.moveTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(size * .39, 0); ctx.lineTo(size * .39, size);
    ctx.lineTo(-size * .39, size); ctx.lineTo(-size * .39, 0); ctx.lineTo(-size, 0); ctx.closePath();
    if (filled) { ctx.fillStyle = color; ctx.fill(); }
    else { ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); }
    ctx.restore();
  }

  function draw(time, now) {
    ctx.clearRect(0, 0, width, height);
    const padding = 24, laneWidth = (width - padding * 2) / 4, targetY = height - 83;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#111713"); gradient.addColorStop(1, "#1e2920");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    engine.DIRECTIONS.forEach((direction, i) => {
      const x = padding + laneWidth * (i + .5);
      if (i > 0) { ctx.strokeStyle = "#303c302e"; ctx.beginPath(); ctx.moveTo(x - laneWidth / 2, 0); ctx.lineTo(x - laneWidth / 2, height); ctx.stroke(); }
      if (pressed.has(direction) || (flashes.get(direction) || 0) > now) {
        const glow = ctx.createLinearGradient(0, targetY - 100, 0, targetY + 40);
        glow.addColorStop(0, colors[i] + "00"); glow.addColorStop(1, colors[i] + "27");
        ctx.fillStyle = glow; ctx.fillRect(x - laneWidth / 2, targetY - 100, laneWidth, 150);
      }
      arrow(x, targetY, direction, pressed.has(direction) ? colors[i] : colors[i] + "88", pressed.has(direction), 23);
      const clue = targetClues[i], clueBottom = height - 27;
      ctx.save();
      ctx.strokeStyle = "#c0cdbd"; ctx.lineWidth = 2; ctx.lineCap = "butt";
      ctx.beginPath();
      for (let line = 0; line < clue.count; line++) {
        const lineX = x + (line - (clue.count - 1) / 2) * 8;
        ctx.moveTo(lineX, clueBottom - clue.length);
        ctx.lineTo(lineX, clueBottom);
      }
      ctx.stroke(); ctx.restore();
      if (!wordless) {
        ctx.fillStyle = "#899c87"; ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText(direction.toUpperCase(), x, height - 10);
      }
    });
    ctx.strokeStyle = "#c5e4a833"; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(12, targetY); ctx.lineTo(width - 12, targetY); ctx.stroke(); ctx.setLineDash([]);
    // Use audio time, never accumulated frame deltas. Notes travel for 2.1 seconds.
    const travel = 2.1;
    for (const [index, note] of run.notes.entries()) {
      if (note.result) continue;
      const delta = note.time - time;
      if (delta < -0.3 || delta > travel + 0.3) continue;
      const lane = engine.DIRECTIONS.indexOf(note.direction);
      const y = targetY - delta / travel * (targetY - 25);
      ctx.globalAlpha = Math.min(1, Math.max(0, (y + 20) / 60));
      const x = padding + laneWidth * (lane + .5);
      arrow(x, y, note.direction, colors[lane]);
      // Temporary timing-review labels use the full chart order, not the visible notes.
      // Keep the rightmost lane's label on its inner side so it cannot clip offscreen.
      if (!wordless) {
        ctx.save();
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.textAlign = lane === 3 ? "right" : "left";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.strokeStyle = "#111713";
        ctx.fillStyle = colors[lane];
        const label = String(index + 1).padStart(3, "0"), labelX = x + (lane === 3 ? -29 : 29);
        ctx.strokeText(label, labelX, y);
        ctx.fillText(label, labelX, y);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    const fade = ctx.createLinearGradient(0, 0, 0, 80);
    fade.addColorStop(0, "#111713"); fade.addColorStop(1, "#11171300"); ctx.fillStyle = fade; ctx.fillRect(0, 0, width, 80);
  }

  function frame(now) {
    if (mode === "countdown") {
      const left = countdownEnd - now;
      if (left <= 0) startAudio();
      else setCountdown(Math.ceil(left / 1000));
    }
    const time = songTime();
    updatePlayback(time);
    if (now > judgmentUntil) $("judgment").classList.remove("show");
    draw(time, now);
    const duration = mode === "listening" ? (audio.duration || original.duration) : gameEndTime();
    if ($("track-time")) $("track-time").textContent = `${timeLabel(audio.currentTime)} / ${timeLabel(duration)}`;
    $("progress").style.width = `${Math.min(100, audio.currentTime / duration * 100)}%`;
    if (mode === "listening") $("listen-time").textContent = `${timeLabel(audio.currentTime)} (${audio.currentTime.toFixed(2)}s)`;
    requestAnimationFrame(frame);
  }

  new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }).observe(canvas);

  document.addEventListener("keydown", event => {
    if (event.target.closest("input, select, textarea, button, summary") || event.target.isContentEditable) return;
    if (event.code === "Escape") {
      event.preventDefault(); if (event.repeat) return;
      stopGame();
      return;
    }
    const direction = keyMap[event.key];
    if (!direction) return;
    updatePlayback(songTime());
    if (!["playing", "countdown", "starting"].includes(mode)) return;
    event.preventDefault();
    if (event.repeat || pressed.has(direction)) return;
    pressed.add(direction);
    // The opening note can be at t=0: accept its normal early-hit window in the countdown.
    const previousMistakes = run.mistakes;
    const result = engine.hit(run, direction, songTime());
    if (run.mistakes !== previousMistakes) showMistake();
    if (result) { flashes.set(direction, performance.now() + 140); showJudgment(result); }
  });
  document.addEventListener("keyup", event => { if (keyMap[event.key]) pressed.delete(keyMap[event.key]); });
  window.addEventListener("blur", () => { pressed.clear(); stopGame("Stopped because the window lost focus. Restart begins from the start."); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopGame("Stopped because you switched tabs. Restart begins from the start."); });

  $("start").addEventListener("click", beginCountdown);
  $("stop").addEventListener("click", () => stopGame());
  // The word-free page has no editor or recorder controls, not a hidden duplicate.
  $("workshop")?.addEventListener("toggle", () => { if ($("workshop").open) { stopGame("Stopped while the chart workshop is open."); renderEditor(); } else stopListening(); });
  $("filter-time")?.addEventListener("change", renderEditor);
  $("add-note")?.addEventListener("click", () => {
    try { commitNotes([...notes, { time: Number($("filter-time").value), direction: "left" }]); }
    catch (error) { $("editor-status").textContent = error.message; }
  });
  $("listen")?.addEventListener("click", async () => {
    stopGame();
    const requested = Number($("seek-time").value);
    audio.currentTime = Math.max(0, Math.min(original.duration - .1, Number.isFinite(requested) ? requested : 0));
    audio.volume = playbackVolume;
    mode = "listening"; const token = ++playToken;
    run = engine.createRun(notes);
    updateMistakeCount();
    $("overlay").hidden = true;
    updateControls();
    try { await audio.play(); if (token === playToken) $("editor-status").textContent = "Listening only. Notes are not judged. Stop to edit or play."; }
    catch { if (token === playToken) { stopListening(); $("editor-status").textContent = "Could not start playback. Try Listen again."; } }
  });
  $("stop-listen")?.addEventListener("click", stopListening);
  $("export-chart")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ ...original, notes }, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "animals-chart.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $("editor-status").textContent = "Chart exported as animals-chart.json. Audio is not included.";
  });
  $("import-chart")?.addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Chart files must be under 2 MB.");
      const chart = JSON.parse(await file.text());
      if (chart.audioSha256 && chart.audioSha256 !== original.audioSha256) throw new Error("That chart is for a different recording.");
      commitNotes(chart.notes);
    } catch (error) { $("editor-status").textContent = `Import failed: ${error.message}`; }
    event.target.value = "";
  });
  $("restore-chart")?.addEventListener("click", () => {
    if (window.confirm("Replace this browser’s chart edits with the original draft? Export first if you want to keep them.")) commitNotes(original.notes);
  });
  audio.addEventListener("canplay", () => {
    if (ready) return;
    ready = true; updateControls();
    $("status").textContent = "Local recording ready. Nothing is uploaded." + savedMessage;
  });
  audio.addEventListener("error", () => {
    ready = false; playToken++; mode = "ready"; updateControls();
    $("start").textContent = wordless ? "!" : "Audio unavailable";
    if (wordless) $("start").setAttribute("aria-label", "Audio unavailable");
    $("status").textContent = "Could not load assets/animals.mp3. Keep the MP3 beside the game’s other assets.";
    setOverlay("CHECK THE AUDIO FILE", "NO AUDIO", "See the message beside the play button.");
  });
  audio.addEventListener("ended", () => {
    if (mode === "listening") { stopListening(); return; }
    finishGame();
  });
  if (audio.readyState >= 3) { ready = true; $("status").textContent = "Local recording ready. Nothing is uploaded." + savedMessage; }
  updateChartInfo(); if (ready) updateControls(); renderEditor(); requestAnimationFrame(frame);
})();
