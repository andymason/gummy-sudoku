// Gummy Sudoku: the page. Game rules live in sudoku.js.
import {
  GUMMIES,
  SIZES,
  SIZE_NAMES,
  UNIT_KINDS,
  nameOf,
  aName,
  noteOf,
  makeGeo,
  makePuzzle,
  conflicts,
  completedUnits,
  findHint,
  placementNoteChanges,
  makeEntry,
  applyEntry,
} from './sudoku.js';

const src = (v) => `icons/gummies/${GUMMIES[v - 1].id}.svg`;
const CHEERS = ['Sweet!', 'Tasty!', 'Delicious!', 'Divine!', 'Yummy!'];
const STORE_KEY = 'gummy-sudoku-v2';
const HINT_MS = 6000; // how long a hint stays before fading away
const WRONG_MS = 3500; // how long wrong gummies stay circled

const $ = (s) => document.querySelector(s);
const boardEl = $('#board');
const paletteEl = $('#palette');
const msgEl = $('#msg');
const undoBtn = $('#undoBtn');
const redoBtn = $('#redoBtn');
const maybeBtn = $('#maybeBtn');
const hintBtn = $('#hintBtn');
const checkBtn = $('#checkBtn');
const dialogs = [...document.querySelectorAll('dialog')];

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- storage (optional; the game works without it) ----------
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || null;
  } catch {
    return null;
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot()));
  } catch {}
}

// ---------- state ----------
let S = null; // game: n, diff, solution, board, given, notes, history, future, won
let geo = null;
const settings = { helper: false, sound: true, seenHelp: false };
let selected = null; // gummy-first mode: 1..n, 0 = take out, null = off
let activeCell = null; // square-first mode: the square waiting for a gummy
let focusIdx = 0; // keyboard position on the board
let notesMode = false; // Maybe mode: gummies become small corner reminders
let hintAt = null; // { i, v, fading } ghost shown by the Hint button
let hintTimer = 0;
let hintMsg = '';
const flashWrong = new Set();
let wrongTimer = 0;

const locked = (i) => S.given[i];
const countOf = (v) => S.board.filter((x) => x === v).length;
const isSolved = () => S.board.every((x, k) => x === S.solution[k]);

function snapshot() {
  return { game: S, settings, selected, activeCell, focusIdx, notesMode };
}

function newGame(n, diff) {
  const { solution, puzzle } = makePuzzle(n, diff);
  S = {
    n,
    diff,
    solution,
    board: [...puzzle],
    given: puzzle.map((v) => v > 0),
    notes: puzzle.map(() => 0),
    history: [],
    future: [],
    won: false,
  };
  selected = null;
  activeCell = null;
  clearHint();
  notesMode = false;
  focusIdx = 0;
  flashWrong.clear();
  setup();
  say('Tap an empty square, then tap a gummy to fill it.');
  save();
}

