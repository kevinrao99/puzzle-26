"use strict";

// Public connection settings only. Never put an access code, AWS credential,
// Judge0 token, or other server secret in this file.
window.PUZZLE_GRADER_CONFIG = Object.freeze({
  baseUrl: "https://13.59.146.74",
  recoverHistory: true,
  maxFileBytes: 256 * 1024,
  pollIntervalMs: 2000,
  requestTimeoutMs: 20000,
  pollTimeoutMs: 15 * 60 * 1000,
});
