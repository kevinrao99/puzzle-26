"use strict";

// Card data and rendering stay separate from the machine and progress storage.
window.HuntCards = (() => {
  const TEMPLATE_CARD = Object.freeze({
    celestial: "sun",
    number: 1,
    name: "Lorem Ipsum",
    artShape: "circle",
    rarity: "common",
    typeLine: "Lorem — Ipsum",
    power: 2,
    toughness: 3,
    serial: "001",
  });
  const CELESTIAL_ICONS = Object.freeze({
    sun: '<circle cx="16" cy="16" r="6"/><path d="M16 2V6 M16 26V30 M2 16H6 M26 16H30 M6 6L9 9 M23 23L26 26 M6 26L9 23 M23 9L26 6" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
    moon: '<path d="M21 3A13.4 13.4 0 1 0 29 23A12.6 12.6 0 0 1 21 3Z"/>',
  });
  const RARITY_ICONS = Object.freeze({
    // Stable data keys retain the original rarity assignments. All artwork uses
    // currentColor so the complete emblem inherits its one-card red highlight.
    circle: '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle r="11.5"/><circle r="7.5"/></g><path d="M0 -4L4 0L0 4L-4 0Z M0 -14L2.3 -11.5L0 -9L-2.3 -11.5Z M0 9L2.3 11.5L0 14L-2.3 11.5Z" fill="currentColor"/>',
    triangle: '<path d="M0 -13L12 10H-12Z M0 -4L5 6H-5Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="miter"/><path d="M-7 13H7 M0 -13V-7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    diamond: '<path d="M0 -14L11 0L0 14L-11 0Z M0 -7L5.5 0L0 7L-5.5 0Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/>',
    star: '<path d="M0 -14L3.4 -6L9 -9L6 -3.4L14 0L6 3.4L9 9L3.4 6L0 14L-3.4 6L-9 9L-6 3.4L-14 0L-6 -3.4L-9 -9L-3.4 -6Z M0 -6L-4 0L0 6L4 0Z" fill="currentColor" fill-rule="evenodd"/>',
  });
  const SVG_NS = "http://www.w3.org/2000/svg";
  const RED = "#bf1424";
  const SERIAL_RED = "#ff4040"; // Brighter red remains legible on the black border.
  let nextId = 0;

  function createCard(properties = {}) {
    const card = { ...TEMPLATE_CARD, ...properties };
    if (!Object.hasOwn(CELESTIAL_ICONS, card.celestial)) {
      throw new TypeError('Card celestial must be "sun" or "moon".');
    }
    if (!["circle", "glider"].includes(card.artShape)) {
      throw new TypeError('Card artShape must be "circle" or "glider".');
    }
    if (card.artShape === "glider" && (!Array.isArray(card.gliderCells) || card.gliderCells.length !== 5 || card.gliderCells.some(cell => !Array.isArray(cell) || cell.length !== 2 || cell.some(value => !Number.isInteger(value) || value < 0 || value > 2)))) {
      throw new TypeError("Glider art requires five live cells in a 3 × 3 bounding box.");
    }
    if (card.title && ["A", "O", "V", "S"].some(key => typeof card.title[key] !== "string")) {
      throw new TypeError("Card title needs A, O, V, and S text.");
    }
    if (card.types && (!Array.isArray(card.types) || card.types.length !== 2 || card.types.some(type => typeof type !== "string"))) {
      throw new TypeError("Card types must contain two text values.");
    }
    for (const key of ["number", "power", "toughness"]) {
      if (!Number.isFinite(card[key])) throw new TypeError(`Card ${key} must be a finite number.`);
    }
    for (const key of ["name", "typeLine", "rarity", "serial"]) {
      if (typeof card[key] !== "string") throw new TypeError(`Card ${key} must be text.`);
    }

    const id = `hunt-card-${++nextId}`;
    const element = document.createElement("article");
    element.className = "hunt-card";
    element.dataset.celestial = card.celestial;
    element.dataset.rarity = card.rarity;
    if (card.id !== undefined) element.dataset.cardNumber = String(card.id);
    const redFields = new Set(card.redFields || []);
    // Only fixed artwork and an internally generated ID enter this markup.
    // All supplied card text is assigned with textContent below.
    element.innerHTML = `
      <svg class="hunt-card-image" viewBox="0 0 360 504" width="360" height="504" role="img" aria-labelledby="${id}-title ${id}-description" xmlns="http://www.w3.org/2000/svg">
        <title id="${id}-title"></title>
        <desc id="${id}-description"></desc>
        <defs>
          <linearGradient id="${id}-frame" x2=".8" y2="1">
            <stop stop-color="#a6b9bd"/><stop offset=".3" stop-color="#617c89"/>
            <stop offset=".72" stop-color="#354f5e"/><stop offset="1" stop-color="#718994"/>
          </linearGradient>
          <linearGradient id="${id}-ivory" x2="0" y2="1">
            <stop stop-color="#fffdf0"/><stop offset=".5" stop-color="#e7e4d6"/><stop offset="1" stop-color="#c7cabe"/>
          </linearGradient>
          <linearGradient id="${id}-art" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#e8e7db"/><stop offset=".5" stop-color="#b5c5c4"/><stop offset="1" stop-color="#829da7"/>
          </linearGradient>
          <linearGradient id="${id}-paper" x2="0" y2="1">
            <stop stop-color="#f4f1e4"/><stop offset="1" stop-color="#e3dfcf"/>
          </linearGradient>
        </defs>

        <!-- Rounded black outer border and an inset, beveled frame. -->
        <rect x="1" y="1" width="358" height="502" rx="19" fill="#111" stroke="#000" stroke-width="2"/>
        <rect x="11" y="11" width="338" height="460" rx="13" fill="url(#${id}-frame)" stroke="#c8d1cf" stroke-width="1.2"/>
        <rect x="17" y="17" width="326" height="447" rx="10" fill="none" stroke="#172d36" stroke-width="1.5"/>
        <path d="M22 79H338 M20 370V440Q20 461 41 461H251" fill="none" stroke="#d7e0dc" stroke-width="1" opacity=".55"/>

        <!-- Sun/moon at top left, name, then the independent top-right number. -->
        <rect x="24" y="26" width="312" height="47" rx="17" fill="#182a32"/>
        <rect x="22" y="23" width="316" height="47" rx="17" fill="url(#${id}-ivory)" stroke="#111" stroke-width="2"/>
        <circle cx="45" cy="47" r="21" fill="url(#${id}-ivory)" stroke="#000" stroke-width="2"/>
        <svg data-field="celestial" x="29" y="31" width="32" height="32" viewBox="0 0 32 32" fill="#000" aria-hidden="true">${CELESTIAL_ICONS[card.celestial]}</svg>
        <text data-field="name" x="76" y="54" font-size="21" font-weight="700" fill="#000"></text>
        <circle cx="314" cy="47" r="21" fill="url(#${id}-ivory)" stroke="#000" stroke-width="2"/>
        <text data-field="number" x="314" y="55" text-anchor="middle" font-size="25" font-weight="700" fill="#000"></text>

        <!-- Art uses the stored live cells, not a runtime sequence generator. -->
        <rect x="23" y="82" width="314" height="236" fill="#182a32" stroke="#c1cecf"/>
        <rect x="27" y="86" width="306" height="228" fill="url(#${id}-art)" stroke="#000" stroke-width="1.5"/>
        <path d="M35 110V94H51 M309 94H325V110 M35 290V306H51 M309 306H325V290" fill="none" stroke="#000" stroke-width="1" opacity=".35"/>
        <g data-field="artShape" fill="#000"></g>

        <!-- Type line and one of four monochrome rarity symbols. -->
        <rect x="24" y="329" width="312" height="38" rx="9" fill="#182a32"/>
        <rect x="22" y="325" width="316" height="38" rx="9" fill="url(#${id}-ivory)" stroke="#000" stroke-width="2"/>
        <text data-field="typeLine" x="35" y="350" font-size="16" font-weight="700" fill="#000"></text>
        <g data-field="rarity" transform="translate(314 344)" aria-hidden="true">${RARITY_ICONS[card.rarity] || RARITY_ICONS.diamond}</g>

        <!-- Quiet lower panel; no rules text or extra mechanics added. -->
        <path d="M27 368H333V431Q333 450 314 450H46Q27 450 27 431Z" fill="url(#${id}-paper)" stroke="#1c3039" stroke-width="2"/>
        <path d="M34 375H326 M34 375V428Q34 443 48 443H247" fill="none" stroke="#fff" stroke-width="1"/>
        <rect x="252" y="431" width="87" height="40" rx="12" fill="#172831"/>
        <rect x="250" y="428" width="87" height="40" rx="12" fill="url(#${id}-ivory)" stroke="#000" stroke-width="2"/>
        <text data-field="stats" x="293.5" y="455" text-anchor="middle" font-size="24" font-weight="700" fill="#000"></text>

        <!-- Serial belongs to the black border, not the text panel. -->
        <text data-field="serial" x="23" y="487" font-size="10" fill="#fff" font-family="'IBM Plex Mono', ui-monospace, monospace" letter-spacing="1"></text>
        <path d="M247 483H335" stroke="#fff" stroke-width=".7" opacity=".35"/>
      </svg>`;

    const paint = (node, property, defaultInk = "#000") => {
      const highlighted = redFields.has(property);
      const ink = highlighted ? (property === "serial" ? SERIAL_RED : RED) : defaultInk;
      node.dataset.property = property;
      if (highlighted) node.dataset.highlighted = "true";
      node.setAttribute("fill", ink);
      node.setAttribute("color", ink);
    };
    const fitText = (node, value, availableWidth, baseSize, family = "Georgia", weight = "700") => {
      // Fit without dropping characters, including long future names/serials.
      const context = document.createElement("canvas").getContext("2d");
      context.font = `${weight} ${baseSize}px ${family}`;
      if (context.measureText(String(value)).width > availableWidth) {
        node.setAttribute("textLength", String(availableWidth));
        node.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
    };
    const setText = (field, value, availableWidth, baseSize, family = "Georgia") => {
      const node = element.querySelector(`[data-field="${field}"]`);
      node.textContent = String(value);
      fitText(node, value, availableWidth, baseSize, family, field === "serial" ? "400" : "700");
      paint(node, field, field === "serial" ? "#fff" : "#000");
    };
    const textPart = (parent, value, property) => {
      const span = document.createElementNS(SVG_NS, "tspan");
      span.textContent = value;
      paint(span, property);
      parent.append(span);
    };
    if (card.title) {
      const name = element.querySelector('[data-field="name"]');
      name.setAttribute("font-size", "14.5");
      for (const [slots, y, ending] of [[["A", "O"], 41, "-"], [["V", "S"], 59, ""]]) {
        const line = document.createElementNS(SVG_NS, "tspan");
        line.setAttribute("x", "76");
        line.setAttribute("y", String(y));
        textPart(line, card.title[slots[0]], `title.${slots[0]}`);
        line.append(" ");
        textPart(line, card.title[slots[1]], `title.${slots[1]}`);
        line.append(ending);
        fitText(line, line.textContent, 208, 14.5);
        name.append(line);
      }
    } else {
      setText("name", card.name, 208, 21);
    }
    setText("number", card.number, 33, 25);
    if (card.types) {
      const types = element.querySelector('[data-field="typeLine"]');
      textPart(types, card.types[0], "types.0");
      types.append(" / ");
      textPart(types, card.types[1], "types.1");
      fitText(types, types.textContent, 256, 16);
    } else {
      setText("typeLine", card.typeLine, 256, 16);
    }
    setText("stats", `${card.power}/${card.toughness}`, 71, 24);
    setText("serial", card.serial, 205, 10, "monospace");
    for (const field of ["celestial", "rarity", "artShape"]) paint(element.querySelector(`[data-field="${field}"]`), field);
    const art = element.querySelector('[data-field="artShape"]');
    if (card.artShape === "glider") {
      for (const [x, y] of card.gliderCells) {
        const cell = document.createElementNS(SVG_NS, "rect");
        cell.setAttribute("x", String(116 + x * 44));
        cell.setAttribute("y", String(136 + y * 44));
        cell.setAttribute("width", "40");
        cell.setAttribute("height", "40");
        art.append(cell);
      }
    } else {
      const circle = document.createElementNS(SVG_NS, "circle");
      for (const [attribute, value] of Object.entries({ cx: 180, cy: 200, r: 63 })) circle.setAttribute(attribute, String(value));
      art.append(circle);
    }
    element.querySelector("title").textContent = card.name;
    element.querySelector("desc").textContent = `${card.celestial === "sun" ? "Sun" : "Moon"}; number ${card.number}; ${card.artShape} art; ${card.rarity} rarity; type ${card.typeLine}; power ${card.power}, toughness ${card.toughness}; serial ${card.serial}.`;
    return element;
  }

  function createCardFigure(card, showNumber = true) {
    const figure = document.createElement("figure");
    figure.className = "card-preview-item";
    if (showNumber) {
      const label = document.createElement("figcaption");
      label.className = "card-preview-number";
      label.textContent = `CARD ${String(card.id).padStart(2, "0")}`;
      figure.append(label);
    }
    figure.append(createCard(card));
    return figure;
  }

  function mountCollection(root, cards) {
    root.innerHTML = `
      <section class="card-collection card-template-preview" aria-label="Pulled cards">
        <div class="card-collection-grid card-template-grid"></div>
      </section>`;
    const grid = root.querySelector(".card-collection-grid");
    const ids = new Set();
    function append(card) {
      if (ids.has(card.id)) return;
      ids.add(card.id);
      grid.append(createCardFigure(card, false));
    }
    for (const card of cards) append(card);
    return Object.freeze({ append });
  }

  function mountPreview(root) {
    root.innerHTML = `
      <section class="card-template-preview" aria-labelledby="card-template-heading">
        <header class="card-template-header">
          <p class="card-template-kicker">FIXED DECK · 100 CARDS</p>
          <h2 id="card-template-heading">The first five cards</h2>
          <p>Cards 1–5 in order. Design preview only; this does not change your collection.</p>
        </header>
        <div class="card-template-grid"></div>
      </section>`;
    const grid = root.querySelector(".card-template-grid");
    for (const card of window.PUZZLE_CARD_DECK.cards.slice(0, 5)) {
      grid.append(createCardFigure(card));
    }
  }

  return Object.freeze({ TEMPLATE_CARD, createCard, mountPreview, mountCollection });
})();
