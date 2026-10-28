(() => {
  "use strict";

  const SIZE = 17;
  const SHOW_DEATH_SQUARES = document.documentElement.dataset.hazards !== "hidden";
  const HEAPS = [13, 1, 25, 14, 1, 18, 4]; // MAYNARD, A=1 through Z=26.
  const START = [1, 15];
  const CHECKPOINTS = [[1, 4], [16, 6], [16, 12], [0, 12], [16, 14], [16, 0], [0, 0]];
  const DIRECTIONS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    ArrowUp: [0, -1], ArrowDown: [0, 1],
  };

  const board = document.getElementById("board");
  const overlay = document.getElementById("death-overlay");
  const checkpointNumber = document.getElementById("checkpoint-number");
  const checkpointButton = document.getElementById("restart-checkpoint");
  const completionMark = document.getElementById("completion-mark");
  const status = document.getElementById("status");
  const cells = [];
  let position = [...START];
  let reached = 0;
  let dead = false;

  for (const axis of ["x", "y"]) {
    const labels = document.getElementById(`${axis}-coordinates`);
    for (let coordinate = 0; coordinate < SIZE; coordinate++) {
      const label = document.createElement("span");
      label.textContent = coordinate;
      label.setAttribute("aria-hidden", "true");
      labels.append(label);
    }
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.setAttribute("aria-hidden", "true");
      board.append(cell);
      cells.push(cell);
    }
  }

  function render() {
    // Reaching 7 finishes the run; retain the final board rather than inventing an eighth.
    const stage = Math.min(reached, HEAPS.length - 1);
    const target = CHECKPOINTS[reached];
    cells.forEach((cell, index) => {
      const x = index % SIZE, y = Math.floor(index / SIZE);
      cell.replaceChildren();
      cell.classList.toggle("death", SHOW_DEATH_SQUARES && (x ^ y) === HEAPS[stage]);
      if (target && x === target[0] && y === target[1]) {
        const label = document.createElement("span");
        label.className = "destination";
        label.textContent = reached + 1;
        cell.append(label);
      }
      if (x === position[0] && y === position[1]) {
        const dot = document.createElement("span");
        dot.className = "player";
        cell.append(dot);
      }
    });
    checkpointNumber.textContent = reached || "";
    completionMark.hidden = reached !== CHECKPOINTS.length;
    checkpointButton.setAttribute("aria-label", reached
      ? `Restart from checkpoint ${reached}`
      : "Restart from checkpoint; no checkpoint reached yet");
    overlay.hidden = !dead;
    const state = dead ? "dead" : reached === CHECKPOINTS.length ? "complete" : "playing";
    board.dataset.state = state;
    board.dataset.checkpoint = reached;
    board.dataset.stage = stage + 1;
    board.setAttribute("aria-label", `17 by 17 grid. Player column ${position[0]}, row ${position[1]}. ` +
      (dead ? "You have died. Use a restart button to continue." :
        target ? `Use arrow keys to reach checkpoint ${reached + 1}, column ${target[0]}, row ${target[1]}.` :
          "All seven checkpoints reached."));
  }

  function restart(fromCheckpoint) {
    if (!fromCheckpoint) reached = 0;
    position = [...(reached ? CHECKPOINTS[reached - 1] : START)];
    dead = false;
    render();
    status.textContent = reached === CHECKPOINTS.length ? "All seven checkpoints reached." :
      reached ? `Restarted at checkpoint ${reached}.` : "Restarted from the beginning.";
    board.focus({ preventScroll: true });
  }

  document.addEventListener("keydown", (event) => {
    const direction = DIRECTIONS[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (dead || reached === CHECKPOINTS.length) return;

    const next = [position[0] + direction[0], position[1] + direction[1]];
    if (next.some(value => value < 0 || value >= SIZE)) return;
    position = next;
    if ((next[0] ^ next[1]) === HEAPS[reached]) {
      dead = true;
    } else {
      const target = CHECKPOINTS[reached];
      if (next[0] === target[0] && next[1] === target[1]) {
        reached++;
        status.textContent = reached === CHECKPOINTS.length
          ? "All seven checkpoints reached."
          : `Checkpoint ${reached} reached. Continue to checkpoint ${reached + 1}.`;
      }
    }
    render();
  });

  document.getElementById("restart").addEventListener("click", () => restart(false));
  checkpointButton.addEventListener("click", () => restart(true));
  render();
})();
