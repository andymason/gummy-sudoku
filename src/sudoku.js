// Pure game logic for Gummy Sudoku: no DOM, no storage, no sound.
// Boards are flat arrays of n*n numbers: 0 is empty, 1..n is a gummy.
// Maybes ("notes") are bitmasks per square: bit v set means "maybe gummy v".

/**
 * Gummy 1 to 9. Smaller boards use the first 4 or 6.
 * Each has its own colour and its own shape, so they can be told apart
 * without relying on colour alone. Artwork: icons/gummies/<id>.svg.
 */
export const GUMMIES = [
  { id: 'bear', name: 'red gummy bear' },
  { id: 'fish', name: 'blue gummy fish' },
  { id: 'ring', name: 'orange peach ring' },
  { id: 'star', name: 'yellow gummy star' },
  { id: 'worm', name: 'green gummy worm' },
  { id: 'heart', name: 'purple gummy heart' },
  { id: 'cola', name: 'cola bottle' },
  { id: 'raspberry', name: 'pink raspberry' },
  { id: 'egg', name: 'fried egg' },
];

/** Box shape per board size: [box rows, box columns]. */
export const SIZES = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };

export const SIZE_NAMES = { 4: 'Mini 4×4', 6: 'Medium 6×6', 9: 'Big 9×9' };

/** How many gummies the puzzle starts with. Fewer means harder. */
export const TARGET_GIVENS = {
  4: { easy: 9, medium: 7, hard: 5 },
  6: { easy: 21, medium: 16, hard: 12 },
  9: { easy: 40, medium: 32, hard: 26 },
};

export const UNIT_KINDS = ['row', 'column', 'box'];

export const nameOf = (v) => GUMMIES[v - 1].name;

/** "a blue gummy fish", "an orange peach ring". */
export const aName = (v) => (/^[aeiou]/.test(nameOf(v)) ? 'an ' : 'a ') + nameOf(v);

/** The gummy in a one-maybe square (the highest set bit), or 0. */
export const noteOf = (mask) => (mask ? 31 - Math.clz32(mask) : 0);

/** Rows, columns, boxes and peers for an n×n board. */
export function makeGeo(n) {
  const [br, bc] = SIZES[n];
  const perRow = n / bc;
  const rowOf = (i) => Math.floor(i / n);
  const colOf = (i) => i % n;
  const boxOf = (i) => Math.floor(rowOf(i) / br) * perRow + Math.floor(colOf(i) / bc);
  const units = { row: [], column: [], box: [] };
  for (let k = 0; k < n; k++) {
    units.row.push([]);
    units.column.push([]);
    units.box.push([]);
  }
  for (let i = 0; i < n * n; i++) {
    units.row[rowOf(i)].push(i);
    units.column[colOf(i)].push(i);
    units.box[boxOf(i)].push(i);
  }
  const indexOf = { row: rowOf, column: colOf, box: boxOf };
  const unitOf = (kind, i) => units[kind][indexOf[kind](i)];
  const peers = [];
  for (let i = 0; i < n * n; i++) {
    const s = new Set(UNIT_KINDS.flatMap((kind) => unitOf(kind, i)));
    s.delete(i);
    peers.push([...s]);
  }
  return { n, br, bc, rowOf, colOf, boxOf, units, unitOf, peers };
}

