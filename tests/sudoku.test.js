import { describe, expect, it } from 'vitest';
import {
  GUMMIES,
  SIZES,
  TARGET_GIVENS,
  aName,
  applyEntry,
  candidates,
  completedUnits,
  conflicts,
  findHint,
  makeEntry,
  makeGeo,
  makePuzzle,
  noteOf,
  placementNoteChanges,
  shuffle,
  solve,
} from '../src/sudoku.js';

// A known-good 4×4 solution (boxes are 2×2).
const SOLVED_4 = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];

const bit = (v) => 1 << v;

const isValidSolution = (board, geo) =>
  board.every((v) => v >= 1 && v <= geo.n) && conflicts(board, geo).size === 0;

describe('gummies', () => {
  it('has nine uniquely named gummies', () => {
    expect(GUMMIES).toHaveLength(9);
    expect(new Set(GUMMIES.map((c) => c.name)).size).toBe(9);
  });

  it('uses "a" or "an" correctly', () => {
    expect(aName(2)).toBe('a blue gummy fish');
    expect(aName(3)).toBe('an orange peach ring');
  });
});

describe('makeGeo', () => {
  it.each([
    { n: 4, peerCount: 7 },
    { n: 6, peerCount: 12 },
    { n: 9, peerCount: 20 },
  ])('gives every square on a $n×$n board $peerCount peers', ({ n, peerCount }) => {
    const geo = makeGeo(n);
    expect(geo.peers).toHaveLength(n * n);
    for (const peers of geo.peers) expect(peers).toHaveLength(peerCount);
  });

  it.each(Object.keys(SIZES).map(Number))(
    'splits a board of size %i into full rows, columns and boxes',
    (n) => {
      const geo = makeGeo(n);
      for (const kind of ['row', 'column', 'box']) {
        expect(geo.units[kind]).toHaveLength(n);
        const all = geo.units[kind].flat().toSorted((a, b) => a - b);
        expect(all).toEqual([...Array(n * n).keys()]);
      }
    },
  );

  it('puts the right squares in a 6×6 box (2 rows × 3 columns)', () => {
    expect(makeGeo(6).units.box[0]).toEqual([0, 1, 2, 6, 7, 8]);
  });
});

describe('solve', () => {
  const geo = makeGeo(4);

  it('finds more than one solution for an empty board', () => {
    expect(solve(Array(16).fill(0), geo, 2)).toBe(2);
  });

  it('returns 0 for a board that already breaks the rules', () => {
    const board = Array(16).fill(0);
    board[0] = 1;
    board[1] = 1;
    expect(solve(board, geo, 2)).toBe(0);
  });

  it('fills a board with a valid random solution', () => {
    const board = Array(16).fill(0);
    solve(board, geo, 1, true);
    expect(isValidSolution(board, geo)).toBe(true);
  });
});

describe('makePuzzle', () => {
  it.each(
    Object.keys(SIZES).flatMap((n) =>
      ['easy', 'medium', 'hard'].map((diff) => ({ n: Number(n), diff })),
    ),
  )('makes a $n×$n $diff puzzle with exactly one solution', ({ n, diff }) => {
    const geo = makeGeo(n);
    const { puzzle, solution } = makePuzzle(n, diff);

    expect(isValidSolution(solution, geo)).toBe(true);
    // every starting gummy agrees with the solution
    expect(puzzle.filter((v, i) => v && v !== solution[i])).toEqual([]);
    // never fewer gummies than the difficulty asks for
    expect(puzzle.filter(Boolean).length).toBeGreaterThanOrEqual(TARGET_GIVENS[n][diff]);
    expect(solve([...puzzle], geo, 2)).toBe(1);
  });
});

