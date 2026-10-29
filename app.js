"use strict";

const STORAGE_KEY = "puzzle-26:v1:progress";

const ANSWER_HASHES = Object.freeze({
  identity:
    "a423709cd1728ed4604e108f32e28d20b0007598d5eff2418c1cd49064246597",
  puzzle:
    "36d2f95ead934474c7eed1790d3cf3f01398422936081f8397653ee9c18a66b7",
  pad:
    "8b7373b7fecf4a0143f91285e19b4d8f960422c506f7757fa735debdff7ce106",
  ecc:
    "0fac4a5de9cf560c7a05935e83ea142363a06e9db51edea880adba9e6ae9f3a5",
  polyalphabetic:
    "534d327aed5dff70beca7f78fcd719cb7ae15a9be1d22ef8f98df695ba66f96d",
  microdot:
    "34f4461607521e62b2645b505e7af2267f46a86bc29770063f6710c03f4f1152",
  sts2:
    "7824ee48ca905f75ff24da6b665addec7a61c98de0923ce111eb795f1fb48203",
  blackMeta:
    "87161524ff2c59d152aad50d9521c0cad71e332db401f1cf5bd3d3de3f8bc545",
  greenMeta:
    "50673d02ac6324d4cfa82c941caed56709489e70bd5402e1e3520c25d1100b8e",
  reactionAssembly:
    "404dc00b9e91a183f3295be744c99f0ef15eacb1ea254a81c3ceada0693ed872",
  redMeta:
    "0a265c722a0c3e340fd3e5c07e8ddd40a86eabb50e37df1d4a3404efc0884e25",
  blueMeta:
    "94a67dd5085ec35bcc136711885e1ce59462dad68c5f107bae78d5e787d64783",
  burialLocations:
    "60b823e137f54f0db3b8783ef6b2ede0e52014ba01ff77dc340428d146a2d134",
  artSet:
    "8cd3ff7de9fe3d90570b2fdd3abe74862bb02804c730fcae3df46fb746d4a15a",
  michelinGeoguesser:
    "16441fe6c5fe0bee73eab1270ccc8ed3a07ec82b281886b5a2478da7269f9af5",
  whiteMeta:
    "9bae77d317b7d9a92c728ddd8bcc3a7b3845ad6e8bcab1c14b21bd6c38d721ca",
  rhythmGame:
    "177c30d5d0544b97c2030fad7a6caedd2a5dd8aa2fad27d8620779e177dd6438",
  jackBeNimble:
    "14222023a7fa17ec160205485b95317ad8d39092a2f5c960ef6a363e8cf4ce07",
  doubleImperfectScore:
    "cd9fcbf0c0b40bf7cdb35b1bb9b377dfdb180e0c8aa602fa903c522f6eebcae7",
  crossword:
    "da9ce84c9e9ede94381b7130f71ebb8c42cfaccf32852650a083f74a9cd8403d",
  experiences:
    "6affdae3b3c1aa6aa7689e9b6a7b3225a636aa1ac0025f490cca1285ceaf1487",
});

const PUZZLE_TIERS = Object.freeze([
  "common",
  "uncommon",
  "rare",
  "mythic",
]);

const PUZZLE_TIERS_BY_POSITION = Object.freeze(["common", "common", "uncommon", "rare"]);

const CATEGORY_DEFINITIONS = [
  { id: "white", name: "WHITE", color: "#e5d69d", ink: "#241c12", inscription: "^'ə'wgwəww-θpoŋkp." },
  { id: "blue", name: "BLUE", color: "#438e9d", ink: "#ffffff", inscription: "^bən'-ǧytπt." },
  { id: "black", name: "BLACK", color: "#37382b", ink: "#ffffff", inscription: "^əxťeķibrs-ganwr." },
  { id: "red", name: "RED", color: "#bd4e2d", ink: "#ffffff", inscription: "^'ɴuŋəža-huqtkeɴt." },
  { id: "green", name: "GREEN", color: "#678b3c", ink: "#ffffff", inscription: "^vriθkv-ɢiss." },
  {
    id: "phyrexian", name: "PHYREXIAN", color: "#a5a9b4", ink: "#241c12",
    symbol: "assets/phyrexian-symbol.png",
    inscription: "^ǩaπa-hπŋotux-ķoɮǩum-ǩaπaxə-ɢţrɒsad-šdeχud.",
    wrapInscription: true,
  },
];

// Reconstructed title translations from chat 01a1676b-ca5b-7932-aa40-74f4ea79c981.
// English names are authoring metadata, not captions or accessible translations.
const PHYREXIAN_PUZZLE_TITLES = [
  { name: "Behold Phyrexian language", nameScript: "^ǩaπa-φyrxɮɒ'ɣ-χtena." },
  { name: "Distribute matrices", nameScript: "^lo-žɒɒðk-χɬkevuk." },
  { name: "Create a color circle", nameScript: "^lo-sopšikthibd-naǩum." },
];

const DOUBLE_IMPERFECT_SCORE_GRADING = {
  // Keep the revealed answer and ANSWER_HASHES.doubleImperfectScore in sync.
  revealedAnswer: "GREEN",
  parts: [
    { id: "teams", taskId: "teams-2015", title: "Teams", year: 2015 },
    { id: "railroad", taskId: "railroad-2016", title: "Roller Coaster Railroad", year: 2016 },
  ],
};

const RED_CROSSWORD_CLUES = {
  across: [
    { number: 1, clue: "City home to the world’s largest baseball bat" },
    { number: 5, clue: "City famous for a 35-foot fork once billed as the world’s largest" },
    { number: 9, clue: "___ City, home of the world’s largest ball of sisal twine" },
    { number: 13, clue: "___ Monument, the world’s tallest freestanding stone structure" },
    { number: 14, clue: "City home to the world’s largest military aviation museum" },
    { number: 15, clue: "The world’s longest undeveloped stretch of barrier island" },
    { number: 17, clue: "Lake ___, crossed by the world’s longest continuous bridge over water" },
    { number: 18, clue: "The world’s tallest mountain from base to summit" },
    { number: 19, clue: "Town with Guinness records for the world’s largest rocking chair and mailbox" },
    { number: 20, clue: "Beaver-branded chain containing the world’s largest convenience store" },
    { number: 23, clue: "The world’s largest museum, education, and research complex" },
    { number: 24, clue: "The world’s largest active volcano" },
    { number: 25, clue: "___ Cave, the world’s longest known cave system" },
    { number: 26, clue: "City containing the world’s largest factory by volume" },
    { number: 27, clue: "City whose potato museum displays a Guinness-record giant potato crisp" },
  ],
  down: [
    { number: 2, clue: "General ___, the world’s largest tree by trunk volume" },
    { number: 3, clue: "The world’s largest freshwater lake by surface area" },
    { number: 4, clue: "Home of the world’s largest fully steerable telescope" },
    { number: 6, clue: "Organisms responsible for the Guinness-record brightest bioluminescent bay" },
    { number: 7, clue: "The world’s largest piedmont glacier" },
    { number: 8, clue: "Site of the world’s largest gypsum dunefield" },
    { number: 10, clue: "___ Monument, the world’s tallest war memorial" },
    { number: 11, clue: "Town home to the World’s Largest Truckstop" },
    { number: 12, clue: "The world’s tallest active geyser" },
    { number: 16, clue: "Site of the world’s highest officially recorded air temperature" },
    { number: 17, clue: "What a 30-foot “world’s largest” roadside sculpture represents" },
    { number: 21, clue: "Library of ___, the world’s largest library" },
    { number: 22, clue: "Material making up the world’s largest ball of its kind" },
  ],
};

