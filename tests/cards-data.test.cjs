"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildDeck, serializeDeck, WORDS, TYPES } = require("../scripts/build-card-deck.cjs");
const source = readFileSync(path.join(__dirname, "../cards-data.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const deck = JSON.parse(JSON.stringify(sandbox.window.PUZZLE_CARD_DECK));
// Reference prefixes: https://oeis.org/A000002 and https://oeis.org/A001113.
const KOLAKOSKI_100 = [1,2,2,1,1,2,1,2,2,1,2,2,1,1,2,1,1,2,2,1,2,1,1,2,1,2,2,1,1,2,1,1,2,1,2,2,1,2,2,1,1,2,1,2,2,1,2,1,1,2,1,1,2,2,1,2,2,1,1,2,1,2,2,1,2,2,1,1,2,1,1,2,1,2,2,1,2,1,1,2,2,1,2,2,1,1,2,1,2,2,1,2,2,1,1,2,1,1,2,2];
const E_100 = "2718281828459045235360287471352662497757247093699959574966967627724076630353547594571382178525166427";
const EXPECTED_HIGHLIGHTS = { stats: 3, celestial: 1, artShape: 5, number: 4 };

test("100 saved cards reproduce byte-for-byte and are deeply immutable at runtime", () => {
  assert.equal(deck.count, 100);
  assert.equal(deck.cards.length, 100);
  const rebuilt = buildDeck({ distinctTypes: true, raritySymbols: ["circle", "triangle", "diamond", "star"] });
  assert.equal(serializeDeck(rebuilt), source);
  assert.equal(Object.isFrozen(sandbox.window.PUZZLE_CARD_DECK), true);
  assert.equal(Object.isFrozen(sandbox.window.PUZZLE_CARD_DECK.cards[0].title), true);
  assert.equal(Object.isFrozen(sandbox.window.PUZZLE_CARD_DECK.cards[0].gliderCells[0]), true);
  assert.equal(deck.exhaustedMessage, "Out of eggs!");
});

test("every sequence-driven field is correct, including 100 digits of e and sums 4 through 202", () => {
  assert.deepEqual(deck.cards.map(card => card.celestial === "sun" ? 1 : 2), KOLAKOSKI_100);
  assert.equal(deck.cards.map(card => card.number).join(""), E_100);
  const prime = Array(203).fill(true);
  prime[0] = prime[1] = false;
  for (let n = 2; n < prime.length; n++) if (prime[n]) {
    for (let multiple = 2 * n; multiple < prime.length; multiple += n) prime[multiple] = false;
  }
  const phases = [
    [[1,0],[2,1],[0,2],[1,2],[2,2]],
    [[0,0],[2,0],[1,1],[2,1],[1,2]],
    [[2,0],[0,1],[2,1],[1,2],[2,2]],
    [[0,0],[1,1],[2,1],[0,2],[1,2]],
  ];
  for (const [index, card] of deck.cards.entries()) {
    assert.equal(card.id, index + 1);
    assert.equal(prime[card.power] && prime[card.toughness], true, `card ${card.id}: both stats prime`);
    assert.equal(card.power + card.toughness, 2 * card.id + 2);
    assert.equal(card.power <= card.toughness, true);
    assert.equal(card.artShape, "glider");
    assert.equal(card.gliderPhase, index % 4);
    assert.deepEqual(card.gliderCells, phases[index % 4]);
  }
});

test("random-looking values use the specified banks, Miko, distinct types, and three-digit serials", () => {
  for (const card of deck.cards) {
    for (const slot of ["A", "O", "V", "S"]) assert.equal(WORDS[slot].includes(card.title[slot]), true);
    assert.equal(card.name, `${card.title.A} ${card.title.O}-${card.title.V} ${card.title.S}`);
    assert.equal(card.name.includes("Onmyoji"), false);
    assert.equal(card.types.length, 2);
    assert.notEqual(card.types[0], card.types[1]);
    assert.equal(card.types.every(type => TYPES.includes(type)), true);
    assert.equal(card.typeLine, card.types.join(" / "));
    assert.match(card.serial, /^\d{3}$/);
    assert.equal(Number(card.serial) >= 0 && Number(card.serial) <= 999, true);
    assert.equal(deck.raritySymbols.includes(card.rarity), true);
  }
  assert.equal(new Set(deck.cards.map(card => card.rarity)).size, 4);
  assert.equal(deck.cards.some(card => card.title.S === "Miko"), true);
});

test("only sequence-driven properties are red, each on its specified card", () => {
  assert.deepEqual(deck.highlights, EXPECTED_HIGHLIGHTS);
  for (const [field, cardNumber] of Object.entries(EXPECTED_HIGHLIGHTS)) {
    assert.deepEqual(deck.cards.filter(card => card.redFields.includes(field)).map(card => card.id), [cardNumber]);
  }
  for (const card of deck.cards) {
    assert.equal(new Set(card.redFields).size, card.redFields.length);
    assert.equal(card.redFields.every(field => EXPECTED_HIGHLIGHTS[field] === card.id), true);
  }
});