// ---------- building the UI ----------
function setup() {
  geo = makeGeo(S.n);
  const { n, br, bc } = geo;
  boardEl.style.setProperty('--n', n);
  boardEl.style.setProperty('--nk', n === 9 ? 1 : n === 6 ? 0.85 : 0.7);
  const cells = [];
  for (let i = 0; i < n * n; i++) {
    const r = geo.rowOf(i);
    const c = geo.colOf(i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    b.dataset.i = i;
    b.setAttribute('role', 'gridcell');
    if ((Math.floor(r / br) + Math.floor(c / bc)) % 2) b.classList.add('alt');
    if (c === n - 1) b.classList.add('ex');
    else if ((c + 1) % bc === 0) b.classList.add('bx');
    if (r === n - 1) b.classList.add('ey');
    else if ((r + 1) % br === 0) b.classList.add('by');
    b.appendChild(document.createElement('img')).alt = '';
    const note = b.appendChild(document.createElement('img'));
    note.className = 'notes';
    note.alt = '';
    note.hidden = true;
    cells.push(b);
  }
  boardEl.replaceChildren(...cells);
  const items = n + 1;
  paletteEl.style.setProperty('--pc', items <= 7 ? items : Math.ceil(items / 2));
  let palette = '';
  for (let v = 1; v <= n; v++) {
    palette += `<button type="button" class="pbtn" data-v="${v}"><img src="${src(v)}" alt=""><span class="badge"></span></button>`;
  }
  palette += `<button type="button" class="pbtn eraser" data-v="0" aria-label="Take a gummy out" title="Take a gummy out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21z"/><path d="M22 21H7M5 11l9 9"/></svg></button>`;
  paletteEl.innerHTML = palette;
  $('#mode').textContent = `${SIZE_NAMES[n]} · ${cap(S.diff)}`;
  render();
}

function render() {
  const bad = conflicts(S.board, geo);
  const cells = boardEl.children;
  const act = activeCell;
  const actPeers = act !== null ? new Set(geo.peers[act]) : null;
  // gummy to highlight around the board: the chosen one, or the one in the active square
  const focusGummy = selected > 0 ? selected : act !== null ? S.board[act] : 0;
  for (let i = 0; i < cells.length; i++) {
    const el = cells[i];
    const v = S.board[i];
    const [img, noteImg] = el.children;
    let blocked = false;
    let ghost = false;
    let shown = v;
    const isHint = hintAt?.i === i && !v;
    if (isHint) shown = hintAt.v;
    else if (settings.helper && selected > 0 && !v) {
      blocked = geo.peers[i].some((p) => S.board[p] === selected);
      ghost = !blocked;
      if (ghost) shown = selected;
    }
    if (shown) {
      const s = src(shown);
      if (img.getAttribute('src') !== s) img.setAttribute('src', s);
      img.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
    }
    el.classList.toggle('given', locked(i));
    el.classList.toggle('blocked', blocked);
    el.classList.toggle('ghost', ghost);
    el.classList.toggle('hint', isHint);
    el.classList.toggle('fading', isHint && hintAt.fading);
    el.classList.toggle('active', i === act);
    el.classList.toggle('peer', !!actPeers?.has(i));
    el.classList.toggle('same', !!v && v === focusGummy && i !== act);
    el.classList.toggle('bad', bad.has(i));
    el.classList.toggle('wrong', flashWrong.has(i));
    el.tabIndex = i === focusIdx ? 0 : -1;
    const note = v ? 0 : noteOf(S.notes[i]); // one maybe per square
    if (+noteImg.dataset.v !== note) {
      noteImg.dataset.v = note;
      if (note) noteImg.src = src(note);
      else noteImg.removeAttribute('src');
      noteImg.hidden = !note;
    }
    const where = `row ${geo.rowOf(i) + 1}, column ${geo.colOf(i) + 1}`;
    let label = `empty, ${where}`;
    if (v) label = `${nameOf(v)}, ${where}${locked(i) ? ', fixed' : ''}`;
    else if (note) label = `empty, maybe ${nameOf(note)}, ${where}`;
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-selected', String(i === act));
  }
  // in square-first mode, grey out gummies that can't go in the active square
  const nope =
    settings.helper && act !== null && !S.board[act] && !locked(act)
      ? new Set(geo.peers[act].map((p) => S.board[p]))
      : null;
  for (const b of paletteEl.children) {
    const v = +b.dataset.v;
    b.setAttribute('aria-pressed', String(selected === v));
    if (v > 0) {
      const left = S.n - countOf(v);
      b.classList.toggle('done', left <= 0);
      b.classList.toggle('nope', !!nope?.has(v));
      b.querySelector('.badge').textContent = left <= 0 ? '✓' : left;
      b.setAttribute('aria-label', `${nameOf(v)}, ${left <= 0 ? 'all placed' : left + ' left'}`);
    }
  }
  undoBtn.disabled = !S.history.length || S.won;
  redoBtn.disabled = !S.future.length || S.won;
  maybeBtn.setAttribute('aria-pressed', String(notesMode));
  maybeBtn.disabled = S.won;
  $('#maybePill').textContent = notesMode ? 'ON' : 'OFF';
  $('#tray').classList.toggle('notes', notesMode);
  hintBtn.disabled = S.won;
  checkBtn.disabled = S.won;
}

function say(text, mood = '') {
  msgEl.textContent = text;
  msgEl.className = mood ? `msg ${mood}` : 'msg';
}

// ---------- sound ----------
let actx = null;
function tone(freq, dur = 0.12, type = 'sine', vol = 0.12, when = 0) {
  if (!settings.sound) return;
  try {
    actx ??= new AudioContext();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + when;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.4, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  } catch {}
}
const sPop = (v) => tone(392 * 2 ** (((v - 1) * 2) / 12), 0.12, 'triangle', 0.14);
const sSweet = (v) => {
  tone(660 * 2 ** ((v - 1) / 12), 0.09, 'sine', 0.1);
  tone(990 * 2 ** ((v - 1) / 12), 0.14, 'sine', 0.08, 0.07);
};
const sTap = () => tone(660, 0.05, 'sine', 0.05);
const sBad = () => {
  tone(180, 0.18, 'square', 0.05);
  tone(140, 0.22, 'square', 0.05, 0.1);
};
const sChime = () =>
  [0, 4, 7, 12].forEach((s, k) => tone(523 * 2 ** (s / 12), 0.16, 'sine', 0.1, k * 0.07));
const sWin = () =>
  [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, k) =>
    tone(523 * 2 ** (s / 12), 0.22, 'triangle', 0.1, k * 0.1),
  );

