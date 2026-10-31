"use strict";

// Component/layout tests deliberately visit puzzles out of hunt order. Keep
// that fixture choice explicit and independent of saved progress. The real
// sequence and route guards are exercised without this helper in unlocks.test.cjs.
async function allowUnrestrictedNavigation(context) {
  await context.addInitScript(() => {
    if (window !== window.top) return;
    const requestedHash = location.hash;
    document.addEventListener("DOMContentLoaded", () => {
      if (typeof SITE_CONFIG === "undefined") return;
      for (const category of SITE_CONFIG.categories) {
        category.unlock = { type: "always" };
        for (const puzzle of category.puzzles) puzzle.unlock = { type: "always" };
      }
      // Restore a deep link if the ordinary initial route guard redirected it.
      if (location.hash !== requestedHash) history.replaceState(null, "", requestedHash || "#/");
      renderRoute();
    }, { once: true });
  });
}

module.exports = { allowUnrestrictedNavigation };
