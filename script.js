const UNKNOWN = "unknown";
const FLAG = "flag";
const VALUES = [UNKNOWN, FLAG, 0, 1, 2, 3, 4, 5, 6, 7, 8];

const boardElement = document.querySelector("#board");
const rowsInput = document.querySelector("#rows");
const colsInput = document.querySelector("#cols");
const minesInput = document.querySelector("#mines");
const newBoardButton = document.querySelector("#new-board");
const solveButton = document.querySelector("#solve");
const clearButton = document.querySelector("#clear");
const summaryElement = document.querySelector("#summary");
const movesElement = document.querySelector("#moves");

let rows = 9;
let cols = 9;
let totalMines = 10;
let board = [];
let solverMarks = new Map();

function makeBoard() {
  rows = clampNumber(rowsInput.value, 5, 24);
  cols = clampNumber(colsInput.value, 5, 30);
  totalMines = clampNumber(minesInput.value, 1, rows * cols - 1);

  rowsInput.value = rows;
  colsInput.value = cols;
  minesInput.value = totalMines;

  board = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({ row, col, value: UNKNOWN })),
  );
  solverMarks = new Map();
  renderBoard();
  renderAnalysis("Brett bereit. Trage sichtbare Zahlen und Flaggen ein.", []);
}

function renderBoard() {
  boardElement.innerHTML = "";
  boardElement.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

  forEachCell((cell) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.dataset.row = cell.row;
    button.dataset.col = cell.col;
    button.setAttribute("aria-label", `Feld ${cell.row + 1}, ${cell.col + 1}`);
    button.addEventListener("click", () => cycleCell(cell.row, cell.col, 1));
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      cycleCell(cell.row, cell.col, -1);
    });
    boardElement.append(button);
  });

  paintBoard();
}

function paintBoard() {
  boardElement.querySelectorAll(".cell").forEach((button) => {
    const cell = board[button.dataset.row][button.dataset.col];
    const mark = solverMarks.get(keyFor(cell));
    button.className = "cell";
    button.textContent = "";
    button.removeAttribute("data-value");
    button.style.removeProperty("--risk");

    if (cell.value === FLAG) {
      button.classList.add("flag");
      button.textContent = "F";
      return;
    }

    if (typeof cell.value === "number") {
      button.classList.add("open");
      button.dataset.value = cell.value;
      button.textContent = String(cell.value);
      return;
    }

    if (!mark) return;

    if (mark.type === "safe") {
      button.classList.add("solver-safe");
      button.textContent = "safe";
      return;
    }

    if (mark.type === "mine") {
      button.classList.add("solver-mine");
      button.textContent = "mine";
      return;
    }

    button.classList.add("probable");
    button.style.backgroundColor = probabilityColor(mark.risk);
    button.textContent = `${Math.round(mark.risk * 100)}%`;
  });
}

function cycleCell(row, col, direction) {
  const cell = board[row][col];
  const currentIndex = VALUES.indexOf(cell.value);
  const nextIndex = (currentIndex + direction + VALUES.length) % VALUES.length;
  cell.value = VALUES[nextIndex];
  solverMarks = new Map();
  renderAnalysis("Aenderung eingetragen. Starte die Analyse erneut.", []);
  paintBoard();
}