// ---------- effects ----------
// Restarts a CSS animation class on each square, removing it after `ms`.
function pulse(indices, cls, ms) {
  for (const i of indices) {
    const el = boardEl.children[i];
    el.classList.remove(cls);
    void el.offsetWidth; // reflow, so re-adding the class replays the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }
}

// Circles wrong gummies in red for a moment.
function showWrong(indices) {
  flashWrong.clear();
  for (const i of indices) flashWrong.add(i);
  render();
  clearTimeout(wrongTimer);
  wrongTimer = setTimeout(() => {
    flashWrong.clear();
    render();
  }, WRONG_MS);
}

// ---------- moves ----------
// Every change goes through record(), so Undo and Redo cover gummies and maybes alike.
function record(i, to, noteChanges) {
  const entry = makeEntry(S.board, S.notes, i, to, noteChanges);
  if (!entry) return false;
  applyEntry(S.board, S.notes, entry, true);
  S.history.push(entry);
  S.future = [];
  return true;
}

function place(i, v) {
  if (S.won || locked(i)) return;
  const prev = S.board[i];
  if (prev === v) return;
  record(i, v, placementNoteChanges(S.board, S.notes, geo, i, v));
  clearHint();
  flashWrong.delete(i);
  render();
  if (!v) {
    tone(260, 0.08, 'sine', 0.08);
    say('Taken out.');
    save();
    return;
  }

  const name = nameOf(v);
  for (const kind of UNIT_KINDS) {
    const clash = geo.unitOf(kind, i).filter((p) => p !== i && S.board[p] === v);
    if (clash.length) {
      pulse([i], 'placed', 300);
      sBad();
      pulse([i, ...clash], 'shake', 460);
      say(`Oops! There's already ${aName(v)} in this ${kind}.`, 'bad');
      save();
      return;
    }
  }
  if (v === S.solution[i]) {
    yum(i);
    sSweet(v);
  } else {
    pulse([i], 'placed', 300);
    sPop(v);
  }
  if (isSolved()) {
    win();
    save();
    return;
  }

  const done = completedUnits(S.board, geo, i);
  for (const kind of done) pulse(geo.unitOf(kind, i), 'sparkle', 760);
  const allPlaced = countOf(v) === S.n;
  if (done.length) {
    sChime();
    say(`${pick(CHEERS)} ${cap(done.join(' and '))} complete.`, 'ok');
  } else if (allPlaced) {
    sChime();
    say(`That's every ${name} on the board!`, 'ok');
  } else say('');
  if (allPlaced && selected === v) selected = nextUnfinished(v);
  render();
  save();
}

function toggleNote(i, v) {
  if (S.won || locked(i)) return;
  if (S.board[i]) {
    render();
    say('Take the gummy out first, then you can add a maybe.');
    return;
  }
  const had = S.notes[i];
  const after = had === 1 << v ? 0 : 1 << v; // one maybe per square
  record(i, 0, new Map([[i, after]]));
  clearHint();
  tone(after ? 880 : 520, 0.06, 'sine', 0.06);
  render();
  save();
  say(!after ? 'Maybe cleared.' : had ? `Maybe changed to ${nameOf(v)}.` : `Maybe ${nameOf(v)}.`);
}

function clearSquare(i) {
  if (S.won || locked(i)) return;
  if (S.board[i]) return place(i, 0);
  if (S.notes[i]) {
    record(i, 0, new Map([[i, 0]]));
    tone(260, 0.08, 'sine', 0.08);
    render();
    save();
    say('Maybes cleared.');
    return;
  }
  render();
  say('That square is already empty.');
}

function toggleNotesMode() {
  if (S.won) return;
  notesMode = !notesMode;
  if (notesMode && selected === 0) selected = null;
  sTap();
  render();
  save();
  say(
    notesMode
      ? 'Maybe mode on. Tap a gummy to jot a small reminder in a square.'
      : 'Maybe mode off. Gummies go in for real again.',
  );
}

// A small, sweet reward for a gummy in exactly the right place.
function yum(i) {
  pulse([i], 'yum', 600);
  if (reducedMotion()) return;
  const el = boardEl.children[i];
  const burst = document.createElement('span');
  burst.className = 'burst';
  burst.style.setProperty('--d', `${Math.round(el.clientWidth * 0.8)}px`);
  const colours = ['#FF4F8B', '#29B6F6', '#3DD68C', '#B26BFF'];
  const spin = Math.random() * 45;
  for (let k = 0; k < 8; k++) {
    const s = document.createElement('i');
    s.style.setProperty('--a', `${spin + k * 45}deg`);
    s.style.setProperty('--c', colours[k % colours.length]);
    s.style.animationDelay = `${(k % 2) * 40}ms`;
    burst.appendChild(s);
  }
  el.appendChild(burst);
  setTimeout(() => burst.remove(), 800);
}

function nextUnfinished(from) {
  for (let k = 1; k <= S.n; k++) {
    const v = ((from - 1 + k) % S.n) + 1;
    if (countOf(v) < S.n) return v;
  }
  return null;
}

// Hints fade after HINT_MS, or go at once when a square is tapped.
function clearHint() {
  clearTimeout(hintTimer);
  if (!hintAt) return;
  hintAt = null;
  if (msgEl.textContent === hintMsg) say('');
}
function fadeHint() {
  if (!hintAt) return;
  hintAt.fading = true;
  render();
  hintTimer = setTimeout(() => {
    clearHint();
    render();
  }, 600);
}

function tapCell(i) {
  focusIdx = i;
  if (S.won) return;
  const wasHint = hintAt?.i === i;
  clearHint();
  const v = S.board[i];

  if (locked(i)) {
    if (selected !== null) {
      selected = v;
      activeCell = null;
      render();
      say(`${cap(nameOf(v))} chosen. Tap squares to drop it in.`);
    } else {
      activeCell = i;
      render();
      say(`That ${nameOf(v)} was there at the start, so it stays put.`);
    }
    return;
  }
  // gummy-first: drop the chosen gummy in (or take out)
  if (selected !== null) {
    activeCell = null;
    if (selected === 0) clearSquare(i);
    else if (notesMode) toggleNote(i, selected);
    else place(i, v === selected ? 0 : selected);
    return;
  }
  // square-first: choose the square, then a gummy
  if (activeCell === i && !wasHint) {
    activeCell = null;
    render();
    say('');
    return;
  }
  activeCell = i;
  sTap();
  render();
  if (notesMode)
    say(
      v
        ? 'Take the gummy out first, then you can add a maybe.'
        : 'Now tap a gummy to jot it in as a maybe.',
    );
  else
    say(
      v
        ? 'Tap a different gummy to swap it, or the rubber to take it out.'
        : 'Now tap a gummy to put it here.',
    );
}

function pickGummy(v) {
  if (S.won) return;
  // square-first: fill the waiting square
  if (activeCell !== null && !locked(activeCell)) {
    const cur = S.board[activeCell];
    if (v === 0) clearSquare(activeCell);
    else if (notesMode) toggleNote(activeCell, v);
    else {
      const at = activeCell;
      place(at, cur === v ? 0 : v);
      if (S.board[at]) {
        activeCell = null;
        render();
      } // filled: let go, so the next gummy tap can't overwrite it
    }
    return;
  }
  // gummy-first: choose (or un-choose) a gummy
  activeCell = null;
  selected = selected === v ? null : v;
  render();
  if (selected === 0) say('Tap a square to take its gummy or maybes out.');
  else if (selected && notesMode) say(`Tap squares to jot in a maybe ${nameOf(selected)}.`);
  else if (selected) {
    const left = S.n - countOf(selected);
    say(
      left > 0
        ? `${cap(nameOf(selected))}: ${left} more to place.${settings.helper ? ' Striped squares are no-go.' : ''}`
        : `Every ${nameOf(selected)} is already on the board.`,
    );
  } else say('Tap an empty square, then tap a gummy to fill it.');
}

function undo() {
  if (S.won || !S.history.length) return;
  const h = S.history.pop();
  applyEntry(S.board, S.notes, h, false);
  S.future.push(h);
  clearHint();
  focusIdx = h.i;
  render();
  pulse([h.i], 'placed', 300);
  say('Undone. Tap Redo to bring it back.');
  save();
}

function redo() {
  if (S.won || !S.future.length) return;
  const h = S.future.pop();
  applyEntry(S.board, S.notes, h, true);
  S.history.push(h);
  clearHint();
  focusIdx = h.i;
  render();
  pulse([h.i], 'placed', 300);
  say('Redone.');
  if (isSolved()) win();
  save();
}

// Shows (never fills) the next logical gummy, with the reason why it goes there.
function hint() {
  if (S.won) return;
  clearHint();
  const h = findHint(S.board, S.solution, geo, locked);
  if (!h) return;
  selected = null;
  notesMode = false;
  activeCell = focusIdx = h.i;
  if (h.type === 'wrong') {
    showWrong([h.i]);
    sBad();
    say(`This ${nameOf(S.board[h.i])} is in the wrong square. Try taking it out.`, 'bad');
    return;
  }
  const why = {
    single: `Only ${aName(h.v)} fits here.`,
    'only-spot': `This ${h.kind} needs ${aName(h.v)}, and it only fits here.`,
    answer: `Try ${aName(h.v)} here.`,
  }[h.type];
  hintAt = { i: h.i, v: h.v, fading: false };
  flashWrong.clear();
  hintMsg = `${why} Tap the ${nameOf(h.v)} to put it in.`;
  render();
  sChime();
  say(hintMsg);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(fadeHint, HINT_MS);
}

function check() {
  if (S.won) return;
  const wrong = S.board.flatMap((v, i) => (v && !locked(i) && v !== S.solution[i] ? [i] : []));
  showWrong(wrong);
  const k = wrong.length;
  if (!k) {
    sChime();
    say('Everything so far is right. Keep going!', 'ok');
  } else {
    sBad();
    say(
      `${k} ${k === 1 ? 'gummy is' : 'gummies are'} in the wrong place. They're circled in red.`,
      'bad',
    );
  }
}

// ---------- win ----------
function win() {
  S.won = true;
  selected = null;
  activeCell = null;
  clearHint();
  notesMode = false;
  render();
  const word = pick(CHEERS);
  $('#winTitle').textContent = word;
  $('#winText').textContent =
    `You finished the ${SIZE_NAMES[S.n]} board on ${S.diff}. Every row, column and box has one of each gummy.`;
  say(word + ' Board complete!', 'ok');
  pulse([...Array(S.n * S.n).keys()], 'sparkle', 760);
  sWin();
  setTimeout(() => {
    show($('#win'));
    confetti();
  }, 650);
}

function confetti() {
  if (reducedMotion()) return;
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  cv.hidden = false;
  const W = (cv.width = innerWidth * dpr);
  const H = (cv.height = innerHeight * dpr);
  const imgs = GUMMIES.slice(0, S.n).map((_, k) => {
    const im = new Image();
    im.src = src(k + 1);
    return im;
  });
  const parts = Array.from({ length: 70 }, () => ({
    x: Math.random() * W,
    y: -Math.random() * H * 0.8 - 40 * dpr,
    vx: (Math.random() - 0.5) * 2 * dpr,
    vy: (2 + Math.random() * 3) * dpr,
    a: Math.random() * Math.PI * 2,
    va: (Math.random() - 0.5) * 0.2,
    s: (26 + Math.random() * 26) * dpr,
    im: pick(imgs),
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06 * dpr;
      p.a += p.va;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      if (p.im.complete) ctx.drawImage(p.im, -p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    }
    if (t - t0 < 4500) requestAnimationFrame(frame);
    else {
      ctx.clearRect(0, 0, W, H);
      cv.hidden = true;
    }
  })(t0);
}

// ---------- dialogs ----------
// Native modal <dialog>s: the browser traps focus, makes the page inert and
// puts focus back where it was on close.
const show = (dialog) => dialog.open || dialog.showModal();
// The win screen, and New game after a win, need a choice before going away.
const canDismiss = (dialog) => dialog.id !== 'win' && !(dialog.id === 'newgame' && S.won);

const helpImg = (v, cls = '') => `<img src="${src(v)}" alt="${nameOf(v)}"${cls}>`;
function buildHelp() {
  const n = Math.min(S?.n ?? 4, 6);
  $('#exGood').innerHTML =
    Array.from({ length: n }, (_, k) => helpImg(k + 1)).join('') +
    '<span class="mark y" aria-label="correct">✓</span>';
  $('#exBad').innerHTML =
    [1, 2, 1, 3].map((v) => helpImg(v, v === 1 ? ' class="dup"' : '')).join('') +
    '<span class="mark n" aria-label="wrong">✗</span><small>two gummy bears in one row</small>';
}

function openNew() {
  const f = $('#newForm');
  f.size.value = String(S.n);
  f.diff.value = S.diff;
  updatePreview();
  $('#newClose').hidden = S.won;
  show($('#newgame'));
}
function updatePreview() {
  const n = +$('#newForm').size.value;
  $('#preview').innerHTML = Array.from(
    { length: n },
    (_, k) => `<img src="${src(k + 1)}" alt="">`,
  ).join('');
}

// ---------- events ----------
boardEl.addEventListener('click', (e) => {
  const c = e.target.closest('.cell');
  if (c) tapCell(+c.dataset.i);
});
paletteEl.addEventListener('click', (e) => {
  const b = e.target.closest('.pbtn');
  if (b) pickGummy(+b.dataset.v);
});
boardEl.addEventListener('keydown', (e) => {
  const n = S.n;
  const i = focusIdx;
  const r = geo.rowOf(i);
  const c = geo.colOf(i);
  const step = {
    ArrowUp: r > 0 ? -n : 0,
    ArrowDown: r < n - 1 ? n : 0,
    ArrowLeft: c > 0 ? -1 : 0,
    ArrowRight: c < n - 1 ? 1 : 0,
  };
  if (e.key in step) {
    e.preventDefault();
    focusIdx = i + step[e.key];
    if (selected === null) activeCell = focusIdx;
    render();
    boardEl.children[focusIdx].focus();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  const d = m ? +m[1] : NaN;
  if (d >= 1 && d <= n) {
    e.preventDefault();
    selected = null;
    activeCell = i;
    if (e.shiftKey && !notesMode) toggleNote(i, d);
    else pickGummy(d);
  } else if (['Backspace', 'Delete'].includes(e.key) || d === 0) {
    e.preventDefault();
    clearSquare(i);
  } else if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    toggleNotesMode();
  }
});
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
maybeBtn.addEventListener('click', toggleNotesMode);
hintBtn.addEventListener('click', hint);
checkBtn.addEventListener('click', check);
$('#helpBtn').addEventListener('click', () => {
  buildHelp();
  show($('#help'));
});
$('#setBtn').addEventListener('click', () => show($('#settings')));
$('#newBtn').addEventListener('click', openNew);
$('#newForm').addEventListener('change', updatePreview);
$('#newForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  $('#newgame').close();
  newGame(+f.size.value, f.diff.value);
  boardEl.children[0].focus({ preventScroll: true });
});
$('#winAgain').addEventListener('click', () => {
  $('#win').close();
  newGame(S.n, S.diff);
});
$('#winChange').addEventListener('click', () => {
  $('#win').close();
  openNew();
});
for (const dialog of dialogs) {
  // a click on the dialog element itself is a click on the backdrop around the card
  dialog.addEventListener('click', (e) => {
    if ((e.target === dialog || e.target.closest('[data-close]')) && canDismiss(dialog)) {
      dialog.close();
    }
  });
  dialog.addEventListener('cancel', (e) => {
    if (!canDismiss(dialog)) e.preventDefault();
  });
}
$('#help').addEventListener('close', () => {
  settings.seenHelp = true;
  save();
});
document.addEventListener('keydown', (e) => {
  if (!S || dialogs.some((d) => d.open)) return;
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      redo();
    }
    return;
  }
  if (e.key !== 'Escape') return;
  if (selected !== null || activeCell !== null) {
    selected = null;
    activeCell = null;
    render();
    say('');
  }
});
$('#helperTg').addEventListener('change', (e) => {
  settings.helper = e.target.checked;
  render();
  save();
});
$('#soundTg').addEventListener('change', (e) => {
  settings.sound = e.target.checked;
  save();
  if (settings.sound) sPop(1);
});

// ---------- start ----------
function start(data) {
  const saved = data?.game ? data : load();
  Object.assign(settings, saved?.settings);
  $('#helperTg').checked = settings.helper;
  $('#soundTg').checked = settings.sound;
  if (SIZES[saved?.game?.n]) {
    S = saved.game;
    selected = saved.selected ?? null;
    activeCell = saved.activeCell ?? null;
    focusIdx = saved.focusIdx ?? 0;
    notesMode = !!saved.notesMode;
    setup();
    say(
      S.won
        ? 'Board complete! Tap New for another.'
        : 'Welcome back! Your board is just as you left it.',
    );
  } else {
    newGame(4, 'easy');
  }
  if (!settings.seenHelp) {
    buildHelp();
    show($('#help'));
  }
}
try {
  window.claude?.hot?.snapshot?.(() => snapshot());
} catch {}
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