/** Shuffles in place (Fisher–Yates) and returns the array. */
export function shuffle(a, random = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Counts solutions up to `limit`. With `fillRandom`, fills `g` in place with
 * the first (random) solution found.
 */
export function solve(g, geo, limit, fillRandom = false) {
  const { n, rowOf, colOf, boxOf } = geo;
  const full = ((1 << (n + 1)) - 1) & ~1;
  const R = Array.from({ length: n }, () => 0);
  const C = Array.from({ length: n }, () => 0);
  const B = Array.from({ length: n }, () => 0);
  const empties = [];
  for (let i = 0; i < n * n; i++) {
    const v = g[i];
    if (!v) {
      empties.push(i);
      continue;
    }
    const bit = 1 << v;
    const r = rowOf(i);
    const c = colOf(i);
    const b = boxOf(i);
    if ((R[r] | C[c] | B[b]) & bit) return 0;
    R[r] |= bit;
    C[c] |= bit;
    B[b] |= bit;
  }
  let count = 0;
  const rec = () => {
    // pick the empty square with the fewest options
    let best = -1;
    let bestMask = 0;
    let bestCnt = 99;
    for (const i of empties) {
      if (g[i]) continue;
      const m = full & ~(R[rowOf(i)] | C[colOf(i)] | B[boxOf(i)]);
      let cnt = 0;
      for (let x = m; x; x &= x - 1) cnt++;
      if (!cnt) return false;
      if (cnt < bestCnt) {
        best = i;
        bestMask = m;
        bestCnt = cnt;
        if (cnt === 1) break;
      }
    }
    if (best < 0) {
      count++;
      return fillRandom || count >= limit;
    }
    const vals = [];
    for (let v = 1; v <= n; v++) if (bestMask & (1 << v)) vals.push(v);
    if (fillRandom) shuffle(vals);
    const r = rowOf(best);
    const c = colOf(best);
    const b = boxOf(best);
    for (const v of vals) {
      const bit = 1 << v;
      g[best] = v;
      R[r] |= bit;
      C[c] |= bit;
      B[b] |= bit;
      if (rec()) return true;
      g[best] = 0;
      R[r] &= ~bit;
      C[c] &= ~bit;
      B[b] &= ~bit;
    }
    return false;
  };
  rec();
  return count;
}

/** A new puzzle with exactly one solution. */
export function makePuzzle(n, diff) {
  const geo = makeGeo(n);
  const solution = Array.from({ length: n * n }, () => 0);
  solve(solution, geo, 1, true);
  const puzzle = [...solution];
  const target = TARGET_GIVENS[n][diff];
  let givens = n * n;
  for (const i of shuffle([...Array(n * n).keys()])) {
    if (givens <= target) break;
    const v = puzzle[i];
    puzzle[i] = 0;
    if (solve([...puzzle], geo, 2) === 1) givens--;
    else puzzle[i] = v;
  }
  return { solution, puzzle };
}

/** Gummies that don't clash with anything in square i's row, column or box. */
export function candidates(board, geo, i) {
  const used = new Set(geo.peers[i].map((p) => board[p]));
  const out = [];
  for (let v = 1; v <= geo.n; v++) if (!used.has(v)) out.push(v);
  return out;
}

/** Squares whose gummy repeats in their row, column or box. */
export function conflicts(board, geo) {
  const bad = new Set();
  board.forEach((v, i) => {
    if (v && geo.peers[i].some((p) => board[p] === v)) bad.add(i);
  });
  return bad;
}

/** The kinds of unit ('row', 'column', 'box') that square i completes correctly. */
export function completedUnits(board, geo, i) {
  return UNIT_KINDS.filter((kind) => {
    const unit = geo.unitOf(kind, i);
    return unit.every((p) => board[p]) && new Set(unit.map((p) => board[p])).size === geo.n;
  });
}

/**
 * The next logical step, easiest first:
 *  - { type: 'wrong', i }                 a placed gummy that isn't the answer
 *  - { type: 'single', i, v }             a square where only one gummy fits
 *  - { type: 'only-spot', i, v, kind }    a unit where a gummy fits in one square only
 *  - { type: 'answer', i, v }             fallback: the answer for the tightest square
 * Returns null when the board is full and correct.
 */
export function findHint(board, solution, geo, locked = () => false) {
  const wrong = board.findIndex((v, i) => v && !locked(i) && v !== solution[i]);
  if (wrong >= 0) return { type: 'wrong', i: wrong };
  const empties = shuffle(board.flatMap((v, i) => (v ? [] : [i])));
  if (!empties.length) return null;
  for (const i of empties) {
    const c = candidates(board, geo, i);
    if (c.length === 1) return { type: 'single', i, v: c[0] };
  }
  for (const kind of ['box', 'row', 'column']) {
    for (const unit of shuffle([...geo.units[kind]])) {
      for (const v of shuffle(Array.from({ length: geo.n }, (_, k) => k + 1))) {
        if (unit.some((p) => board[p] === v)) continue;
        const spots = unit.filter((p) => !board[p] && candidates(board, geo, p).includes(v));
        if (spots.length === 1) return { type: 'only-spot', i: spots[0], v, kind };
      }
    }
  }
  const i = empties.reduce((a, b) =>
    candidates(board, geo, b).length < candidates(board, geo, a).length ? b : a,
  );
  return { type: 'answer', i, v: solution[i] };
}

/**
 * Maybe changes caused by placing gummy v in square i: the square's own maybe
 * goes, and (when v doesn't clash) v's maybes leave its row, column and box.
 * Returns a Map of square → new maybe mask.
 */
export function placementNoteChanges(board, notes, geo, i, v) {
  const changes = new Map();
  if (!v) return changes;
  changes.set(i, 0);
  const bit = 1 << v;
  if (geo.peers[i].some((p) => board[p] === v)) return changes;
  for (const p of geo.peers[i]) if (notes[p] & bit) changes.set(p, notes[p] & ~bit);
  return changes;
}

/**
 * An undoable change: { i, from, to, nd: [[square, maybesBefore, maybesAfter], ...] }.
 * Returns null when nothing would change.
 */
export function makeEntry(board, notes, i, to, noteChanges = new Map()) {
  const nd = [];
  for (const [k, after] of noteChanges) if (notes[k] !== after) nd.push([k, notes[k], after]);
  if (board[i] === to && !nd.length) return null;
  return { i, from: board[i], to, nd };
}

/** Applies an entry forwards (do / redo) or backwards (undo), in place. */
export function applyEntry(board, notes, entry, forward) {
  board[entry.i] = forward ? entry.to : entry.from;
  for (const [k, before, after] of entry.nd) notes[k] = forward ? after : before;
}