function solveBoard() {
  solverMarks = new Map();
  const constraints = collectConstraints();
  const contradictions = constraints.filter(
    (constraint) =>
      constraint.remaining < 0 || constraint.remaining > constraint.unknowns.length,
  );

  if (contradictions.length > 0) {
    renderAnalysis("Widerspruch: Mindestens eine Zahl passt nicht zu den Nachbarfeldern.", []);
    paintBoard();
    return;
  }

  const safeCells = new Map();
  const mineCells = new Map();

  constraints.forEach((constraint) => {
    if (constraint.unknowns.length === 0) return;

    if (constraint.remaining === 0) {
      constraint.unknowns.forEach((cell) => safeCells.set(keyFor(cell), cell));
    }

    if (constraint.remaining === constraint.unknowns.length) {
      constraint.unknowns.forEach((cell) => mineCells.set(keyFor(cell), cell));
    }
  });

  const subsetDeductions = findSubsetDeductions(constraints);
  subsetDeductions.safe.forEach((cell) => safeCells.set(keyFor(cell), cell));
  subsetDeductions.mines.forEach((cell) => mineCells.set(keyFor(cell), cell));

  mineCells.forEach((cell, key) => solverMarks.set(key, { type: "mine" }));
  safeCells.forEach((cell, key) => {
    if (!solverMarks.has(key)) solverMarks.set(key, { type: "safe" });
  });

  const probabilityMoves = calculateProbabilities(constraints);
  probabilityMoves.forEach(({ cell, risk }) => {
    const key = keyFor(cell);
    if (!solverMarks.has(key)) solverMarks.set(key, { type: "risk", risk });
  });

  const moves = buildMoveList(safeCells, mineCells, probabilityMoves);
  const summary = buildSummary(safeCells.size, mineCells.size, probabilityMoves.length);
  renderAnalysis(summary, moves);
  paintBoard();
}

function collectConstraints() {
  const constraints = [];

  forEachCell((cell) => {
    if (typeof cell.value !== "number") return;

    const neighbors = getNeighbors(cell.row, cell.col);
    const flagged = neighbors.filter((neighbor) => neighbor.value === FLAG).length;
    const unknowns = neighbors.filter((neighbor) => neighbor.value === UNKNOWN);
    const remaining = cell.value - flagged;

    constraints.push({ cell, unknowns, remaining });
  });

  return constraints;
}

function findSubsetDeductions(constraints) {
  const safe = new Map();
  const mines = new Map();
  const usable = constraints.filter((constraint) => constraint.unknowns.length > 0);

  for (let a = 0; a < usable.length; a += 1) {
    for (let b = 0; b < usable.length; b += 1) {
      if (a === b) continue;

      const left = usable[a];
      const right = usable[b];
      const leftSet = new Set(left.unknowns.map(keyFor));
      const rightSet = new Set(right.unknowns.map(keyFor));

      if (!isSubset(leftSet, rightSet)) continue;

      const difference = right.unknowns.filter((cell) => !leftSet.has(keyFor(cell)));
      const remainingDifference = right.remaining - left.remaining;

      if (difference.length === 0) continue;

      if (remainingDifference === 0) {
        difference.forEach((cell) => safe.set(keyFor(cell), cell));
      }

      if (remainingDifference === difference.length) {
        difference.forEach((cell) => mines.set(keyFor(cell), cell));
      }
    }
  }

  return { safe, mines };
}

function calculateProbabilities(constraints) {
  const frontier = new Map();
  constraints.forEach((constraint) => {
    constraint.unknowns.forEach((cell) => frontier.set(keyFor(cell), cell));
  });

  if (frontier.size === 0 || frontier.size > 18) {
    return simpleRiskEstimate(constraints);
  }

  const cellsToSolve = [...frontier.values()];
  const validAssignments = [];

  backtrackAssignments(cellsToSolve, constraints, 0, new Map(), validAssignments);

  if (validAssignments.length === 0) {
    return simpleRiskEstimate(constraints);
  }

  return cellsToSolve
    .map((cell) => {
      const key = keyFor(cell);
      const mineCount = validAssignments.filter((assignment) => assignment.get(key)).length;
      return { cell, risk: mineCount / validAssignments.length };
    })
    .filter(({ risk }) => risk > 0 && risk < 1)
    .sort((a, b) => a.risk - b.risk);
}

function backtrackAssignments(cellsToSolve, constraints, index, assignment, validAssignments) {
  if (validAssignments.length > 5000) return;

  if (index === cellsToSolve.length) {
    if (constraints.every((constraint) => constraintSatisfied(constraint, assignment, true))) {
      validAssignments.push(new Map(assignment));
    }
    return;
  }

  const cell = cellsToSolve[index];
  const key = keyFor(cell);

  assignment.set(key, false);
  if (constraints.every((constraint) => constraintSatisfied(constraint, assignment, false))) {
    backtrackAssignments(cellsToSolve, constraints, index + 1, assignment, validAssignments);
  }

  assignment.set(key, true);
  if (constraints.every((constraint) => constraintSatisfied(constraint, assignment, false))) {
    backtrackAssignments(cellsToSolve, constraints, index + 1, assignment, validAssignments);
  }

  assignment.delete(key);
}