const SITE_CONFIG = {
  categories: CATEGORY_DEFINITIONS.map((category) => ({
    ...category,
    unlock: { type: "always" },
    lockedBehavior: "disabled",
    // Keep IDs stable when reordering so browser-local progress follows its puzzle.
    puzzles: (category.id === "phyrexian" ? [1, 2, 3] : category.id === "blue" ? [1, 4, 2, 3] : category.id === "green" ? [2, 1, 3, 4] : category.id === "red" ? [3, 2, 1, 4] : [1, 2, 3, 4]).map((originalNumber, index) => ({
      id: `${category.id}-${originalNumber}`,
      name: category.id === "green" ? "" : "PUZZLE",
      subtitle: "subtitle",
      showSubtitle: category.id !== "green" && category.id !== "phyrexian",
      ...(category.id === "phyrexian" ? PHYREXIAN_PUZZLE_TITLES[index] : {}),
      number: index + 1,
      tier: category.id === "phyrexian" ? "mythic" : PUZZLE_TIERS_BY_POSITION[index],
      answerHash: ANSWER_HASHES.puzzle,
      unlock: { type: "always" },
      lockedBehavior: "disabled",
      ...(category.id === "phyrexian" && originalNumber === 1 ? {
        letterEncoding: PHYREXIAN_ENCODING_PUZZLE,
        answerHash: PHYREXIAN_ENCODING_PUZZLE.answerHash,
      } : {}),
      ...(category.id === "phyrexian" && originalNumber === 2 ? {
        letterTransformations: PHYREXIAN_TRANSFORMATION_PUZZLE,
        answerHash: PHYREXIAN_TRANSFORMATION_PUZZLE.answerHash,
      } : {}),
      ...(category.id === "phyrexian" && originalNumber === 3 ? {
        factionPuzzle: true,
        answerSubmission: false,
        answerHash: null,
      } : {}),
      ...(category.id === "white" && originalNumber === 1 ? {
        name: "All Around Me Are...",
        subtitle: "Old dudes",
        answerHash: ANSWER_HASHES.burialLocations,
        images: [
          { src: "assets/white-01-portrait-01.jpg", alt: "Portrait 1: a man in a red cloak riding a rearing horse in the mountains." },
          { src: "assets/white-01-portrait-02.jpg", alt: "Portrait 2: a crowned, bearded man holding a sword and an orb." },
          { src: "assets/white-01-portrait-03.jpg", alt: "Portrait 3: a haloed man in a black and white habit holding an open book, with a radiant star on his chest." },
          { src: "assets/white-01-portrait-04.jpg", alt: "Portrait 4: a young man in a black cap and dark clothing looking over his shoulder." },
          { src: "assets/white-01-portrait-05.jpg", alt: "Portrait 5: a man in profile wearing a large white turban and red clothing." },
          { src: "assets/white-01-portrait-06.jpg", alt: "Portrait 6: a black-and-white photograph of a seated man in a dark suit, facing left." },
          { src: "assets/white-01-portrait-07.jpg", alt: "Portrait 7: a white-haired man in a brown coat holding a hat." },
        ],
      } : {}),
      ...(category.id === "white" && originalNumber === 2 ? {
        name: "That Belongs in a Museum",
        subtitle: "Good thing they are",
        answerHash: ANSWER_HASHES.artSet,
        imageLayout: "grid",
        // Fixed shuffled order: never reshuffle on navigation or reload.
        images: [
          { src: "assets/white-02-artwork-01.jpg", alt: "Fish Market" },
          { src: "assets/white-02-artwork-02.jpg", alt: "Susanna and the Elders" },
          { src: "assets/white-02-artwork-03.jpg", alt: "La Belle Jardinière" },
          { src: "assets/white-02-artwork-04.jpg", alt: "Bacchanal: A Faun Teased by Children" },
          { src: "assets/white-02-artwork-05.jpg", alt: "The Mystic Marriage of Saint Catherine" },
          { src: "assets/white-02-artwork-06.jpg", alt: "Apollo and Daphne" },
          { src: "assets/white-02-artwork-07.jpg", alt: "A Dance in the Country" },
          { src: "assets/white-02-artwork-08.jpg", alt: "Saint Jerome and the Angel" },
          { src: "assets/white-02-artwork-09.jpg", alt: "The Resurrected Christ" },
          { src: "assets/white-02-artwork-10.jpg", alt: "Venus and Cupid" },
        ],
      } : {}),
      ...(category.id === "white" && originalNumber === 3 ? {
        name: "Classic Angela",
        subtitle: "She'd love these views",
        answerHash: ANSWER_HASHES.michelinGeoguesser,
        images: [
          { src: "assets/white-03-scene-01.png", alt: "Scene 1: a city street with brick buildings, exterior fire escapes, and parked cars." },
          { src: "assets/white-03-scene-02.png", alt: "Scene 2: narrow streets around a yellow corner building with shuttered windows." },
          { src: "assets/white-03-scene-03.png", alt: "Scene 3: a landscaped drive between shingled buildings, with a green roof and wooded hills." },
          { src: "assets/white-03-scene-04.png", alt: "Scene 4: a leafy city park with benches, bicycles, and concrete barriers." },
          { src: "assets/white-03-scene-05.png", alt: "Scene 5: a narrow street lined with pale stone buildings, parked cars, and construction scaffolding." },
          { src: "assets/white-03-scene-06.png", alt: "Scene 6: a narrow lane between plaster and wooden walls, with trees and overhead cables." },
        ],
      } : {}),
      ...(category.id === "white" && originalNumber === 4 ? {
        name: "The One Left Out",
        subtitle: "But beloved all the same",
        answerHash: ANSWER_HASHES.whiteMeta,
        statement: "4 Blood Crypt\n4 Boros Reckoner\n4 Cartel Aristocrat\n3 Cavern of Souls\n4 Champion of the Parish\n1 Clifftop Retreat\n4 Doomed Traveler\n4 Falkenrath Aristocrat\n4 Godless Shrine\n4 Isolated Chapel\n3 Knight of Infamy\n2 Lingering Souls\n4 Orzhov Charm\n3 Plains\n1 Restoration Angel\n4 Sacred Foundry\n2 Silverblade Paladin\n2 Skirsdag High Priest\n1 Vault of the Archangel\n2 Zealous Conscripts\n\nSideboard (15)\n2 Blasphemous Act\n2 Lingering Souls\n1 Mentor of the Meek\n2 Obzedat, Ghost Council\n2 Rest in Peace\n1 Skirsdag High Priest\n2 Sorin, Lord of Innistrad\n3 Tragic Slip",
      } : {}),
      ...(category.id === "blue" && originalNumber === 1 ? {
        name: "Jack be Nimble",
        subtitle: "He'll also need to be a bit clever this time",
        answerHash: ANSWER_HASHES.jackBeNimble,
        interactive: "nimGame",
      } : {}),
      ...(category.id === "blue" && originalNumber === 4 ? {
        name: "Double Trouble",
        subtitle: "It would be so cringe if you cheated on this one",
        grading: DOUBLE_IMPERFECT_SCORE_GRADING,
        answerHash: ANSWER_HASHES.doubleImperfectScore,
      } : {}),
      ...(category.id === "blue" && originalNumber === 2 ? {
        name: "Endless Gacha",
        subtitle: "Average gacha addict spending habits",
        answerHash: ANSWER_HASHES.pad,
        interactive: "rareEggMachine",
      } : {}),
      ...(category.id === "blue" && originalNumber === 3 ? {
        name: "Fields of Knowledge",
        subtitle: "Where we put the pedal to the medal",
        answerHash: ANSWER_HASHES.blueMeta,
        statement: "4 Drowner of Hope\n4 Eldrazi Mimic\n3 Eldrazi Obligator\n4 Eldrazi Skyspawner\n4 Endless One\n4 Reality Smasher\n2 Ruination Guide\n4 Thought-Knot Seer\n4 Vile Aggregate\n3 Dismember\n3 Cavern of Souls\n4 Eldrazi Temple\n4 Eye of Ugin\n1 Gemstone Caverns\n2 Island\n4 Scalding Tarn\n4 Shivan Reef\n2 Steam Vents\n\nSideboard\n2 Chalice of the Void\n2 Gut Shot\n3 Hurkyl's Recall\n1 Ratchet Bomb\n2 Relic of Progenitus\n1 Spellskite\n3 Stubborn Denial\n1 Tomb of the Spirit Dragon",
      } : {}),
      ...(category.id === "green" && originalNumber === 1 ? { interactive: "animalMatching", answerHash: null } : {}),
      ...(category.id === "green" && originalNumber === 2 ? {
        interactive: "reactionAssembly",
        answerHash: ANSWER_HASHES.reactionAssembly,
        answerNeutralLetters: "I",
      } : {}),
      ...(category.id === "green" && originalNumber === 3 ? { interactive: "rhythmGame", answerHash: ANSWER_HASHES.rhythmGame } : {}),
      ...(category.id === "green" && originalNumber === 4 ? {
        answerHash: ANSWER_HASHES.greenMeta,
        statement: "4 Brushland\n2 Dust Bowl\n16 Plains\n4 Rishadan Port\n2 Defiant Falcon\n2 Defiant Vanguard\n4 Lin Sivvi, Defiant Hero\n3 Longbow Archer\n4 Ramosian Sergeant\n2 Ramosian Sky Marshal\n1 Rebel Informer\n3 Steadfast Guard\n1 Thermal Glider\n4 Wax // Wane\n4 Chimeric Idol\n4 Parallax Wave\n\nSIDEBOARD\n4 Armageddon\n1 Defiant Vanguard\n1 Lightbringer\n3 Mageta the Lion\n3 Seal of Cleansing\n3 Wrath of God",
      } : {}),
      ...(category.id === "red" && originalNumber === 1 ? {
        name: "Permitted Travel",
        subtitle: "Size is everything, no matter what they say",
        answerHash: ANSWER_HASHES.crossword,
        image: {
          src: "assets/red-01-crossword.svg",
          alt: "Blank numbered crossword grid with bold-outlined squares.",
        },
        crossword: RED_CROSSWORD_CLUES,
      } : {}),
      ...(category.id === "red" && originalNumber === 2 ? {
        name: "To Sum Up Our Experiences?",
        subtitle: "I just naturally know my way around",
        answerHash: ANSWER_HASHES.experiences,
        // Shuffled once; keep the same order across navigation and reloads.
        hints: [
          "Ol reliable, but toss the jogi gui",
          "Puffy apartment tour treat",
          "Solid clubbing",
          "Safe harbor after circumnavigation",
          "All aboard the fast way back to 395",
          "How to make a hollow glazed cream tube",
        ],
      } : {}),
      ...(category.id === "red" && originalNumber === 3 ? {
        name: "Aspire for Greatness",
        subtitle: "It's so much better to route this way",
        answerHash: ANSWER_HASHES.sts2,
        image: {
          src: "assets/red-03-sts2.png",
          alt: "STS2 puzzle: rows of colored and empty circles above an empty crossword grid.",
        },
      } : {}),
      ...(category.id === "red" && originalNumber === 4 ? {
        name: "Skill Based Game",
        subtitle: "It's important to practice",
        answerHash: ANSWER_HASHES.redMeta,
        statement: "2 Aether Hub\n4 Canyon Slough\n4 Dragonskull Summit\n14 Mountain\n1 Swamp\n4 Bomat Courier\n2 Glorybringer\n4 Goblin Chainwhirler\n2 Hazoret the Fervent\n2 Kari Zev, Skyship Raider\n2 Pia Nalaar\n2 Rekindling Phoenix\n4 Scrapheap Scrounger\n3 Abrade\n1 Cut // Ribbons\n2 Doomfall\n2 Magma Spray\n2 Chandra, Torch of Defiance\n2 Heart of Kiran\n1 Karn, Scion of Urza\n\nSIDEBOARD\n3 Chandra's Defeat\n1 Chandra, Torch of Defiance\n2 Doomfall\n2 Duress\n2 Karn, Scion of Urza\n1 Magma Spray\n1 Pia Nalaar\n1 Siege-Gang Commander\n1 Sorcerous Spyglass\n1 The Eldest Reborn",
      } : {}),
      ...(category.id === "black" && originalNumber === 1 ? {
        name: "Very Weak",
        subtitle: "Julian blew my mind with this one back in the day",
        answerHash: ANSWER_HASHES.polyalphabetic,
        statementLayout: "aligned",
        statement: "Jt drvum jf a gufjt idcjgfwc biau winbm uhshf ynwqlf kbyymo tp kben tffu winrz noclmnb iu hppf cxlby – xkp jam uhfb srwojnh?\nI_ _____ b_ _ _____ ac_____t ____ t___e _____ ____l_ ____e_ __ ___e ____ ___i_ _______ a_ ____ ___b_ _ ___ ___ ____ __ng____",
      } : {}),
      ...(category.id === "black" && originalNumber === 2 ? {
        name: "ADFGVXCODE",
        subtitle: "You fucking donkey",
        answerHash: ANSWER_HASHES.microdot,
        microdot: { image: "assets/black-02-dot.svg", word: "fucking" },
      } : {}),
      ...(category.id === "black" && originalNumber === 3 ? {
        name: "A Six-Foot Thick Wooden Door",
        subtitle: "Hope your bank uses something else",
        answerHash: ANSWER_HASHES.ecc,
        statement: `A = (164, 881)
B = (1665, 1233)
G = (10, 13)
E: y^2 = x^3 + 3x - 861
p = 11287`,
      } : {}),
      ...(category.id === "black" && originalNumber === 4 ? {
        name: "The Declaration of Independence",
        subtitle: "Just some innocent looking reading material",
        answerHash: ANSWER_HASHES.blackMeta,
        statement: "2 Pestermite\n4 Serum Visions\n4 Deceiver Exarch\n4 Lightning Bolt\n1 Desolate Lighthouse\n2 Vendilion Clique\n3 Steam Vents\n1 Flame Slash\n1 Stomping Ground\n4 Misty Rainforest\n1 Mountain\n5 Island\n4 Splinter Twin\n4 Sulfur Falls\n1 Dispel\n2 Cryptic Command\n2 Electrolyze\n4 Scalding Tarn\n2 Spell Snare\n4 Remand\n1 Tectonic Edge\n1 Peek\n3 Snapcaster Mage\n\nSIDEBOARD\n1 Ancient Grudge\n1 Anger of the Gods\n2 Blood Moon\n1 Dispel\n1 Flame Slash\n1 Jace, Architect of Thought\n2 Keranos, God of Storms\n1 Negate\n1 Pyroclasm\n1 Shatterstorm\n2 Spellskite\n1 Threads of Disloyalty",
      } : {}),
    })),
  })),
};