describe('board checks', () => {
  const geo = makeGeo(4);

  it('lists the gummies that fit a square', () => {
    const board = [...SOLVED_4];
    board[0] = 0;
    expect(candidates(board, geo, 0)).toEqual([1]);
  });

  it('finds squares that clash', () => {
    const board = Array(16).fill(0);
    board[0] = 2;
    board[3] = 2; // same row
    board[5] = 3;
    expect([...conflicts(board, geo)].toSorted()).toEqual([0, 3]);
  });

  it('reports every unit a finished square completes', () => {
    expect(completedUnits(SOLVED_4, geo, 0)).toEqual(['row', 'column', 'box']);
    const board = [...SOLVED_4];
    board[15] = 0;
    expect(completedUnits(board, geo, 0)).toEqual(['row', 'column', 'box']);
    expect(completedUnits(board, geo, 12)).toEqual(['column', 'box']);
  });
});

describe('findHint', () => {
  const geo = makeGeo(4);

  it('points out a wrong gummy first', () => {
    const board = [...SOLVED_4];
    board[5] = 0;
    board[0] = 2; // wrong (clashes too, but it's the wrong answer that matters)
    expect(findHint(board, SOLVED_4, geo)).toEqual({ type: 'wrong', i: 0 });
  });

  it('ignores starting gummies when looking for wrong ones', () => {
    const board = [...SOLVED_4];
    board[0] = 2;
    board[6] = 0;
    const hint = findHint(board, SOLVED_4, geo, (i) => i === 0);
    expect(hint.type).not.toBe('wrong');
  });

  it('finds the square where only one gummy fits', () => {
    const board = [...SOLVED_4];
    board[6] = 0;
    expect(findHint(board, SOLVED_4, geo)).toEqual({ type: 'single', i: 6, v: 1 });
  });

  it('returns null when the board is complete', () => {
    expect(findHint([...SOLVED_4], SOLVED_4, geo)).toBeNull();
  });

  it('always suggests a gummy that matches the solution', () => {
    const { puzzle, solution } = makePuzzle(9, 'hard');
    const hint = findHint(puzzle, solution, makeGeo(9), (i) => puzzle[i] > 0);
    expect(hint.v).toBe(solution[hint.i]);
  });
});

describe('maybes', () => {
  const geo = makeGeo(4);

  it('reads the gummy from a one-maybe mask', () => {
    expect(noteOf(0)).toBe(0);
    expect(noteOf(bit(3))).toBe(3);
  });

  it('clears the square and tidies the same maybe from its row, column and box', () => {
    const board = Array(16).fill(0);
    const notes = Array(16).fill(0);
    notes[0] = bit(1); // the square itself
    notes[3] = bit(2); // same row, the gummy being placed
    notes[5] = bit(2); // same box
    notes[10] = bit(2); // not a peer: stays
    notes[1] = bit(4); // peer, different gummy: stays
    const changes = placementNoteChanges(board, notes, geo, 0, 2);
    expect(Object.fromEntries(changes)).toEqual({ 0: 0, 3: 0, 5: 0 });
  });

  it("leaves other squares' maybes alone when the gummy clashes", () => {
    const board = Array(16).fill(0);
    board[1] = 2;
    const notes = Array(16).fill(0);
    notes[3] = bit(2);
    const changes = placementNoteChanges(board, notes, geo, 0, 2);
    expect(Object.fromEntries(changes)).toEqual({ 0: 0 });
  });
});

describe('undo and redo', () => {
  it('undoes and redoes a gummy together with its maybe changes', () => {
    const board = [0, 0, 0];
    const notes = [4, 4, 0];
    const entry = makeEntry(
      board,
      notes,
      0,
      2,
      new Map([
        [0, 0],
        [1, 0],
      ]),
    );

    applyEntry(board, notes, entry, true);
    expect(board).toEqual([2, 0, 0]);
    expect(notes).toEqual([0, 0, 0]);

    applyEntry(board, notes, entry, false);
    expect(board).toEqual([0, 0, 0]);
    expect(notes).toEqual([4, 4, 0]);
  });

  it('records nothing when nothing changes', () => {
    expect(makeEntry([1, 0], [0, 0], 0, 1, new Map([[1, 0]]))).toBeNull();
  });
});

describe('shuffle', () => {
  it('keeps every item', () => {
    const items = [...Array(20).keys()];
    expect(shuffle([...items]).toSorted((a, b) => a - b)).toEqual(items);
  });

  it('uses the random source it is given', () => {
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });
});
