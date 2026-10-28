"use strict";
(() => {
  const key = "puzzle-26:assembly-preview:v1";
  let initialState;
  try { initialState = JSON.parse(localStorage.getItem(key)); } catch { /* A fresh layout remains usable without storage. */ }
  window.ReactionAssembly.mount(document.querySelector("#board"), {
    initialState,
    onChange: state => localStorage.setItem(key, JSON.stringify(state)),
  });
})();