function constraintSatisfied(constraint, assignment, complete) {
  let mines = 0;
  let unknown = 0;

  constraint.unknowns.forEach((cell) => {
    const key = keyFor(cell);

    if (!assignment.has(key)) {
      unknown += 1;
      return;
    }

    if (assignment.get(key)) mines += 1;
  });

  if (complete) return mines === constraint.remaining;
  return mines <= constraint.remaining && mines + unknown >= constraint.remaining;
}

function simpleRiskEstimate(constraints) {
  const risks = new Map();

  constraints.forEach((constraint) => {
    if (constraint.unknowns.length === 0 || constraint.remaining < 0) return;

    const risk = constraint.remaining / constraint.unknowns.length;
    constraint.unknowns.forEach((cell) => {
      const key = keyFor(cell);
      const previous = risks.get(key);
      risks.set(key, previous === undefined ? risk : Math.max(previous, risk));
    });
  });

  return [...risks.entries()]
    .map(([key, risk]) => ({ cell: cellFromKey(key), risk }))
    .filter(({ risk }) => risk > 0 && risk < 1)
    .sort((a, b) => a.risk - b.risk);
}

function buildMoveList(safeCells, mineCells, probabilityMoves) {
  const moves = [];

  safeCells.forEach((cell) => moves.push(`Sicher klicken: ${formatCell(cell)}.`));
  mineCells.forEach((cell) => moves.push(`Sicher flaggen: ${formatCell(cell)}.`));

  if (moves.length === 0 && probabilityMoves.length > 0) {
    const best = probabilityMoves[0];
    moves.push(
      `Kein sicherer Zug gefunden. Niedrigstes Risiko: ${formatCell(best.cell)} mit ${Math.round(
        best.risk * 100,
      )}%.`,
    );
  }

  return moves.slice(0, 20);
}

function buildSummary(safeCount, mineCount, probabilityCount) {
  if (safeCount > 0 || mineCount > 0) {
    return `${safeCount} sichere Klicks und ${mineCount} sichere Flaggen gefunden.`;
  }

  if (probabilityCount > 0) {
    return "Keine sicheren Zuege gefunden. Wahrscheinlichkeiten wurden geschaetzt.";
  }

  return "Keine verwertbaren Hinweise gefunden. Trage mehr sichtbare Zahlen ein.";
}

function renderAnalysis(summary, moves) {
  summaryElement.textContent = summary;
  movesElement.innerHTML = "";

  moves.forEach((move) => {
    const item = document.createElement("li");
    item.textContent = move;
    movesElement.append(item);
  });
}

function getNeighbors(row, col) {
  const neighbors = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;

      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;

      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
        neighbors.push(board[nextRow][nextCol]);
      }
    }
  }

  return neighbors;
}

function forEachCell(callback) {
  board.flat().forEach(callback);
}

function cellFromKey(key) {
  const [row, col] = key.split(":").map(Number);
  return board[row][col];
}

function keyFor(cell) {
  return `${cell.row}:${cell.col}`;
}

function formatCell(cell) {
  return `Zeile ${cell.row + 1}, Spalte ${cell.col + 1}`;
}

function isSubset(left, right) {
  return [...left].every((value) => right.has(value));
}

function probabilityColor(risk) {
  const red = Math.round(58 + risk * 165);
  const green = Math.round(143 - risk * 88);
  const blue = Math.round(93 - risk * 20);
  return `rgb(${red}, ${green}, ${blue})`;
}

function clampNumber(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

newBoardButton.addEventListener("click", makeBoard);
clearButton.addEventListener("click", makeBoard);
solveButton.addEventListener("click", solveBoard);

makeBoard();
