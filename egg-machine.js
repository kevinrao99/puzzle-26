"use strict";

// The reference image is unchanged. SVG masks isolate its artwork into moving
// pieces; the background, hatch, egg, and effects are drawn in the browser.
window.RareEggMachine = (() => {
  const ANIMATION_SPEED = 1.5;
  const RELEASE_MS = 4400;
  const ROLL_MS = 1400;
  const TOTAL_MS = RELEASE_MS + ROLL_MS;
  const CARD_HOLD_MS = 1200;
  const EGG_EXIT = "translate(-100px,1542px) scale(.88) rotate(-400deg)";
  const HEAD = "M 568 732 C 582 756 570 788 557 815 C 588 800 612 785 633 783 L 649 789 C 677 777 704 748 722 730 C 740 773 726 807 684 850 C 700 872 699 898 711 911 C 727 922 750 923 768 927 C 753 948 731 960 707 964 C 718 979 733 986 748 992 C 735 1010 706 1014 673 1013 C 637 1013 604 1032 574 1041 C 531 1058 494 1044 462 1040 C 430 1035 404 1037 389 1042 C 377 1034 373 1020 374 1006 C 366 1013 366 1020 370 1027 C 345 1006 320 959 331 930 C 351 922 415 914 431 884 C 438 872 432 850 442 836 C 451 825 467 824 485 822 L 511 785 C 518 777 527 780 536 769 L 561 737 Z";
  const WING = "M 784 925 C 810 960 888 1019 931 1087 C 975 1156 996 1263 1006 1331 C 995 1294 977 1274 958 1262 C 938 1246 926 1256 918 1305 C 900 1258 865 1219 839 1209 C 815 1200 798 1216 787 1234 C 766 1191 751 1165 718 1176 L 687 1118 C 751 1133 782 1069 784 925 Z";
  const BODY = "M 530 1038 C 521 1062 513 1074 500 1085 L 440 1091 L 420 1192 C 382 1199 354 1217 348 1248 C 343 1265 345 1276 350 1288 C 344 1316 365 1339 396 1335 C 385 1320 378 1308 389 1299 Q 411 1291 425 1283 L 429 1322 C 400 1342 398 1381 409 1418 C 418 1447 435 1469 454 1473 C 418 1481 376 1465 343 1456 C 324 1468 315 1484 317 1500 C 317 1520 333 1542 346 1552 L 354 1539 L 367 1556 L 376 1540 L 384 1555 L 415 1534 Q 464 1543 503 1535 C 497 1550 510 1571 525 1577 L 533 1558 L 543 1576 L 558 1557 L 564 1570 L 603 1553 C 631 1557 660 1570 681 1565 C 709 1554 744 1533 780 1526 L 826 1514 C 883 1528 949 1527 1007 1509 L 991 1505 L 986 1475 L 943 1485 L 938 1435 L 895 1428 L 898 1377 L 852 1364 L 853 1303 L 803 1292 L 802 1242 L 753 1237 C 730 1203 714 1164 702 1129 C 687 1088 680 1049 673 1012 Z";
  const ARM = "M 405 1171 C 395 1164 387 1149 391 1134 C 393 1123 402 1114 413 1107 C 425 1080 447 1074 470 1080 C 496 1086 541 1114 574 1132 C 600 1118 624 1111 647 1117 C 676 1124 694 1148 698 1181 C 704 1213 684 1238 658 1248 C 626 1260 594 1250 565 1233 C 537 1214 510 1178 483 1148 C 470 1163 452 1156 436 1148 C 423 1143 413 1149 405 1171 Z";

  function mount(root, { getNextCard, onReveal, onComplete, exhaustedMessage = "Out of eggs!" }) {
    const stars = [
      [110, 144, 18], [720, 92, 12], [260, 65, 9], [590, 196, 14],
      [89, 526, 17], [752, 454, 13], [188, 377, 9], [827, 662, 15],
      [357, 142, 8], [650, 35, 8], [116, 790, 8], [514, 83, 11],
    ].map(([x, y, size], index) => `<use href="#rem-star" x="${x}" y="${y}" width="${size * 2}" height="${size * 2}" class="rem-background-star" style="--star-delay: ${-index * 0.37}s"/>`).join("");
    root.innerHTML = `
      <section class="egg-machine" aria-labelledby="egg-machine-title">
        <header class="egg-machine-header">
          <span class="egg-machine-ornament" aria-hidden="true">✦</span>
          <h2 id="egg-machine-title">Rare Egg Machine</h2>
          <span class="egg-machine-ornament" aria-hidden="true">✦</span>
        </header>
        <div class="egg-machine-stage" data-phase="idle">
          <svg class="egg-machine-scene" viewBox="0 0 900 1080" role="group" aria-labelledby="rem-scene-title rem-scene-description">
            <title id="rem-scene-title">Golden dragon rare egg machine</title>
            <desc id="rem-scene-description">A golden dragon with red wings. Pull its arm to release a rainbow egg, which rolls left before hatching into a card.</desc>
            <defs>
              <image id="rem-art" href="assets/rare-egg-machine-reference.png" x="0" y="0" width="1084" height="2048" preserveAspectRatio="none"/>
              <linearGradient id="rem-background" x2="0" y2="1">
                <stop stop-color="#fffff5"/><stop offset=".17" stop-color="#fcfbb0"/>
                <stop offset=".44" stop-color="#d1af3b"/><stop offset=".72" stop-color="#916005"/>
                <stop offset="1" stop-color="#493002"/>
              </linearGradient>
              <radialGradient id="rem-halo"><stop stop-color="#fffbb7" stop-opacity=".65"/><stop offset="1" stop-color="#fffab6" stop-opacity="0"/></radialGradient>
              <radialGradient id="rem-floor"><stop stop-color="#211600" stop-opacity=".68"/><stop offset="1" stop-color="#211600" stop-opacity="0"/></radialGradient>
              <linearGradient id="rem-neck" x1="0" y1="0" x2="1" y2=".5"><stop stop-color="#ffee32"/><stop offset=".46" stop-color="#cab41a"/><stop offset="1" stop-color="#978100"/></linearGradient>
              <linearGradient id="rem-door-gold"><stop stop-color="#fff84a"/><stop offset="1" stop-color="#ffc513"/></linearGradient>
              <linearGradient id="rem-egg-rainbow" x1=".05" y1="0" x2=".9" y2="1">
                <stop stop-color="#a67aff"/><stop offset=".22" stop-color="#fd5da9"/><stop offset=".42" stop-color="#ffbe32"/>
                <stop offset=".61" stop-color="#fcfa6b"/><stop offset=".77" stop-color="#4ddd9c"/><stop offset="1" stop-color="#56b9ff"/>
              </linearGradient>
              <radialGradient id="rem-egg-shine" cx=".26" cy=".2" r=".8"><stop stop-color="#fff" stop-opacity=".96"/><stop offset=".23" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#623777" stop-opacity=".45"/></radialGradient>
              <radialGradient id="rem-egg-aura"><stop stop-color="#fff8bc" stop-opacity=".8"/><stop offset=".5" stop-color="#ffeb84" stop-opacity=".18"/><stop offset="1" stop-color="#ffed86" stop-opacity="0"/></radialGradient>
              <clipPath id="rem-head-clip"><path d="${HEAD}"/></clipPath>
              <clipPath id="rem-wing-clip"><path d="${WING}"/></clipPath>
              <clipPath id="rem-arm-clip"><path d="${ARM}"/></clipPath>
              <mask id="rem-body-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1084" height="2048">
                <path d="${BODY}" fill="white"/><path d="${ARM}" fill="black" stroke="black" stroke-width="8"/>
              </mask>
              <clipPath id="rem-hatch-clip"><path d="M 437 1282 Q 487 1307 550 1289 L 579 1393 Q 518 1434 443 1398 Z"/></clipPath>
              <symbol id="rem-star" viewBox="-20 -20 40 40"><path d="M 0 -20 Q 3 -3 20 0 Q 3 3 0 20 Q -3 3 -20 0 Q -3 -3 0 -20 Z" fill="currentColor"/></symbol>
            </defs>
            <rect width="900" height="1080" fill="url(#rem-background)"/>
            <ellipse cx="450" cy="290" rx="530" ry="420" fill="url(#rem-halo)"/>
            <g aria-hidden="true" class="rem-stars">${stars}</g>
            <ellipse cx="527" cy="952" rx="350" ry="53" fill="url(#rem-floor)"/>
            <g transform="translate(-140 -640)">
              <g transform="translate(615 1500)"><g class="rem-body-motion"><g transform="translate(-615 -1500)">
                <g transform="translate(780 1110)"><g class="rem-wing-motion"><g transform="translate(-780 -1110)">
                  <use href="#rem-art" clip-path="url(#rem-wing-clip)"/>
                </g></g></g>
                <path d="M 530 1036 L 674 1010 Q 698 1146 718 1196 L 646 1300 L 477 1290 L 426 1225 Q 419 1170 437 1121 Q 455 1080 501 1083 Z" fill="url(#rem-neck)"/>
                <path d="M 469 1084 Q 517 1081 573 1138 L 620 1280 L 432 1302 Q 415 1187 437 1122 Q 445 1092 469 1084 Z" fill="url(#rem-door-gold)"/>
                <path d="M 501 1083 Q 453 1077 437 1122 Q 420 1157 423 1198" fill="none" stroke="#272008" stroke-width="3"/>
                <use href="#rem-art" mask="url(#rem-body-mask)"/>
                <g class="rem-hatch" opacity="0">
                  <path d="M 437 1282 Q 487 1307 550 1289 L 579 1393 Q 518 1434 443 1398 Z" fill="#14110b" stroke="#796024" stroke-width="7"/>
                  <path d="M 447 1303 L 454 1387 Q 510 1414 567 1388" fill="none" stroke="#39301c" stroke-width="8"/>
                  <g clip-path="url(#rem-hatch-clip)">
                    <g transform="translate(500 1282)"><g class="rem-door-motion">
                      <path d="M -80 -16 L 80 -16 L 95 158 L -80 158 Z" fill="url(#rem-door-gold)" stroke="#977623" stroke-width="4"/>
                    </g></g>
                  </g>
                </g>
                <g transform="translate(630 1180)"><g class="rem-arm-motion"><g transform="translate(-630 -1180)">
                  <use href="#rem-art" clip-path="url(#rem-arm-clip)"/>
                  <path class="egg-machine-pull" d="${ARM}" fill="transparent" stroke="transparent" stroke-width="14" role="button" tabindex="0" aria-label="Pull the dragon's arm" aria-disabled="false"/>
                </g></g></g>
                <g transform="translate(608 1004)"><g class="rem-head-motion"><g transform="translate(-608 -1004)">
                  <use href="#rem-art" clip-path="url(#rem-head-clip)"/>
                </g></g></g>
              </g></g></g>
              <g class="rem-egg-shadow" opacity="0"><ellipse cx="400" cy="1613" rx="88" ry="18" fill="url(#rem-floor)"/></g>
              <g class="rem-egg-flight" opacity="0">
                <circle class="rem-egg-glow" r="142" fill="url(#rem-egg-aura)"/>
                <g class="rem-egg-shell">
                  <path d="M 0 -88 C -30 -88 -66 -25 -66 19 C -66 66 -33 87 0 87 C 37 87 67 63 67 19 C 67 -24 32 -88 0 -88 Z" fill="url(#rem-egg-rainbow)" stroke="#ffe7a2" stroke-width="5"/>
                  <path d="M -49 -30 L -10 -48 L 8 -9 L -35 13 Z" fill="#51e8ff" opacity=".6"/>
                  <path d="M 8 -9 L 51 -27 L 60 26 L 29 45 Z" fill="#78ed67" opacity=".65"/>
                  <path d="M -35 13 L 8 -9 L 29 45 L -14 67 L -53 44 Z" fill="#ffd963" opacity=".65"/>
                  <path d="M -10 -48 L 0 -83 L 33 -54 L 8 -9 Z" fill="#fd62bf" opacity=".7"/>
                  <path d="M -14 67 L 29 45 L 54 60 Q 23 100 -14 67 Z" fill="#54ccff" opacity=".8"/>
                  <path d="M 0 -88 C -30 -88 -66 -25 -66 19 C -66 66 -33 87 0 87 C 37 87 67 63 67 19 C 67 -24 32 -88 0 -88 Z" fill="url(#rem-egg-shine)"/>
                  <ellipse cx="-26" cy="-40" rx="12" ry="25" transform="rotate(27 -26 -40)" fill="white" opacity=".86"/>
                  <path d="M -56 -94 H -39 V -77 H -22 V -60 H -39 V -43 H -56 V -60 H -73 V -77 H -56 Z" fill="#fff178" stroke="#302b16" stroke-width="4" stroke-linejoin="round"/>
                </g>
              </g>
              <g class="rem-burst" opacity="0" transform="translate(400 1535)" aria-hidden="true">
                <use href="#rem-star" x="-123" y="-99" width="35" height="35" style="color:#fff9c9"/>
                <use href="#rem-star" x="84" y="-65" width="27" height="27" style="color:#b2f7ff"/>
                <use href="#rem-star" x="-77" y="47" width="20" height="20" style="color:#fffff2"/>
                <use href="#rem-star" x="57" y="62" width="22" height="22" style="color:#fff9bd"/>
                <use href="#rem-star" x="-13" y="-138" width="24" height="24" style="color:#dffcff"/>
              </g>
            </g>
          </svg>
          <div class="egg-machine-reveal" hidden>
            <svg class="egg-reveal-scene" viewBox="0 0 900 1080" role="img" aria-labelledby="rem-reveal-title">
              <title id="rem-reveal-title">A rainbow egg resting on the ground, ready to hatch</title>
              <defs>
                <linearGradient id="rem-reveal-background" x2="0" y2="1"><stop stop-color="#17252f"/><stop offset=".65" stop-color="#405663"/><stop offset="1" stop-color="#17242b"/></linearGradient>
                <radialGradient id="rem-reveal-light"><stop stop-color="#fffce0"/><stop offset=".2" stop-color="#ffe6a2" stop-opacity=".88"/><stop offset=".55" stop-color="#e5cb89" stop-opacity=".35"/><stop offset="1" stop-color="#ffe9a9" stop-opacity="0"/></radialGradient>
                <radialGradient id="rem-reveal-ground"><stop stop-color="#94a2a1"/><stop offset="1" stop-color="#34464e"/></radialGradient>
              </defs>
              <rect width="900" height="1080" fill="url(#rem-reveal-background)"/>
              <ellipse cx="450" cy="1065" rx="840" ry="350" fill="url(#rem-reveal-ground)"/>
              <g fill="none" stroke="#bcc6be" stroke-width="2" opacity=".2">
                <ellipse cx="450" cy="890" rx="265" ry="70"/>
                <ellipse cx="450" cy="890" rx="315" ry="95"/>
                <path d="M175 953L243 1067 M650 962L718 1080 M334 819L290 748 M558 819L600 748"/>
              </g>
              <ellipse class="rem-ground-shadow" cx="450" cy="896" rx="165" ry="28" fill="#111d22" opacity=".55"/>
              <g transform="translate(450 735)">
                <circle class="rem-reveal-glow" r="360" fill="url(#rem-reveal-light)" opacity="0"/>
                <g transform="scale(1.75)"><g class="rem-ground-egg"></g></g>
              </g>
            </svg>
            <div class="egg-reveal-card"></div>
          </div>
        </div>
        <p class="egg-machine-feedback" role="alert" hidden></p>
        <p class="visually-hidden egg-machine-status" role="status">Ready to pull.</p>
      </section>`;

    const stage = root.querySelector(".egg-machine-stage");
    const arm = root.querySelector(".egg-machine-pull");
    const status = root.querySelector(".egg-machine-status");
    const feedback = root.querySelector(".egg-machine-feedback");
    const scene = root.querySelector(".egg-machine-scene");
    const reveal = root.querySelector(".egg-machine-reveal");
    const revealCard = root.querySelector(".egg-reveal-card");
    const groundEgg = root.querySelector(".rem-ground-egg");
    const groundShadow = root.querySelector(".rem-ground-shadow");
    const glow = root.querySelector(".rem-reveal-glow");
    groundEgg.append(root.querySelector(".rem-egg-shell").cloneNode(true));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = Object.fromEntries(["arm", "head", "body", "wing", "door"].map((part) => [part, root.querySelector(`.rem-${part}-motion`)]));
    const egg = root.querySelector(".rem-egg-flight");
    const hatch = root.querySelector(".rem-hatch");
    const shadow = root.querySelector(".rem-egg-shadow");
    const burst = root.querySelector(".rem-burst");
    let active = false;
    let disposed = false;
    let animations = [];
    let returnTimer = null;
    let restoreArmFocus = false;

    function animate(element, frames, options = {}) {
      const animation = element.animate(frames, { duration: RELEASE_MS, fill: "both", easing: "linear", ...options });
      // Keep all original keyframe relationships while speeding up every phase,
      // including the grounded pause, glow, and card fade-in.
      animation.playbackRate = ANIMATION_SPEED;
      animations.push(animation);
      return animation;
    }

    function returnToMachine(phase = "idle") {
      if (disposed) return;
      for (const animation of animations) animation.cancel();
      animations = [];
      egg.style.opacity = "0";
      shadow.style.opacity = "0";
      reveal.hidden = true;
      scene.style.visibility = "visible";
      scene.removeAttribute("aria-hidden");
      stage.dataset.phase = phase;
      arm.setAttribute("aria-disabled", "false");
      arm.setAttribute("tabindex", "0");
      active = false;
      if (restoreArmFocus && (document.activeElement === document.body || document.activeElement === arm)) {
        arm.focus({ preventScroll: true });
      }
    }

    function finish(card) {
      if (disposed) return;
      stage.dataset.phase = "complete";
      status.textContent = `${card.name}. Added to your cards.`;
      onComplete(card);
      // Show the finished card briefly, then expose the arm for the next pull.
      // The collected copy below remains available for as long as needed.
      returnTimer = window.setTimeout(() => {
        returnTimer = null;
        returnToMachine();
      }, CARD_HOLD_MS);
    }

    async function hatchCard(card) {
      if (disposed) return;
      // The existing machine remains mounted for its SVG paint definitions,
      // but the reveal is a separate scene occupying exactly the same space.
      scene.style.visibility = "hidden";
      scene.setAttribute("aria-hidden", "true");
      reveal.hidden = false;
      stage.dataset.phase = "grounded";
      status.textContent = "The egg is sitting on the ground.";
      if (!reducedMotion.matches) {
        await animate(groundEgg, [{ opacity: 1 }, { opacity: 1 }], { duration: 600 }).finished;
        if (disposed) return;
        stage.dataset.phase = "glowing";
        status.textContent = "The egg is glowing…";
        animate(groundEgg, [
          { filter: "brightness(1) drop-shadow(0 0 0px #fff5b3)" },
          { filter: "brightness(1.2) drop-shadow(0 0 12px #fff5b3)", offset: .5 },
          { filter: "brightness(2) drop-shadow(0 0 24px #fff5b3)" },
        ], { duration: 1200, easing: "ease-in" });
        await animate(glow, [{ opacity: 0, transform: "scale(.45)" }, { opacity: 1, transform: "scale(1.25)" }], { duration: 1200, easing: "ease-in" }).finished;
        if (disposed) return;
      }

      const renderedCard = window.HuntCards.createCard(card);
      // Save before exposing the reward. If the page closes while it fades in,
      // the same card is already recoverable in the collection on the next visit.
      onReveal(card);
      revealCard.replaceChildren(renderedCard);
      stage.dataset.phase = "revealing";
      if (reducedMotion.matches) {
        groundEgg.style.opacity = "0";
        groundShadow.style.opacity = "0";
        glow.style.opacity = ".22";
        revealCard.style.opacity = "1";
      } else {
        animate(groundEgg, [{ opacity: 1 }, { opacity: 0 }], { duration: 450 });
        animate(groundShadow, [{ opacity: .55 }, { opacity: 0 }], { duration: 450 });
        animate(glow, [{ opacity: 1 }, { opacity: .22 }], { duration: 750 });
        await animate(revealCard, [
          { opacity: 0, transform: "translateY(30px) scale(.82)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ], { duration: 750, easing: "cubic-bezier(.2,.7,.2,1)" }).finished;
        if (disposed) return;
      }
      finish(card);
    }

    function reportFailure() {
      if (disposed) return;
      returnToMachine("error");
      feedback.hidden = false;
      feedback.textContent = "Couldn't save this pull. Check browser storage and try again; no card was used.";
    }

    async function pull() {
      if (active || disposed) return;
      const card = getNextCard();
      if (!card) {
        feedback.textContent = exhaustedMessage;
        feedback.hidden = false;
        return;
      }
      active = true;
      restoreArmFocus = document.activeElement === arm;
      for (const animation of animations) animation.cancel();
      animations = [];
      feedback.hidden = true;
      feedback.textContent = "";
      scene.style.visibility = "visible";
      scene.removeAttribute("aria-hidden");
      reveal.hidden = true;
      revealCard.replaceChildren();
      revealCard.style.opacity = "0";
      groundEgg.style.opacity = "1";
      groundShadow.style.opacity = ".55";
      glow.style.opacity = "0";
      egg.style.opacity = "0";
      shadow.style.opacity = "0";
      arm.setAttribute("aria-disabled", "true");
      arm.setAttribute("tabindex", "-1");
      stage.dataset.phase = "pulling";
      status.textContent = "Pulling the arm…";

      if (reducedMotion.matches) {
        egg.style.transform = EGG_EXIT;
        egg.style.opacity = "1";
        try { await hatchCard(card); }
        catch { reportFailure(); }
        return;
      }

      animate(elements.arm, [
        { transform: "rotate(0deg)", offset: 0 },
        { transform: "rotate(-31deg)", offset: .15, easing: "cubic-bezier(.2,.8,.2,1)" },
        { transform: "rotate(-34deg)", offset: .24 },
        { transform: "rotate(5deg)", offset: .36 },
        { transform: "rotate(0deg)", offset: .43 },
        { transform: "rotate(0deg)", offset: 1 },
      ]);
      animate(elements.head, [
        { transform: "rotate(0deg)", offset: 0 },
        { transform: "rotate(0deg)", offset: .17 },
        { transform: "translate(-4px,-12px) rotate(9deg)", offset: .29 },
        { transform: "translate(0,-15px) rotate(-5deg)", offset: .39 },
        { transform: "translate(0,5px) rotate(2deg)", offset: .48 },
        { transform: "rotate(0deg)", offset: .56 },
        { transform: "rotate(0deg)", offset: 1 },
      ]);
      animate(elements.body, [
        { transform: "scale(1)", offset: 0 },
        { transform: "scale(1.012,.988)", offset: .2 },
        { transform: "scale(.99,1.025)", offset: .35 },
        { transform: "translate(-3px,0) rotate(-.7deg)", offset: .42 },
        { transform: "translate(3px,0) rotate(.7deg)", offset: .46 },
        { transform: "scale(1.025)", offset: .55 },
        { transform: "scale(1.025)", offset: .73 },
        { transform: "scale(1)", offset: .87 },
        { transform: "scale(1)", offset: 1 },
      ]);
      animate(elements.wing, [
        { transform: "rotate(0deg)", offset: 0 },
        { transform: "rotate(0deg)", offset: .2 },
        { transform: "rotate(-4deg)", offset: .34 },
        { transform: "rotate(3deg)", offset: .46 },
        { transform: "rotate(0deg)", offset: .57 },
        { transform: "rotate(0deg)", offset: 1 },
      ]);
      animate(hatch, [
        { opacity: 0, offset: 0 }, { opacity: 0, offset: .47 },
        { opacity: 1, offset: .49 }, { opacity: 1, offset: .89 },
        { opacity: 0, offset: .93 }, { opacity: 0, offset: 1 },
      ]);
      animate(elements.door, [
        { transform: "translateY(0)", offset: 0 },
        { transform: "translateY(0)", offset: .49 },
        { transform: "translateY(-151px)", offset: .59 },
        { transform: "translateY(-151px)", offset: .82 },
        { transform: "translateY(0)", offset: .91 },
        { transform: "translateY(0)", offset: 1 },
      ]);
      const flightFrames = [
        { transform: "translate(496px,1345px) scale(.18)", opacity: 0, offset: 0 },
        { transform: "translate(496px,1345px) scale(.18)", opacity: 0, offset: .59 },
        { transform: "translate(490px,1360px) scale(.38) rotate(-10deg)", opacity: 1, offset: .64 },
        { transform: "translate(418px,1395px) scale(.7) rotate(-22deg)", opacity: 1, offset: .71 },
        { transform: "translate(390px,1540px) scale(.95,.77) rotate(8deg)", opacity: 1, offset: .8 },
        { transform: "translate(400px,1477px) scale(.85,.9) rotate(-5deg)", opacity: 1, offset: .86 },
        { transform: "translate(400px,1538px) scale(.91,.84) rotate(3deg)", opacity: 1, offset: .93 },
        { transform: "translate(400px,1535px) scale(.88)", opacity: 1, offset: 1 },
      ];
      // Preserve the release/bounce timing, then roll counterclockwise beyond
      // the SVG's left edge (including the egg's glow).
      const completion = animate(egg, [
        ...flightFrames.map(frame => ({ ...frame, offset: frame.offset * RELEASE_MS / TOTAL_MS })),
        { transform: "translate(275px,1550px) scale(.88) rotate(-100deg)", opacity: 1, offset: (RELEASE_MS + ROLL_MS * .25) / TOTAL_MS },
        { transform: "translate(150px,1538px) scale(.88) rotate(-200deg)", opacity: 1, offset: (RELEASE_MS + ROLL_MS * .5) / TOTAL_MS },
        { transform: "translate(25px,1548px) scale(.88) rotate(-300deg)", opacity: 1, offset: (RELEASE_MS + ROLL_MS * .75) / TOTAL_MS },
        { transform: EGG_EXIT, opacity: 1, offset: 1 },
      ], { duration: TOTAL_MS });
      const shadowFrames = [
        { opacity: 0, offset: 0 }, { opacity: 0, offset: .63 },
        { opacity: .25, offset: .72 }, { opacity: 1, offset: .8 },
        { opacity: .5, offset: .86 }, { opacity: 1, offset: 1 },
      ];
      animate(shadow, [
        ...shadowFrames.map(frame => ({ ...frame, transform: "translateX(0)", offset: frame.offset * RELEASE_MS / TOTAL_MS })),
        { transform: "translateX(-500px)", opacity: 1, offset: 1 },
      ], { duration: TOTAL_MS });
      animate(burst, [
        { opacity: 0, offset: 0 }, { opacity: 0, offset: .78 },
        { opacity: 1, offset: .83 }, { opacity: .4, offset: .9 },
        { opacity: .9, offset: .94 }, { opacity: 0, offset: 1 },
      ]);
      try { await completion.finished; await hatchCard(card); }
      catch { reportFailure(); /* Navigation cancels without committing a pending card. */ }
    }

    function onArmKeyDown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) pull();
    }

    arm.addEventListener("click", pull);
    arm.addEventListener("keydown", onArmKeyDown);
    return () => {
      disposed = true;
      window.clearTimeout(returnTimer);
      arm.removeEventListener("click", pull);
      arm.removeEventListener("keydown", onArmKeyDown);
      for (const animation of animations) animation.cancel();
      animations = [];
    };
  }

  return Object.freeze({ mount });
})();
