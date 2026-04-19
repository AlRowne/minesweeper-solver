# Minesweeper Solver

A small browser-based helper for Minesweeper boards. Enter the visible board
state, run the analysis, and the solver marks safe clicks, safe flags, or the
lowest-risk unknown cells.

## Use

Open `index.html` in a browser.

- Left click a cell to cycle forward: unknown, flag, 0, 1, ..., 8.
- Right click a cell to cycle backward.
- Press **Analysieren** to run the solver.

The solver uses local constraint rules first. If no direct move is available, it
enumerates small frontier regions and shows risk estimates.