const app = document.querySelector("#app");
const helpButton = document.querySelector("#help-button");
const helpDialog = document.querySelector("#help-dialog");
const helpCloseButton = document.querySelector("#help-close");
const clearStateButton = document.querySelector("#clear-state");

let state = loadState();
let gradingController = null;
let unmountGrading = null;
let unmountEggMachine = null;
let unmountAssembly = null;
let assemblyResources = null;
let animalResources = null;
let unmountAnimals = null;

function loadAnimalResources() {
  if (!animalResources) {
    const load = (path, style = false) => new Promise((resolve, reject) => {
      const element = document.createElement(style ? "link" : "script");
      if (style) { element.rel = "stylesheet"; element.href = path; }
      else element.src = path;
      element.onload = resolve;
      element.onerror = () => { element.remove(); reject(new Error("Animal puzzle resources could not be loaded.")); };
      document.head.append(element);
    });
    animalResources = Promise.all([
      load("games/animals/board.css", true),
      load("games/animals/data.js").then(() => load("games/animals/board.js")),
    ]).catch(error => { animalResources = null; throw error; });
  }
  return animalResources;
}

function disposeAnimals() {
  unmountAnimals?.();
  unmountAnimals = null;
}

function loadAssemblyResources() {
  if (!assemblyResources) {
    const load = (path, style = false) => new Promise((resolve, reject) => {
      const element = document.createElement(style ? "link" : "script");
      if (style) { element.rel = "stylesheet"; element.href = path; }
      else element.src = path;
      element.onload = resolve;
      element.onerror = () => { element.remove(); reject(new Error("Assembly resources could not be loaded.")); };
      document.head.append(element);
    });
    assemblyResources = Promise.all([
      load("games/assembly/board.css", true),
      load("games/assembly/pieces.js").then(() => load("games/assembly/board.js")),
    ]).catch(error => { assemblyResources = null; throw error; });
  }
  return assemblyResources;
}

