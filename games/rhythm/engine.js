(function (root) {
  "use strict";
  const DIRECTIONS = ["left", "down", "up", "right"];
  const HIT_WINDOW = 0.200;
  const FAIL_AT_MISTAKES = 4;
  // Avoid floating-point rounding rejecting an input exactly on the boundary.
  const EPSILON = 1e-9;

  function validateNotes(notes, duration) {
    if (!Array.isArray(notes) || notes.length < 1 || notes.length > 10000) throw new Error("Use between 1 and 10,000 notes.");
    const result = notes.map(note => {
      if (!note || typeof note.time !== "number" || !Number.isFinite(note.time) || note.time < 0 || note.time > duration) throw new Error("Every time must be a number within the song.");
      if (!DIRECTIONS.includes(note.direction)) throw new Error("Directions must be left, down, up, or right.");
      return { time: Math.round(note.time * 1000) / 1000, direction: note.direction };
    }).sort((a, b) => a.time - b.time);
    if (result.some((note, index) => index && Math.abs(note.time - result[index - 1].time) < 0.001)) throw new Error("Use one arrow at each timestamp; simultaneous notes are not part of this chart.");
    return result;
  }

  function createRun(notes) {
    return { notes: notes.map(note => ({ ...note, result: null })), mistakes: 0, lastMistake: null, failed: false };
  }

  function countMistake(run, mistake) {
    run.mistakes++;
    run.lastMistake = mistake;
    run.failed = run.mistakes >= FAIL_AT_MISTAKES;
  }

  function expire(run, time) {
    if (run.failed) return 0;
    let missed = 0;
    for (const [index, note] of run.notes.entries()) {
      if (time <= note.time + HIT_WINDOW + EPSILON) break;
      if (!note.result) {
        note.result = "miss";
        countMistake(run, { type: "miss", noteIndex: index });
        missed++;
        if (run.failed) break;
      }
    }
    return missed;
  }

  function hit(run, direction, time) {
    expire(run, time);
    if (run.failed) return null;
    let candidate = null, candidateIndex = null, closest = Infinity;
    for (const [index, note] of run.notes.entries()) {
      if (note.time > time + HIT_WINDOW + EPSILON) break;
      if (note.result || note.direction !== direction) continue;
      const distance = Math.abs(time - note.time);
      if (distance < closest && distance <= HIT_WINDOW + EPSILON) { candidate = note; candidateIndex = index; closest = distance; }
    }
    if (!candidate) {
      // An invalid press and an unhit note are separate mistakes, even when
      // this same keydown also causes the overdue note to be counted above.
      countMistake(run, { type: "invalid-press", direction, time });
      return null;
    }
    candidate.result = "hit";
    // Negative offsets are early; positive offsets are late, relative to audio time.
    return { noteIndex: candidateIndex, offsetMs: (time - candidate.time) * 1000 };
  }

  const api = Object.freeze({ DIRECTIONS, HIT_WINDOW, FAIL_AT_MISTAKES, validateNotes, createRun, expire, hit });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RhythmEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
