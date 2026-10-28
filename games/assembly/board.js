"use strict";

window.ReactionAssembly = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const radians = angle => angle * Math.PI / 180;
  const wrap = angle => ((angle % 360) + 360) % 360;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const copy = value => JSON.parse(JSON.stringify(value));
  const finite = n => typeof n === "number" && Number.isFinite(n);
  const turn = (point, angle) => {
    const c = Math.cos(radians(angle)), s = Math.sin(radians(angle));
    return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
  };
  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }
  function random() {
    const word = new Uint32Array(1);
    crypto.getRandomValues(word);
    return word[0] / 4294967296;
  }
  function shuffled(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function mount(root, { data = window.ASSEMBLY_PIECES, initialState, onChange = () => {} } = {}) {
    const definitions = new Map(data.pieces.map(piece => [piece.id, piece]));
    let disposed = false, expanded = false, oldBodyOverflow = "", saveTimer = null;
    let selected = new Set(), gesture = null, focusFromPointer = false;
    let history = [], pointers = new Map(), spaceHeld = false;
    let state = restore(initialState);
    root.classList.add("assembly-board");
    root.innerHTML = `
      <svg class="assembly-stage" tabindex="0" role="application" aria-label="Reaction diagram assembly workspace">
        <defs><marker id="assembly-electrons" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="7" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 4 L0 8 L2 4 Z" fill="#7842bc"/></marker></defs>
        <g class="assembly-pieces"></g><g class="assembly-selection"></g>
      </svg>
      <p class="assembly-save-error" role="alert" hidden>Unable to save. Keep this page open; your next move will retry.</p>`;
    const stage = root.querySelector("svg.assembly-stage");
    const layer = root.querySelector(".assembly-pieces");
    const overlay = root.querySelector(".assembly-selection");
    const saveError = root.querySelector(".assembly-save-error");
    const views = new Map();
    let width = 800, height = 600;

    function restore(value) {
      if (!value || value.version !== data.version || !Array.isArray(value.pieces) || value.pieces.length !== definitions.size) return null;
      const ids = new Set();
      for (const p of value.pieces) {
        if (!definitions.has(p.id) || ids.has(p.id) || ![p.x, p.y, p.angle].every(finite) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) return null;
        ids.add(p.id);
      }
      const result = copy(value);
      result.pieces.forEach(p => { p.angle = wrap(p.angle); delete p.group; });
      if (!result.view || ![result.view.x, result.view.y, result.view.zoom].every(finite) || result.view.zoom < .08 || result.view.zoom > 4) result.view = null;
      return result;
    }

    function scatter() {
      const prepared = shuffled(data.pieces).map(piece => {
        const angle = Math.floor(random() * 24) * 15;
        const c = Math.abs(Math.cos(radians(angle))), s = Math.abs(Math.sin(radians(angle)));
        const w = piece.width * c + piece.height * s + 40, h = piece.width * s + piece.height * c + 40;
        return { id: piece.id, angle, w, h, dx: random() * 16, dy: random() * 16 };
      });
      const rect = stage.getBoundingClientRect();
      const aspect = (rect.width || 800) / (rect.height || 600);
      const estimate = Math.sqrt(prepared.reduce((area, p) => area + (p.w + 32) * (p.h + 32), 0) * aspect);
      let best = null;
      // Choose a packing that uses the available screen, retaining random order
      // and angles. This avoids a narrow column of tiny fragments on wide screens.
      for (let ratio = .7; ratio <= 1.7; ratio += .1) {
        let x = 35, y = 35, rowHeight = 0, right = 0;
        const pieces = prepared.map(p => {
          if (x > 35 && x + p.w > estimate * ratio) { x = 35; y += rowHeight + 32; rowHeight = 0; }
          const pose = { id: p.id, x: x + p.w / 2 + p.dx, y: y + p.h / 2 + p.dy, angle: p.angle };
          x += p.w + 32; right = Math.max(right, x); rowHeight = Math.max(rowHeight, p.h);
          return pose;
        });
        const score = Math.min((rect.width || 800) / (right + 100), (rect.height || 600) / (y + rowHeight + 100));
        if (!best || score > best.score) best = { score, pieces };
      }
      return { version: data.version, pieces: best.pieces, view: null };
    }
    state ||= scatter();

    for (const [index, piece] of data.pieces.entries()) {
      const g = svgElement("g", { "data-piece": piece.id, class: "assembly-piece", tabindex: 0, role: "button", "aria-label": `Diagram piece ${index + 1}`, "aria-pressed": "false" });
      const geometry = svgElement("g", { transform: `translate(${-piece.cx} ${-piece.cy})`, class: "assembly-geometry" });
      geometry.innerHTML = piece.geometry;
      const hits = geometry.cloneNode(true);
      hits.setAttribute("class", "assembly-hits"); hits.setAttribute("aria-hidden", "true");
      for (const e of hits.children) { e.removeAttribute("marker-end"); e.setAttribute("stroke", "transparent"); e.setAttribute("stroke-width", "13"); e.setAttribute("fill", "transparent"); }
      g.append(hits, geometry);
      const labels = piece.labels.map(label => {
        const anchor = svgElement("g", { transform: `translate(${label.x} ${label.y})` });
        const upright = svgElement("g", { class: "assembly-label" });
        const content = svgElement("g"); content.innerHTML = label.markup;
        const mask = svgElement("rect", { class: "assembly-label-mask", fill: "white", "pointer-events": "none" });
        upright.append(mask, content); anchor.append(upright); g.append(anchor);
        return { anchor, upright, content, mask, ...label };
      });
      layer.append(g);
      views.set(piece.id, { g, geometry, labels });
      g.addEventListener("focus", () => { if (!focusFromPointer) { selected = new Set([piece.id]); paint(); } });
    }
    for (const view of views.values()) for (const label of view.labels) {
      const b = label.content.getBBox();
      for (const [key, value] of Object.entries({ x: b.x - 2.3, y: b.y - 1.4, width: b.width + 4.6, height: b.height + 2.8 })) label.mask.setAttribute(key, value);
    }
    function bounds(poses = state.pieces) {
      const points = [];
      for (const pose of poses) {
        const piece = definitions.get(pose.id);
        for (const x of [-piece.width / 2, piece.width / 2]) for (const y of [-piece.height / 2, piece.height / 2]) {
          const p = turn({ x, y }, pose.angle); points.push({ x: p.x + pose.x, y: p.y + pose.y });
        }
      }
      if (!points.length) return null;
      const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
      const right = Math.max(...points.map(p => p.x)), bottom = Math.max(...points.map(p => p.y));
      return { x, y, width: right - x, height: bottom - y, cx: (x + right) / 2, cy: (y + bottom) / 2 };
    }
    function fit() {
      const b = bounds();
      state.view = { x: b.cx, y: b.cy, zoom: clamp(Math.min(width / (b.width + 100), height / (b.height + 100)), .08, 4) };
    }
    function resize() {
      const rect = stage.getBoundingClientRect();
      width = rect.width || 800; height = rect.height || 600;
      if (!state.view) fit();
      paint();
    }
    function paint() {
      if (disposed || !state.view) return;
      const focusedPiece = layer.contains(document.activeElement) ? document.activeElement : null;
      const { x, y, zoom } = state.view;
      stage.setAttribute("viewBox", `${x - width / (2 * zoom)} ${y - height / (2 * zoom)} ${width / zoom} ${height / zoom}`);
      for (const [index, p] of state.pieces.entries()) {
        const view = views.get(p.id);
        view.g.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${p.angle})`);
        view.g.setAttribute("aria-pressed", String(selected.has(p.id)));
        for (const label of view.labels) label.upright.setAttribute("transform", `rotate(${-p.angle})`);
        if (layer.children[index] !== view.g) layer.insertBefore(view.g, layer.children[index] || null);
      }
      if (focusedPiece && document.activeElement !== focusedPiece) {
        focusFromPointer = true; focusedPiece.focus({ preventScroll: true }); focusFromPointer = false;
      }
      overlay.replaceChildren();
      const b = bounds(state.pieces.filter(p => selected.has(p.id)));
      if (b) {
        overlay.append(svgElement("rect", { x: b.x, y: b.y, width: b.width, height: b.height, fill: "none", stroke: "#34715c", "stroke-width": 1.5 / zoom, "stroke-dasharray": `${5 / zoom} ${4 / zoom}`, "pointer-events": "none" }));
        overlay.append(svgElement("path", { d: `M${b.cx} ${b.y} V${b.y - 28 / zoom}`, stroke: "#34715c", "stroke-width": 1.5 / zoom, "pointer-events": "none" }));
        overlay.append(svgElement("circle", { cx: b.cx, cy: b.y - 28 / zoom, r: 20 / zoom, fill: "transparent", "data-rotate": "true", class: "assembly-rotate-hit" }));
        overlay.append(svgElement("circle", { cx: b.cx, cy: b.y - 28 / zoom, r: 8 / zoom, fill: "#34715c", stroke: "white", "stroke-width": 2 / zoom, "pointer-events": "none" }));
      }

    }
    function checkpoint() { history.push(copy(state)); if (history.length > 40) history.shift(); }
    function save() {
      clearTimeout(saveTimer);
      try { onChange(copy(state)); saveError.hidden = true; }
      catch { saveError.hidden = false; }
    }
    function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 180); }
    function point(event) { return new DOMPoint(event.clientX, event.clientY).matrixTransform(stage.getScreenCTM().inverse()); }
    function zoomAt(factor, clientX, clientY) {
      const r = stage.getBoundingClientRect();
      clientX ??= r.x + width / 2; clientY ??= r.y + height / 2;
      const anchor = point({ clientX, clientY });
      const zoom = clamp(state.view.zoom * factor, .08, 4);
      state.view = { x: anchor.x - (clientX - r.x - width / 2) / zoom, y: anchor.y - (clientY - r.y - height / 2) / zoom, zoom };
      paint(); scheduleSave();
    }
    function rotateSelection(angle) {
      const chosen = state.pieces.filter(p => selected.has(p.id));
      if (!chosen.length) return;
      checkpoint(); const b = bounds(chosen);
      for (const p of chosen) {
        const q = turn({ x: p.x - b.cx, y: p.y - b.cy }, angle);
        p.x = b.cx + q.x; p.y = b.cy + q.y; p.angle = wrap(p.angle + angle);
      }
      paint(); save();
    }
    function toggleExpand(force = !expanded) {
      if (force === expanded) return;
      expanded = force;
      root.classList.toggle("assembly-expanded", expanded);
      if (expanded) { oldBodyOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
      else document.body.style.overflow = oldBodyOverflow;
      resize();
    }
    function performAction(action) {
      if (action === "fit") { fit(); paint(); save(); }
      if (action === "expand") toggleExpand();
      if (action === "shuffle" && window.confirm("Reshuffle all 27 pieces? This will reset their positions and rotations.")) {
        checkpoint(); state = scatter(); selected.clear(); fit(); paint(); save();
      }
    }

    function pointerDown(event) {
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault(); stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], mid = { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
        gesture = { type: "pinch", distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: state.view.zoom, anchor: point(mid) };
        return;
      }
      if (pointers.size > 2) return;
      const id = event.target.closest("[data-piece]")?.dataset.piece;
      const at = point(event);
      if (event.target.hasAttribute("data-rotate")) {
        checkpoint(); const b = bounds(state.pieces.filter(p => selected.has(p.id)));
        gesture = { type: "rotate", center: { x: b.cx, y: b.cy }, start: Math.atan2(at.y - b.cy, at.x - b.cx), poses: copy(state.pieces) };
      } else if (id && !spaceHeld && event.button !== 1) {
        const ids = [id];
        if (event.shiftKey) {
          const remove = ids.every(i => selected.has(i));
          for (const i of ids) remove ? selected.delete(i) : selected.add(i);
          if (remove) { paint(); return; }
        } else if (!selected.has(id)) selected = new Set(ids);
        focusFromPointer = true; views.get(id).g.focus({ preventScroll: true }); focusFromPointer = false;
        checkpoint();
        state.pieces = [...state.pieces.filter(p => !selected.has(p.id)), ...state.pieces.filter(p => selected.has(p.id))];
        gesture = { type: "move", start: at, poses: copy(state.pieces) };
      } else {
        if (!spaceHeld && !event.shiftKey) selected.clear();
        gesture = { type: "pan", x: event.clientX, y: event.clientY, view: copy(state.view) };
        focusFromPointer = true; stage.focus({ preventScroll: true }); focusFromPointer = false;
      }
      paint();
      if (gesture?.type === "move" && id) { focusFromPointer = true; views.get(id).g.focus({ preventScroll: true }); focusFromPointer = false; }
    }
    function pointerMove(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!gesture) return;
      if (gesture.type === "pinch") {
        if (pointers.size !== 2) return;
        const [a, b] = [...pointers.values()], r = stage.getBoundingClientRect();
        const zoom = clamp(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance, .08, 4);
        state.view = { x: gesture.anchor.x - ((a.x + b.x) / 2 - r.x - width / 2) / zoom, y: gesture.anchor.y - ((a.y + b.y) / 2 - r.y - height / 2) / zoom, zoom };
      } else if (gesture.type === "pan") {
        state.view.x = gesture.view.x - (event.clientX - gesture.x) / gesture.view.zoom;
        state.view.y = gesture.view.y - (event.clientY - gesture.y) / gesture.view.zoom;
      } else {
        const at = point(event);
        for (const p of state.pieces) if (selected.has(p.id)) {
          const old = gesture.poses.find(q => q.id === p.id);
          if (gesture.type === "move") { p.x = old.x + at.x - gesture.start.x; p.y = old.y + at.y - gesture.start.y; }
          else {
            let delta = (Math.atan2(at.y - gesture.center.y, at.x - gesture.center.x) - gesture.start) * 180 / Math.PI;
            if (event.shiftKey) delta = Math.round(delta / 15) * 15;
            const q = turn({ x: old.x - gesture.center.x, y: old.y - gesture.center.y }, delta);
            p.x = gesture.center.x + q.x; p.y = gesture.center.y + q.y; p.angle = wrap(old.angle + delta);
          }
        }
      }
      paint();
    }
    function pointerEnd(event) {
      pointers.delete(event.pointerId);
      if (gesture) { gesture = null; save(); }
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    }
    stage.addEventListener("pointerdown", pointerDown);
    stage.addEventListener("pointermove", pointerMove);
    stage.addEventListener("pointerup", pointerEnd);
    stage.addEventListener("pointercancel", pointerEnd);
    stage.addEventListener("wheel", event => { event.preventDefault(); zoomAt(Math.exp(-event.deltaY * .0015), event.clientX, event.clientY); }, { passive: false });
    stage.addEventListener("keydown", event => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const action = { f: "expand", "0": "fit", r: "shuffle" }[event.key.toLowerCase()];
        if (action) { event.preventDefault(); if (!event.repeat) performAction(action); }
      }
      if (event.key === " ") { event.preventDefault(); spaceHeld = true; }
      if (["q", "e"].includes(event.key.toLowerCase())) { event.preventDefault(); rotateSelection((event.key.toLowerCase() === "q" ? -1 : 1) * (event.shiftKey ? 1 : 15)); }
      if (event.key.startsWith("Arrow") && selected.size) {
        event.preventDefault(); checkpoint(); const amount = event.shiftKey ? 1 : 5;
        for (const p of state.pieces) if (selected.has(p.id)) { p.x += event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0; p.y += event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0; }
        paint(); save();
      }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomAt(1.35); }
      if (event.key === "-") { event.preventDefault(); zoomAt(1 / 1.35); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && history.length) { event.preventDefault(); state = history.pop(); selected.clear(); paint(); save(); }
    });
    root.addEventListener("keyup", event => { if (event.key === " ") spaceHeld = false; });
    root.addEventListener("focusout", () => { spaceHeld = false; });
    root.addEventListener("keydown", event => { if (event.key === "Escape") { if (expanded) toggleExpand(false); else { selected.clear(); paint(); } } });
    const observer = new ResizeObserver(resize); observer.observe(stage);
    resize(); save();
    function leave() { save(); }
    window.addEventListener("pagehide", leave);
    return () => {
      if (disposed) return;
      save(); disposed = true; clearTimeout(saveTimer); observer.disconnect();
      window.removeEventListener("pagehide", leave);
      if (expanded) document.body.style.overflow = oldBodyOverflow;
      root.replaceChildren(); root.classList.remove("assembly-board", "assembly-expanded");
    };
  }
  return { mount };
})();