function disposeAssembly() {
  unmountAssembly?.();
  unmountAssembly = null;
}

function createDefaultState() {
  return {
    version: 1,
    identityVerified: false,
    puzzles: {},
  };
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultState();
    }

    const parsed = JSON.parse(stored);
    return {
      version: 1,
      identityVerified: parsed.identityVerified === true,
      puzzles:
        parsed.puzzles && typeof parsed.puzzles === "object"
          ? parsed.puzzles
          : {},
    };
  } catch {
    return createDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getPuzzleState(puzzleId) {
  const puzzleState = state.puzzles[puzzleId];
  return {
    solved: puzzleState?.solved === true,
    attempts: Array.isArray(puzzleState?.attempts)
      ? puzzleState.attempts.filter((attempt) => typeof attempt === "string")
      : [],
    ...(typeof puzzleState?.correctAnswer === "string" ? { correctAnswer: puzzleState.correctAnswer } : {}),
    grading: puzzleState?.grading && typeof puzzleState.grading === "object"
      ? puzzleState.grading : {},
    ...(puzzleState?.assembly ? { assembly: puzzleState.assembly } : {}),
    ...(puzzleState?.matching ? { matching: puzzleState.matching } : {}),
    eggMachine: {
      cardsPulled: Number.isInteger(puzzleState?.eggMachine?.cardsPulled)
        ? Math.max(0, Math.min(window.PUZZLE_CARD_DECK.cards.length, puzzleState.eggMachine.cardsPulled)) : 0,
    },
  };
}

function recordAttempt(puzzleId, attempt, solved) {
  const current = getPuzzleState(puzzleId);
  if (current.solved) return;
  state.puzzles[puzzleId] = {
    ...current,
    solved: current.solved || solved,
    attempts: [...current.attempts, attempt],
    ...(solved ? { correctAnswer: attempt } : {}),
  };
  saveState();
}

function sanitizeVisibleInput(value) {
  return value.toUpperCase().replace(/[^A-Z0-9\s]/g, "");
}

function canonicalizeAnswer(value) {
  return sanitizeVisibleInput(value).trim().replace(/\s+/g, " ");
}

function enforceAnswerInput(input) {
  input.addEventListener("input", () => {
    const original = input.value;
    const cursor = input.selectionStart ?? original.length;
    const sanitizedBeforeCursor = sanitizeVisibleInput(
      original.slice(0, cursor),
    );
    const sanitized = sanitizeVisibleInput(original);

    if (sanitized !== original) {
      input.value = sanitized;
      input.setSelectionRange(
        sanitizedBeforeCursor.length,
        sanitizedBeforeCursor.length,
      );
    }
  });
}

async function hashValue(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function matchesHash(value, expectedHash) {
  return (await hashValue(canonicalizeAnswer(value))) === expectedHash;
}

async function getSolvedAnswer(puzzle, puzzleState) {
  if (!puzzleState.solved || !puzzle.answerHash) return "";
  // Old saves contain only strings, and may include guesses made after solving.
  // Check the hash instead of assuming that the last stored guess was correct.
  const candidates = new Set([puzzleState.correctAnswer, ...puzzleState.attempts]
    .filter(value => typeof value === "string").map(canonicalizeAnswer));
  try {
    for (const candidate of candidates) {
      if (candidate && await matchesHash(candidate, puzzle.answerHash)) return candidate;
    }
  } catch {
    // Retain completion even if the browser cannot recover a verified answer.
  }
  return "";
}

function isUnlocked(rule) {
  if (!rule || rule.type === "always") {
    return true;
  }

  if (rule.type === "puzzleSolved") {
    return getPuzzleState(rule.puzzleId).solved;
  }

  if (rule.type === "allSolved") {
    return rule.puzzleIds.every((id) => getPuzzleState(id).solved);
  }

  if (rule.type === "anySolvedCount") {
    const solvedCount = rule.puzzleIds.filter(
      (id) => getPuzzleState(id).solved,
    ).length;
    return solvedCount >= rule.count;
  }

  if (rule.type === "solvedPuzzlePropertyCount") {
    const matchingSolvedCount = SITE_CONFIG.categories
      .flatMap((category) => category.puzzles)
      .filter(
        (puzzle) =>
          puzzle[rule.property] === rule.value &&
          getPuzzleState(puzzle.id).solved,
      ).length;
    return matchingSolvedCount >= rule.count;
  }

  return false;
}

function setCategoryStyles(element, category) {
  element.style.setProperty("--category-color", category.color);
  element.style.setProperty("--category-ink", category.ink);
}

function navigate(path) {
  window.location.hash = path === "/" ? "#/" : `#${path}`;
}

function parseRoute() {
  const route = (window.location.hash || "#/").replace(/^#\/?/, "");
  return route ? route.split("/") : [];
}

function findCategory(categoryId) {
  return SITE_CONFIG.categories.find((category) => category.id === categoryId);
}

function findPuzzle(puzzleId) {
  for (const category of SITE_CONFIG.categories) {
    const puzzle = category.puzzles.find((item) => item.id === puzzleId);
    if (puzzle) {
      return { category, puzzle };
    }
  }
  return null;
}

function validateSiteConfig() {
  const puzzleIds = new Set();

  for (const category of SITE_CONFIG.categories) {
    for (const puzzle of category.puzzles) {
      if (puzzleIds.has(puzzle.id)) {
        throw new Error(`Duplicate puzzle id: ${puzzle.id}`);
      }
      if (!PUZZLE_TIERS.includes(puzzle.tier)) {
        throw new Error(`Unsupported tier for puzzle: ${puzzle.id}`);
      }
      puzzleIds.add(puzzle.id);
    }
  }
}

function renderRoute() {
  disposeAnimals();
  disposeAssembly();
  if (unmountEggMachine) {
    unmountEggMachine();
    unmountEggMachine = null;
  }
  if (unmountGrading) {
    unmountGrading();
    unmountGrading = null;
  }
  if (!state.identityVerified) {
    renderIdentityGate();
    return;
  }

  const segments = parseRoute();

  if (segments.length === 0) {
    renderHome();
    return;
  }

  if (segments[0] === "category" && segments.length === 2) {
    const category = findCategory(segments[1]);
    if (category) {
      renderCategory(category);
      return;
    }
  }

  if (segments[0] === "puzzle" && segments.length === 2) {
    const match = findPuzzle(segments[1]);
    if (match) {
      renderPuzzle(match.category, match.puzzle);
      return;
    }
  }

  renderNotFound();
}

function renderIdentityGate(feedback = null) {
  document.title = "Identity Verification · Puzzle 26";
  app.innerHTML = `
    <section class="page identity-page">
      <div class="panel">
        <h1>Identity verification</h1>
        <form class="answer-form" id="identity-form">
          <div class="answer-row">
            <input
              class="answer-input"
              id="identity-answer"
              name="identity-answer"
              type="text"
              inputmode="text"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              aria-label="Verification password"
              required
            />
            <button class="primary-button identity-submit" type="submit" aria-label="Submit identity verification"><span aria-hidden="true">→</span></button>
          </div>
          <p class="feedback" data-type="${feedback?.type ?? ""}" role="status">
            ${feedback?.message ?? ""}
          </p>
        </form>
      </div>
    </section>
  `;

  const form = document.querySelector("#identity-form");
  const input = document.querySelector("#identity-answer");
  const submitButton = form.querySelector('button[type="submit"]');
  enforceAnswerInput(input);
  input.focus();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const answer = canonicalizeAnswer(input.value);

    if (!answer) {
      renderIdentityGate({ type: "error", message: "Enter a password." });
      return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");

    if (await matchesHash(answer, ANSWER_HASHES.identity)) {
      state.identityVerified = true;
      saveState();
      navigate("/");
      renderRoute();
      return;
    }

    renderIdentityGate({
      type: "error",
      message: "invalid",
    });
  });
}

function renderHome() {
  document.title = "Puzzle 26";
  app.innerHTML = `
    <section class="page home-page" aria-label="Puzzle categories">
      <nav class="category-grid" id="category-grid" aria-label="Puzzle categories"></nav>
    </section>
  `;

  const grid = document.querySelector("#category-grid");

  for (const category of SITE_CONFIG.categories) {
    const unlocked = isUnlocked(category.unlock);
    if (!unlocked && category.lockedBehavior === "hidden") {
      continue;
    }

    const solvedCount = category.puzzles.filter(
      (puzzle) => getPuzzleState(puzzle.id).solved,
    ).length;
    const button = document.createElement("button");
    button.className = category.symbol ? "phyrexian-symbol-button" : "category-button";
    button.type = "button";
    button.dataset.category = category.id;
    button.disabled = !unlocked;
    button.setAttribute("aria-label", `Open ${category.name} category`);
    button.setAttribute("aria-describedby", `category-progress-${category.id}`);
    setCategoryStyles(button, category);
    button.innerHTML = `
      ${category.symbol ? `<img src="${category.symbol}" alt="" width="357" height="631" draggable="false" />` : ""}
      <span class="sr-only" id="category-progress-${category.id}">${solvedCount} / ${category.puzzles.length} SOLVED</span>
    `;
    button.addEventListener("click", () =>
      navigate(`/category/${category.id}`),
    );
    grid.append(button);
  }
}

function renderRaritySymbol(puzzle) {
  return `<img class="puzzle-rarity-symbol" src="assets/donkey-${puzzle.tier}.png" alt="${puzzle.tier}" title="${puzzle.tier}" width="56" height="56" />`;
}

function renderPhyrexianText(container, text, className) {
  const inscription = document.createElement("span");
  inscription.className = `phyrexian phyrexian-text ${className}`;
  inscription.setAttribute("aria-hidden", "true");
  inscription.textContent = text;
  container.replaceChildren(inscription);
  // Keep the phonetic source hidden until the local script font is ready.
  document.fonts.load('48px "Phyrexian Script"', text).then(fonts => {
    if (container.isConnected && fonts.length) container.classList.add("script-ready");
  }).catch(() => {
    if (container.isConnected) container.setAttribute("aria-label", "Phyrexian inscription unavailable");
  });
}

function createEncodingMatrix(matrix, label) {
  const scroll = document.createElement("div");
  scroll.className = "encoding-matrix-scroll";
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", `${label} matrix; scroll horizontally if needed`);
  const brackets = document.createElement("div");
  brackets.className = "encoding-matrix-brackets";
  const table = document.createElement("table");
  table.className = "encoding-matrix";
  table.setAttribute("aria-label", `${label}: ${matrix.length} rows, ${matrix[0].length} columns`);
  const body = document.createElement("tbody");
  for (const row of matrix) {
    const tr = document.createElement("tr");
    for (const value of row) {
      const cell = document.createElement("td");
      cell.textContent = value < 0 ? `−${-value}` : String(value);
      tr.append(cell);
    }
    body.append(tr);
  }
  table.append(body);
  brackets.append(table);
  scroll.append(brackets);
  return scroll;
}

function renderLetterEncoding(data) {
  const host = document.querySelector("#phyrexian-encoding");
  [...data.examples, data.challenge].forEach((item, index) => {
    const challenge = index === data.examples.length;
    const label = challenge ? "Challenge" : `Example ${index + 1}`;
    const figure = document.createElement("figure");
    figure.className = `panel encoding-example${challenge ? " encoding-example--challenge" : ""}`;
    figure.setAttribute("aria-label", label);
    if (!challenge) {
      const script = document.createElement("div");
      script.className = "encoding-phrase";
      script.setAttribute("role", "img");
      script.setAttribute("aria-label", `${label} Phyrexian inscription`);
      figure.append(script);
      renderPhyrexianText(script, item.script, "encoding-inscription");
    }

    figure.append(createEncodingMatrix(item.matrix, label));
    host.append(figure);
  });
}

function renderLetterTransformations(data) {
  const host = document.querySelector("#phyrexian-transformations");
  host.innerHTML = `
    <section class="panel transformation-diagram" aria-label="Phyrexian word diagram: addition branches left, subtraction branches right, with a result below the right word">
      <div class="transformation-flow">
        <div class="transformation-node transformation-being" role="img" aria-label="Phyrexian word A"></div>
        <svg class="transformation-branches" viewBox="0 0 600 100" aria-hidden="true">
          <defs><marker id="transformation-arrowhead" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M 2 2 L 10 6 L 2 10" /></marker></defs>
          <path class="transformation-plus" d="M 290 5 L 160 85" marker-end="url(#transformation-arrowhead)" />
          <path class="transformation-minus" d="M 310 5 L 440 85" marker-end="url(#transformation-arrowhead)" />
          <text x="205" y="35">+</text><text x="395" y="35">−</text>
        </svg>
        <div class="transformation-node transformation-oil" role="img" aria-label="Phyrexian word B"></div>
        <div class="transformation-node transformation-blood" role="img" aria-label="Phyrexian word C"></div>
        <div class="transformation-node transformation-result" role="img" aria-label="Phyrexian result"></div>
      </div>
    </section>
    <div class="transformation-inputs"></div>
  `;
  for (const [index, name] of ["being", "oil", "blood"].entries()) {
    renderPhyrexianText(host.querySelector(`.transformation-${name}`), data.inputs[index].script, "transformation-node-inscription");
  }
  renderPhyrexianText(host.querySelector(".transformation-result"), data.exampleResult, "transformation-result-inscription");
  const inputs = host.querySelector(".transformation-inputs");
  for (const item of data.inputs) {
    const card = document.createElement("article");
    card.className = "panel transformation-input";
    const script = document.createElement("div");
    script.className = "transformation-phrase";
    script.setAttribute("role", "img");
    script.setAttribute("aria-label", `Phyrexian word ${item.id}`);
    card.append(script, createEncodingMatrix(item.hint, `Word ${item.id}`));
    inputs.append(card);
    renderPhyrexianText(script, item.script, "transformation-inscription");
  }
}

function renderFactionPuzzle() {
  const host = document.querySelector("#phyrexian-factions");
  const vertices = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / 5;
    return { x: 320 + 240 * Math.cos(angle), y: 300 + 240 * Math.sin(angle) };
  });
  const midpoints = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % 5];
    return { x: (vertex.x + next.x) / 2, y: (vertex.y + next.y) / 2 };
  });
  const positions = vertices.flatMap((vertex, index) => [vertex, midpoints[index]]);
  host.innerHTML = `
    <div class="panel faction-board">
      <svg viewBox="0 0 640 560" role="img" aria-label="An empty pentagon with ten positions at its vertices and edge midpoints, with adjacent midpoints connected">
        <polygon points="${vertices.map(point => `${point.x},${point.y}`).join(" ")}" />
        <polygon class="faction-inner" points="${midpoints.map(point => `${point.x},${point.y}`).join(" ")}" />
        ${positions.map(point => `<circle cx="${point.x}" cy="${point.y}" r="18" />`).join("")}
      </svg>
    </div>
  `;
}

