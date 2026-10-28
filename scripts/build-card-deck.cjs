"use strict";

// Offline preparation only. The deployed site reads the saved cards-data.js.
const { createHash } = require("node:crypto");
const SEED = "puzzle-26-fixed-card-deck-v1";
const WORDS = Object.freeze({
  A: ["Crimson", "Azure", "Jade", "Celestial", "Sacred", "Moonlit", "Blazing", "Shadowed", "Thunderous", "Cursed"],
  O: ["Katana", "Shuriken", "Talisman", "Lantern", "Mask", "Scroll", "Bell", "Fan", "Mirror", "Jewel"],
  V: ["Wielding", "Guarding", "Stealing", "Carrying", "Seeking", "Collecting", "Forging", "Sealing", "Throwing", "Hoarding"],
  S: ["Samurai", "Ninja", "Ronin", "Oni", "Tengu", "Kitsune", "Kappa", "Tanuki", "Miko", "Dragon"],
});
const TYPES = ["Human", "Dragon", "Beast", "Devil", "Attacker", "Physical", "Healer", "Balanced", "Mystic"];
const HIGHLIGHTS = Object.freeze({
  stats: 3, celestial: 1, artShape: 5, number: 4,
});

// Rejection sampling avoids modulo bias; each field has an independent stream.
function randomIndex(cardNumber, field, count) {
  const limit = Math.floor(2 ** 32 / count) * count;
  for (let attempt = 0; ; attempt++) {
    const bytes = createHash("sha256").update(JSON.stringify([SEED, cardNumber, field, attempt])).digest();
    const value = bytes.readUInt32BE();
    if (value < limit) return value % count;
  }
}

function kolakoski(count) {
  const values = [1, 2, 2];
  let digit = 1;
  for (let run = 2; values.length < count; run++) {
    values.push(...Array(values[run]).fill(digit));
    digit = 3 - digit;
  }
  return values.slice(0, count);
}

function eDigits(count) {
  // Exact integer interval for sum(1/k!). The floor losses and omitted tail
  // fit inside the interval; require both endpoints to share the entire prefix.
  const scale = 10n ** BigInt(count + 20);
  let lower = scale;
  let factorial = 1n;
  let k = 1n;
  for (; ; k++) {
    factorial *= k;
    const term = scale / factorial;
    lower += term;
    if (term === 0n) break;
  }
  const upper = lower + k + 2n;
  const divisor = 10n ** 21n; // Include the leading integer digit 2.
  if (lower / divisor !== upper / divisor) throw new Error("Insufficient e precision");
  return String(lower / divisor).split("").map(Number);
}

function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

function goldbachPairs(even) {
  const pairs = [];
  for (let p = 2; p <= even / 2; p++) {
    if (isPrime(p) && isPrime(even - p)) pairs.push([p, even - p]);
  }
  if (!pairs.length) throw new Error(`No Goldbach pair for ${even}`);
  return pairs;
}

function lifeStep(cells) {
  const alive = new Set(cells.map(([x, y]) => `${x},${y}`));
  const neighbors = new Map();
  for (const [x, y] of cells) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const key = `${x + dx},${y + dy}`;
      neighbors.set(key, (neighbors.get(key) || 0) + 1);
    }
  }
  return [...neighbors].filter(([key, count]) => count === 3 || (count === 2 && alive.has(key)))
    .map(([key]) => key.split(",").map(Number));
}

function normalizeCells(cells) {
  const minX = Math.min(...cells.map(cell => cell[0]));
  const minY = Math.min(...cells.map(cell => cell[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

function gliderPhases() {
  let cells = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
  const phases = [];
  for (let generation = 0; generation < 4; generation++) {
    phases.push(normalizeCells(cells));
    cells = lifeStep(cells);
  }
  if (JSON.stringify(normalizeCells(cells)) !== JSON.stringify(phases[0])) throw new Error("Glider did not repeat");
  return phases;
}

function buildDeck({ distinctTypes, raritySymbols }) {
  if (typeof distinctTypes !== "boolean") throw new Error("Choose whether card types must differ.");
  if (!Array.isArray(raritySymbols) || raritySymbols.length !== 4) throw new Error("Choose four rarity symbols.");
  const symbols = kolakoski(100);
  const digits = eDigits(100);
  const phases = gliderPhases();
  const highlights = { ...HIGHLIGHTS };
  const cards = Array.from({ length: 100 }, (_, index) => {
    const id = index + 1;
    const title = Object.fromEntries(Object.entries(WORDS).map(([slot, words]) => [slot, words[randomIndex(id, `title.${slot}`, words.length)]]));
    const pairs = goldbachPairs(2 * id + 2);
    const [power, toughness] = pairs[randomIndex(id, "goldbach", pairs.length)];
    const firstType = TYPES[randomIndex(id, "types.0", TYPES.length)];
    const secondOptions = distinctTypes ? TYPES.filter(type => type !== firstType) : TYPES;
    const types = [firstType, secondOptions[randomIndex(id, "types.1", secondOptions.length)]];
    return {
      id, celestial: symbols[index] === 1 ? "sun" : "moon", number: digits[index],
      title, name: `${title.A} ${title.O}-${title.V} ${title.S}`,
      artShape: "glider", gliderPhase: index % 4, gliderCells: phases[index % 4],
      rarity: raritySymbols[randomIndex(id, "rarity", 4)], types, typeLine: types.join(" / "),
      power, toughness, serial: String(randomIndex(id, "serial", 1000)).padStart(3, "0"),
      redFields: Object.keys(highlights).filter(field => highlights[field] === id),
    };
  });
  return { version: 1, seed: SEED, count: cards.length, exhaustedMessage: "Out of eggs!", distinctTypes, raritySymbols, highlights, cards };
}

function serializeDeck(deck) {
  const metadata = { ...deck };
  delete metadata.cards;
  const data = JSON.stringify(metadata, null, 2).slice(0, -2) + ',\n  "cards": [\n' + deck.cards.map(card => `    ${JSON.stringify(card)}`).join(',\n') + '\n  ]\n}';
  return '"use strict";\n\n// Fixed card order. Prepared offline by scripts/build-card-deck.cjs.\n// All math, random-looking fields, and highlight assignments are stored here.\nwindow.PUZZLE_CARD_DECK = (() => {\n  const deck = ' + data + ';\n  const freeze = value => {\n    if (value && typeof value === "object") {\n      Object.values(value).forEach(freeze);\n      Object.freeze(value);\n    }\n    return value;\n  };\n  return freeze(deck);\n})();\n';
}

module.exports = { buildDeck, serializeDeck, kolakoski, eDigits, goldbachPairs, gliderPhases, lifeStep, normalizeCells, isPrime, WORDS, TYPES, HIGHLIGHTS };

if (require.main === module) {
  // Arguments are explicit so regenerating cannot silently choose missing rules.
  const options = JSON.parse(process.argv[2] || "{}");
  process.stdout.write(serializeDeck(buildDeck(options)));
}
