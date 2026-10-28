"use strict";

window.AnimalMatching = (() => {
  const data = window.ANIMAL_MATCHING_DATA;
  const animals = new Map(data.animals.map(animal => [animal.id, animal]));
  const movable = new Set(data.trayOrder);
  const slotKeys = data.categories.flatMap(category =>
    [0, 1, 2].flatMap(row => [0, 1].map(side => `${category.id}-${row}-${side}`)));

  function restore(value) {
    const used = new Set();
    const slots = {};
    for (const key of slotKeys) {
      const id = value?.version === 1 ? value.slots?.[key] : null;
      slots[key] = movable.has(id) && !used.has(id) ? id : null;
      if (slots[key]) used.add(id);
    }
    return { version: 1, slots };
  }

  function isComplete(value) {
    const { slots } = restore(value);
    if (Object.values(slots).some(id => !id)) return false;
    return data.categories.every(category => [0, 1, 2].every(row =>
      category.pairs.some(pair => pair[0] === slots[`${category.id}-${row}-0`]
        && pair[1] === slots[`${category.id}-${row}-1`])));
  }

  function mount(root, { initialState, onChange = () => {} } = {}) {
    const events = new AbortController();
    let layout = restore(initialState), selected = null, gesture = null;
    let frame = null, ignoreClickUntil = 0, disposed = false;
    const slots = new Map(), tiles = new Map();
    root.classList.add("animal-matching");
    root.innerHTML = `
      <div class="animal-categories"></div>
      <section class="animal-tray-section" aria-label="Animal photos" data-tray>
        <div class="animal-tray"></div>
        <button type="button" class="animal-return" aria-label="Return selected photo to tray" disabled><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </section>
      <p class="animal-status animal-sr-only" role="status" aria-live="polite"></p>
      <p class="animal-selection animal-sr-only" role="status" aria-live="polite"></p>
      <p class="animal-save-error animal-sr-only" role="alert" hidden>Your arrangement could not be saved. Keep this page open; your next move will retry.</p>`;
    const categoryGrid = root.querySelector(".animal-categories");
    const tray = root.querySelector(".animal-tray");
    const status = root.querySelector(".animal-status");
    const selection = root.querySelector(".animal-selection");
    const returnButton = root.querySelector(".animal-return");

    function photo(id) {
      const image = document.createElement("img");
      image.src = animals.get(id).src;
      image.alt = animals.get(id).alt;
      image.draggable = false;
      return image;
    }

    for (const category of data.categories) {
      const section = document.createElement("section");
      section.className = "animal-category";
      section.dataset.category = category.id;
      section.setAttribute("aria-label", category.title);
      section.innerHTML = '<div class="animal-pair-row animal-example"></div>';
      category.example.forEach(id => {
        const fixed = document.createElement("div");
        fixed.className = "animal-fixed";
        fixed.dataset.fixed = id;
        fixed.append(photo(id));
        section.querySelector(".animal-example").append(fixed);
      });
      for (let row = 0; row < 3; row++) {
        const pair = document.createElement("div");
        pair.className = "animal-pair-row";
        for (let side = 0; side < 2; side++) {
          const key = `${category.id}-${row}-${side}`;
          const slot = document.createElement("div");
          slot.className = "animal-slot";
          slot.dataset.slot = key;
          const label = `${category.title}, pair ${row + 1}, ${category.columns[side].toLowerCase()}`;
          slots.set(key, { slot, label });
          pair.append(slot);
        }
        section.append(pair);
      }
      categoryGrid.append(section);
    }

    for (const id of data.trayOrder) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "animal-tile";
      tile.dataset.animal = id;
      tile.append(photo(id));
      tiles.set(id, tile);
    }

    function locationOf(id) {
      return slotKeys.find(key => layout.slots[key] === id) || null;
    }

    function paint(focusId) {
      if (disposed) return;
      const complete = isComplete(layout);
      if (complete) selected = null;
      for (const [key, { slot, label }] of slots) {
        const id = layout.slots[key];
        slot.replaceChildren();
        if (id) slot.append(tiles.get(id));
        else {
          const empty = document.createElement("button");
          empty.type = "button"; empty.className = "animal-empty";
          empty.setAttribute("aria-label", `${label}, empty space`);
          slot.append(empty);
        }
      }
      const placed = new Set(Object.values(layout.slots));
      tray.replaceChildren(...data.trayOrder.filter(id => !placed.has(id)).map(id => tiles.get(id)));
      for (const [id, tile] of tiles) {
        tile.disabled = complete;
        tile.setAttribute("aria-pressed", String(id === selected));
        const location = locationOf(id);
        tile.setAttribute("aria-label", `${animals.get(id).alt} ${location ? slots.get(location).label : "In the tray"}.`);
      }
      returnButton.disabled = complete || !selected || !locationOf(selected);
      const count = Object.values(layout.slots).filter(Boolean).length;
      root.dataset.complete = String(complete);
      status.textContent = complete ? "All nine pairs are correct. Puzzle solved. The arrangement is locked."
        : count === 18 ? "Some pairs are not matched correctly. Check the category, partner, and side."
        : `${count} / 18 photos placed. Complete the board to check your matches.`;
      selection.textContent = selected ? "Photo selected. Choose a space, or press Escape to cancel." : "";
      if (focusId && !complete) tiles.get(focusId)?.focus({ preventScroll: true });
    }

    function move(id, target) {
      if (isComplete(layout) || !movable.has(id) || (target !== null && !slots.has(target))) return;
      const from = locationOf(id);
      selected = null;
      if (from === target) { paint(id); return; }
      const displaced = target ? layout.slots[target] : null;
      if (from) layout.slots[from] = displaced;
      if (target) layout.slots[target] = id;
      try {
        onChange(JSON.parse(JSON.stringify(layout)), isComplete(layout));
        root.querySelector(".animal-save-error").hidden = true;
      } catch {
        root.querySelector(".animal-save-error").hidden = false;
      }
      paint(id);
    }

    function targetAt(x, y) {
      const element = document.elementFromPoint(x, y);
      if (!element || !root.contains(element)) return undefined;
      const slot = element.closest("[data-slot]");
      if (slot) return slot.dataset.slot;
      return element.closest("[data-tray]") ? null : undefined;
    }

    function highlight(target) {
      root.querySelectorAll(".animal-drop-target").forEach(element => element.classList.remove("animal-drop-target"));
      if (target === null) root.querySelector("[data-tray]").classList.add("animal-drop-target");
      else if (slots.has(target)) slots.get(target).slot.classList.add("animal-drop-target");
    }

    function dragFrame() {
      if (!gesture?.active) return;
      const { x, y } = gesture;
      const edge = 65;
      const dy = y < edge ? -Math.ceil((edge - y) / 4)
        : y > innerHeight - edge ? Math.ceil((y - innerHeight + edge) / 4) : 0;
      if (dy) window.scrollBy(0, dy);
      highlight(targetAt(x, y));
      frame = requestAnimationFrame(dragFrame);
    }

    function endGesture() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      gesture?.ghost?.remove();
      if (gesture?.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId);
      tiles.forEach(tile => tile.classList.remove("animal-dragging"));
      highlight(undefined);
      gesture = null;
    }

    root.addEventListener("pointerdown", event => {
      if (isComplete(layout)) return;
      const tile = event.target.closest("[data-animal]");
      if (!tile || event.button !== 0 || !event.isPrimary || gesture) return;
      gesture = { id: tile.dataset.animal, pointerId: event.pointerId, capture: tile,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
      tile.setPointerCapture(event.pointerId);
    }, { signal: events.signal });
    root.addEventListener("pointermove", event => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.x = event.clientX; gesture.y = event.clientY;
      if (!gesture.active && Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > 7) {
        gesture.active = true;
        const ghost = document.createElement("div");
        ghost.className = "animal-drag-ghost"; ghost.setAttribute("aria-hidden", "true");
        ghost.append(photo(gesture.id)); document.body.append(ghost); gesture.ghost = ghost;
        tiles.get(gesture.id).classList.add("animal-dragging");
        frame = requestAnimationFrame(dragFrame);
      }
      if (gesture.active) {
        event.preventDefault();
        gesture.ghost.style.transform = `translate(${gesture.x + 10}px, ${gesture.y + 10}px)`;
      }
    }, { signal: events.signal });
    root.addEventListener("pointerup", event => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const { id, active } = gesture, target = targetAt(event.clientX, event.clientY);
      endGesture();
      if (active) {
        ignoreClickUntil = performance.now() + 350;
        if (target !== undefined) move(id, target);
      }
    }, { signal: events.signal });
    root.addEventListener("pointercancel", endGesture, { signal: events.signal });
    root.addEventListener("lostpointercapture", () => { if (gesture) endGesture(); }, { signal: events.signal });
    root.addEventListener("dragstart", event => event.preventDefault(), { signal: events.signal });
    root.addEventListener("click", event => {
      if (isComplete(layout) || performance.now() < ignoreClickUntil) return;
      const tile = event.target.closest("[data-animal]");
      const slot = event.target.closest("[data-slot]");
      if (event.target.closest(".animal-return")) { if (selected) move(selected, null); return; }
      if (selected && slot && layout.slots[slot.dataset.slot] !== selected) {
        move(selected, slot.dataset.slot); return;
      }
      if (tile) {
        selected = selected === tile.dataset.animal ? null : tile.dataset.animal;
        paint(tile.dataset.animal);
      } else if (selected && event.target.closest("[data-tray]")) move(selected, null);
    }, { signal: events.signal });
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") { selected = null; endGesture(); paint(); }
    }, { signal: events.signal });
    paint();
    return () => { disposed = true; events.abort(); endGesture(); };
  }

  return Object.freeze({ mount, restore, isComplete });
})();