function puzzleNavigationLabel(category, puzzle) {
  return puzzle.nameScript || !puzzle.name ? `${category.name} puzzle ${puzzle.number}` : puzzle.name;
}

function renderCategory(category) {
  document.title = `${category.name} · Puzzle 26`;
  app.innerHTML = `
    <section class="page category-page" aria-label="${category.name} puzzles">
      <button class="back-button" id="back-button" type="button">BACK</button>
      <div class="category-banner${category.wrapInscription ? " category-banner--sentence" : ""}" id="category-banner" role="img" aria-label="Phyrexian inscription"></div>
      <div class="puzzle-list" id="puzzle-list"></div>
    </section>
  `;

  const banner = document.querySelector("#category-banner");
  setCategoryStyles(banner, category);
  banner.classList.toggle("category-banner--metallic", category.id === "phyrexian");
  if (category.inscription) {
    renderPhyrexianText(banner, category.inscription, "category-inscription");
  }
  document
    .querySelector("#back-button")
    .addEventListener("click", () => navigate("/"));

  const list = document.querySelector("#puzzle-list");
  for (const puzzle of category.puzzles) {
    const unlocked = isUnlocked(puzzle.unlock);
    if (!unlocked && puzzle.lockedBehavior === "hidden") {
      continue;
    }

    const puzzleState = getPuzzleState(puzzle.id);
    const button = document.createElement("button");
    button.className = "puzzle-button";
    button.type = "button";
    button.disabled = !unlocked;
    button.setAttribute(
      "aria-label",
      `${puzzleNavigationLabel(category, puzzle)}, ${puzzle.tier}${puzzleState.solved ? ", solved" : ""}`,
    );
    button.innerHTML = `
      ${renderRaritySymbol(puzzle)}
      <span class="puzzle-name${puzzle.nameScript ? " puzzle-name--phyrexian" : ""}">${puzzle.nameScript ? "" : puzzle.name}</span>
      <span class="puzzle-status ${puzzleState.solved ? "solved" : ""}${puzzleState.solved && category.id === "green" ? " puzzle-status--check" : ""}">
        ${puzzleState.solved ? "✓" : unlocked ? "" : "LOCKED"}
      </span>
    `;
    if (puzzle.nameScript) {
      renderPhyrexianText(button.querySelector(".puzzle-name"), puzzle.nameScript, "puzzle-name-inscription");
    }
    button.addEventListener("click", () => navigate(`/puzzle/${puzzle.id}`));
    list.append(button);
    if (puzzleState.solved && category.id !== "green") {
      const status = button.querySelector(".puzzle-status");
      status.id = `puzzle-status-${puzzle.id}`;
      button.setAttribute("aria-describedby", status.id);
      getSolvedAnswer(puzzle, puzzleState).then(answer => {
        if (answer && status.isConnected) status.textContent = answer;
      });
    }
  }
}

function renderPuzzleSubtitle(puzzle) {
  const subtitle = document.querySelector(".puzzle-subtitle");
  if (!subtitle) return;
  const text = puzzle.subtitle ?? "subtitle";
  subtitle.textContent = text;
  if (!puzzle.microdot) return;

  const { word, image } = puzzle.microdot;
  const wordIndex = text.indexOf(word);
  const letterIndex = word.indexOf("i");
  if (wordIndex < 0 || letterIndex < 0) return;

  subtitle.classList.add("microdot-message");
  subtitle.id = "microdot-puzzle";
  const wordSpan = document.createElement("span");
  wordSpan.className = "microdot-word";
  const letter = document.createElement("span");
  letter.className = "microdot-letter";
  const dot = document.createElement("img");
  dot.className = "microdot-image";
  dot.src = image;
  dot.alt = "";
  letter.append("i", dot);
  wordSpan.append(word.slice(0, letterIndex), letter, word.slice(letterIndex + 1));
  subtitle.replaceChildren(text.slice(0, wordIndex), wordSpan, text.slice(wordIndex + word.length));
}

function renderPuzzle(category, puzzle, feedback = null) {
  disposeAnimals();
  disposeAssembly();
  if (unmountEggMachine) {
    unmountEggMachine();
    unmountEggMachine = null;
  }
  if (unmountGrading) {
    unmountGrading();
    unmountGrading = null;
  }
  const puzzleState = getPuzzleState(puzzle.id);
  const isAnimalMatching = puzzle.interactive === "animalMatching";
  document.title = puzzle.nameScript
    ? `${puzzleNavigationLabel(category, puzzle)} · Puzzle 26`
    : [puzzle.name, category.name, "Puzzle 26"].filter(Boolean).join(" · ");
  const description = isAnimalMatching || puzzleState.solved ? ""
    : puzzle.grading ? ""
    : puzzle.interactive === "rareEggMachine" ? ""
    : puzzle.interactive === "reactionAssembly" ? ""
    : puzzle.interactive === "rhythmGame" || puzzle.interactive === "nimGame" || puzzle.statement || puzzle.hints || puzzle.microdot || puzzle.image || puzzle.images || puzzle.letterEncoding || puzzle.letterTransformations || puzzle.factionPuzzle ? ""
    : "Puzzle content and instructions will be added later.";
  const showSubtitle = puzzle.showSubtitle !== false;
  app.innerHTML = `
    <section class="page puzzle-page" data-puzzle-id="${puzzle.id}">
      <button class="back-button" id="back-button" type="button">BACK</button>
      ${puzzle.name || description || showSubtitle ? `<header class="page-header">
        ${puzzle.nameScript ? `<h1 class="phyrexian-puzzle-heading" aria-label="${puzzleNavigationLabel(category, puzzle)}"></h1>` : puzzle.name ? `<h1>${puzzle.name}</h1>` : ""}
        ${showSubtitle ? '<p class="puzzle-subtitle"></p>' : ""}
        ${description ? `<p class="lede">${description}</p>` : ""}
      </header>` : ""}

      ${isAnimalMatching || puzzle.answerSubmission === false ? "" : `<div class="panel puzzle-content${puzzleState.solved ? " puzzle-content--solved" : ""}">
        ${puzzle.grading && !puzzleState.solved ? '<p class="grading-answer-notice" id="grading-answer-notice" role="status" hidden></p>' : ""}
        ${puzzleState.solved ? "" : `<form class="answer-form" id="puzzle-answer-form">
          <div class="answer-row">
            <input
              class="answer-input"
              id="puzzle-answer"
              name="puzzle-answer"
              aria-label="Answer"
              type="text"
              inputmode="text"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              required
            />
            <button class="primary-button" type="submit" aria-label="Submit answer"><span aria-hidden="true">→</span></button>
          </div>
        </form>`}
        ${!puzzleState.solved ? `<p class="feedback" data-type="${feedback?.type ?? ""}" role="status">
            ${feedback?.message ?? ""}
          </p>` : ""}
        <section class="attempts-panel" aria-label="Previous attempts">
          <div id="attempt-history"></div>
        </section>
      </div>`}

      ${isAnimalMatching ? '<div id="animal-matching" aria-label="Animal matching puzzle"></div>' : puzzle.grading ? '<div id="grading-puzzle"></div>' : puzzle.interactive === "rareEggMachine" ? '<div id="egg-machine-puzzle"></div><div id="card-collection"></div>' : puzzle.interactive === "reactionAssembly" ? '<div id="reaction-assembly" aria-label="Reaction assembly board">Loading assembly board…</div>' : puzzle.interactive === "nimGame" ? '<div class="nim-game-wrap"><iframe id="nim-game" class="nim-game-frame" src="games/nim/index.html" title="Jack be Nimble grid game"></iframe></div>' : puzzle.interactive === "rhythmGame" ? '<iframe id="rhythm-game" class="rhythm-game-frame" src="games/rhythm/wordless.html" title="Arrow-key rhythm game"></iframe>' : puzzle.letterEncoding ? '<div id="phyrexian-encoding"></div>' : puzzle.letterTransformations ? '<div id="phyrexian-transformations"></div>' : puzzle.factionPuzzle ? '<div id="phyrexian-factions"></div>' : puzzle.image ? '<img id="puzzle-image" class="puzzle-image" />' : puzzle.images ? '<div id="puzzle-images" class="puzzle-image-gallery"></div>' : puzzle.microdot ? "" : puzzle.hints ? '<div class="panel"><ul class="puzzle-hints" id="puzzle-hints" aria-label="Puzzle hints"></ul></div>' : puzzle.statement ? `<div class="panel puzzle-statement">${puzzle.statementLayout === "aligned" ? '<textarea class="cipher-text-box" id="puzzle-statement" rows="2" wrap="off" readonly spellcheck="false"></textarea>' : '<pre id="puzzle-statement"></pre>'}</div>` : `<div class="placeholder-puzzle">
        <p>Placeholder puzzle content</p>
      </div>`}
    </section>
  `;

  if (puzzle.nameScript) {
    renderPhyrexianText(document.querySelector(".phyrexian-puzzle-heading"), puzzle.nameScript, "puzzle-title-inscription");
  }

  renderPuzzleSubtitle(puzzle);

  if (puzzle.letterEncoding) renderLetterEncoding(puzzle.letterEncoding);
  if (puzzle.letterTransformations) renderLetterTransformations(puzzle.letterTransformations);
  if (puzzle.factionPuzzle) renderFactionPuzzle();

  if (puzzle.image) {
    const image = document.querySelector("#puzzle-image");
    image.src = puzzle.image.src;
    image.alt = puzzle.image.alt;
  }

  if (puzzle.crossword) renderCrossword(puzzle.crossword);

  if (puzzle.images) {
    const gallery = document.querySelector("#puzzle-images");
    gallery.classList.toggle("puzzle-image-gallery--grid", puzzle.imageLayout === "grid");
    for (const source of puzzle.images) {
      const image = document.createElement("img");
      image.className = "puzzle-image";
      image.src = source.src;
      image.alt = source.alt;
      if (source.caption) {
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.textContent = source.caption;
        figure.append(image, caption);
        gallery.append(figure);
      } else {
        gallery.append(image);
      }
    }
  }

  if (puzzle.hints) {
    const list = document.querySelector("#puzzle-hints");
    for (const hint of puzzle.hints) {
      const item = document.createElement("li");
      item.textContent = hint;
      list.append(item);
    }
  }

  if (puzzle.statement) {
    const statement = document.querySelector("#puzzle-statement");
    if (puzzle.statementLayout === "aligned") {
      statement.value = puzzle.statement;
      statement.parentElement.classList.add("puzzle-statement--aligned");
      statement.setAttribute("aria-label", "Ciphertext and partially revealed plaintext. Scroll horizontally to read both lines.");
    } else {
      statement.textContent = puzzle.statement;
    }
  }

  document
    .querySelector("#back-button")
    .addEventListener("click", () => navigate(`/category/${category.id}`));

  if (isAnimalMatching) {
    const host = document.querySelector("#animal-matching");
    loadAnimalResources().then(() => {
      if (!host.isConnected || !state.identityVerified || parseRoute().join("/") !== `puzzle/${puzzle.id}`) return;
      unmountAnimals = window.AnimalMatching.mount(host, {
        initialState: getPuzzleState(puzzle.id).matching,
        onChange(matching, complete) {
          const current = getPuzzleState(puzzle.id);
          const nextState = { ...state, puzzles: { ...state.puzzles,
            [puzzle.id]: { ...current, matching, solved: current.solved || complete } } };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
          state = nextState;
        },
      });
    }).catch(() => {
      if (host.isConnected) host.textContent = "The animal puzzle could not load. Reload the page to try again.";
    });
    return;
  }

  if (puzzle.answerSubmission !== false) renderAttemptHistory(puzzle, puzzleState);

  if (puzzle.interactive === "reactionAssembly") {
    const host = document.querySelector("#reaction-assembly");
    loadAssemblyResources().then(() => {
      if (!host.isConnected || !state.identityVerified || parseRoute().join("/") !== `puzzle/${puzzle.id}`) return;
      unmountAssembly = window.ReactionAssembly.mount(host, {
        initialState: getPuzzleState(puzzle.id).assembly,
        onChange(assembly) {
          state.puzzles[puzzle.id] = { ...getPuzzleState(puzzle.id), assembly };
          saveState();
        },
      });
    }).catch(() => {
      if (host.isConnected) host.textContent = "The assembly board could not load. Reload the page to try again.";
    });
  }

  if (puzzle.interactive === "rareEggMachine") {
    const deck = window.PUZZLE_CARD_DECK;
    const collection = window.HuntCards.mountCollection(
      document.querySelector("#card-collection"),
      deck.cards.slice(0, puzzleState.eggMachine.cardsPulled),
    );
    unmountEggMachine = window.RareEggMachine.mount(document.querySelector("#egg-machine-puzzle"), {
      getNextCard: () => deck.cards[getPuzzleState(puzzle.id).eggMachine.cardsPulled],
      exhaustedMessage: deck.exhaustedMessage,
      onReveal(card) {
        const current = getPuzzleState(puzzle.id);
        if (deck.cards[current.eggMachine.cardsPulled] !== card) throw new Error("Pull order changed.");
        const nextState = {
          ...state,
          puzzles: {
            ...state.puzzles,
            [puzzle.id]: { ...current, eggMachine: { cardsPulled: current.eggMachine.cardsPulled + 1 } },
          },
        };
        // Commit before showing the card. A storage failure leaves the deck
        // position unchanged, and navigation after revealing cannot lose it.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
        state = nextState;
      },
      onComplete: card => collection.append(card),
    });
  }

  if (puzzle.grading) {
    updateGradingAnswer(puzzle);
    if (!gradingController) {
      gradingController = window.PuzzleGrading.createController({
        config: window.PUZZLE_GRADER_CONFIG,
        parts: puzzle.grading.parts,
        initialAttempts: puzzleState.grading,
        onChange(grading) {
          state.puzzles[puzzle.id] = { ...getPuzzleState(puzzle.id), grading };
          saveState();
          if (parseRoute().join("/") === `puzzle/${puzzle.id}`) updateGradingAnswer(puzzle);
        },
      });
    }
    unmountGrading = gradingController.mount(document.querySelector("#grading-puzzle"));
  }

  // Solved puzzles still mount their games and grading history, but no answer form.
  const form = document.querySelector("#puzzle-answer-form");
  if (!form) return;
  const input = form.querySelector("input");
  const submitButton = form.querySelector('button[type="submit"]');
  enforceAnswerInput(input);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (getPuzzleState(puzzle.id).solved || submitButton.disabled) return;
    const answer = canonicalizeAnswer(input.value);

    if (!answer) {
      renderPuzzle(category, puzzle, {
        type: "error",
        message: "Enter an answer.",
      });
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "CHECKING";
    const solved = await matchesHash(answer, puzzle.answerHash);
    if (!form.isConnected) return;
    recordAttempt(puzzle.id, answer, solved);
    renderPuzzle(category, puzzle, solved ? null : {
      type: "error",
      message: "Not quite. Try again.",
    });
  });
}

function renderCrossword(clues) {
  const image = document.querySelector("#puzzle-image");
  const crossword = document.createElement("section");
  crossword.id = "crossword-puzzle";
  crossword.setAttribute("aria-label", "Crossword");
  image.replaceWith(crossword);

  const grid = document.createElement("div");
  grid.className = "panel crossword-grid-scroll";
  grid.tabIndex = 0;
  grid.setAttribute("role", "region");
  grid.setAttribute("aria-label", "Crossword grid");
  image.width = 1200;
  image.height = 760;
  grid.append(image);

  const cluePanel = document.createElement("div");
  cluePanel.className = "panel crossword-clues";
  for (const [direction, title] of [["across", "Across"], ["down", "Down"]]) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.id = `crossword-${direction}-heading`;
    heading.textContent = title;
    section.setAttribute("aria-labelledby", heading.id);
    const list = document.createElement("ol");
    list.id = `crossword-${direction}`;
    for (const { number, clue } of clues[direction]) {
      const item = document.createElement("li");
      item.value = number;
      item.textContent = clue;
      list.append(item);
    }
    section.append(heading, list);
    cluePanel.append(section);
  }
  crossword.append(grid, cluePanel);
}

function gradingPartsComplete(puzzle) {
  const grading = getPuzzleState(puzzle.id).grading;
  return puzzle.grading.parts.every((part) => window.PuzzleGrading.hasFullScore(grading[part.id]));
}

function updateGradingAnswer(puzzle) {
  const notice = document.querySelector("#grading-answer-notice");
  if (!notice) return;
  const complete = gradingPartsComplete(puzzle);
  notice.hidden = !complete;
  notice.replaceChildren();
  if (complete) {
    notice.append("Both parts scored 100/100. Your answer is ");
    const answer = document.createElement("span");
    answer.className = "revealed-answer";
    answer.textContent = puzzle.grading.revealedAnswer;
    notice.append(answer, ". Enter it below to solve the puzzle.");
  }
  notice.classList.toggle("answer-revealed", complete);
}

function renderAttemptHistory(puzzle, puzzleState) {
  const container = document.querySelector("#attempt-history");
  const { attempts } = puzzleState;
  const list = document.createElement("ul");
  list.className = "attempt-list";

  if (attempts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-attempts";
    empty.textContent = "No previous attempts.";
    container.append(empty);
  } else {
    for (const attempt of attempts) {
      const item = document.createElement("li");
      item.textContent = attempt;
      list.append(item);
    }
    container.append(list);
  }

  getSolvedAnswer(puzzle, puzzleState).then(answer => {
    if (!answer || !container.isConnected) return;
    let correctItems = [...list.children].filter(item => canonicalizeAnswer(item.textContent) === answer);
    if (correctItems.length === 0) {
      const item = document.createElement("li");
      item.textContent = answer;
      list.append(item);
      correctItems = [item];
    }
    for (const item of correctItems) {
      item.classList.add("correct-attempt");
      item.setAttribute("aria-label", `${item.textContent}, correct answer`);
      if (puzzle.answerNeutralLetters) {
        const text = item.textContent;
        item.replaceChildren();
        for (const character of text) {
          if (puzzle.answerNeutralLetters.includes(character.toUpperCase())) {
            const letter = document.createElement("span");
            letter.className = "correct-attempt-neutral";
            letter.textContent = character;
            item.append(letter);
          } else {
            item.append(character);
          }
        }
      }
    }
    if (!list.isConnected) container.replaceChildren(list);
  });
}

function renderNotFound() {
  document.title = "Page not found · Puzzle 26";
  app.innerHTML = `
    <section class="page">
      <button class="back-button" id="back-button" type="button">BACK</button>
      <div class="panel">
        <p class="eyebrow">404</p>
        <h1>Page not found</h1>
        <p class="lede">That puzzle page does not exist.</p>
      </div>
    </section>
  `;
  document
    .querySelector("#back-button")
    .addEventListener("click", () => navigate("/"));
}

helpButton.addEventListener("click", () => {
  helpDialog.showModal();
  helpCloseButton.focus();
});

helpCloseButton.addEventListener("click", () => helpDialog.close());

helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) {
    helpDialog.close();
  }
});

helpDialog.addEventListener("close", () => helpButton.focus());

clearStateButton.addEventListener("click", () => {
  const confirmed = window.confirm(
    "Clear all progress which is saved locally?",
  );

  if (!confirmed) {
    return;
  }

  disposeAnimals();
  disposeAssembly();
  unmountEggMachine?.();
  unmountEggMachine = null;
  gradingController?.destroy();
  gradingController = null;
  window.PuzzleGrading.clearSession();
  localStorage.removeItem(STORAGE_KEY);
  state = createDefaultState();
  helpDialog.close();

  if (window.location.hash !== "#/") {
    window.location.hash = "#/";
  } else {
    renderRoute();
  }
});

window.addEventListener("hashchange", renderRoute);
validateSiteConfig();
renderRoute();
