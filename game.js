'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul palido
  '#ffb74d', // L - orange
  '#b0bec5', // Nut - gris metálico
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (tuerca, hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const overlayRecords = document.getElementById('overlay-records');
const startRecords = document.getElementById('start-records');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');

const RECORDS_KEY = 'tetris-records';
const BEST_COMBO_KEY = 'tetris-best-combo';
const MAX_LINES_KEY = 'tetris-max-lines';
const MAX_RECORDS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme = localStorage.getItem('tetris-theme') || 'dark';
let gridColor = '#22222e';
let records = loadRecords();
let bestCombo = Number(localStorage.getItem(BEST_COMBO_KEY)) || 0;
let maxLines = Number(localStorage.getItem(MAX_LINES_KEY)) || 0;
let comboCounter = 0;
let pendingRecordIndex = -1;

function loadRecords() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function qualifiesForRecords(candidateScore) {
  if (records.length < MAX_RECORDS) return true;
  return candidateScore > records[records.length - 1].score;
}

function addRecord(nombre, candidateScore) {
  records.push({ nombre: nombre || 'Anónimo', score: candidateScore });
  records.sort((a, b) => b.score - a.score);
  records = records.slice(0, MAX_RECORDS);
  saveRecords();
  return records.findIndex(r => r.nombre === (nombre || 'Anónimo') && r.score === candidateScore);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderRecords(container, highlightIndex) {
  if (!container) return;
  container.innerHTML = '';
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Sin records todavía';
    container.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'records-table';
  records.forEach((rec, i) => {
    const row = document.createElement('tr');
    if (i === highlightIndex) row.classList.add('record-highlight');
    row.innerHTML = `<td>${i + 1}</td><td>${escapeHtml(rec.nombre)}</td><td>${rec.score.toLocaleString()}</td>`;
    table.appendChild(row);
  });
  container.appendChild(table);
}

function renderAllRecords(highlightIndex) {
  renderRecords(overlayRecords, highlightIndex);
  renderRecords(startRecords, -1);
}

function updateStatsHUD() {
  if (bestComboEl) bestComboEl.textContent = bestCombo;
  if (maxLinesEl) maxLinesEl.textContent = maxLines;
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    comboCounter += cleared;
    if (comboCounter > bestCombo) {
      bestCombo = comboCounter;
      localStorage.setItem(BEST_COMBO_KEY, bestCombo);
      updateStatsHUD();
    }
    updateHUD();
  } else {
    comboCounter = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawNutHole(context, ox, oy, size, alpha) {
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = 'rgba(0,0,0,0.55)';
  context.lineWidth = Math.max(2, size * 0.12);
  const cx = (ox + 1.5) * size;
  const cy = (oy + 1.5) * size;
  context.beginPath();
  context.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === 8) drawNutHole(ctx, current.x, gy, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === 8) drawNutHole(ctx, current.x, current.y, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === 8) drawNutHole(nextCtx, offX, offY, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  if (lines > maxLines) {
    maxLines = lines;
    localStorage.setItem(MAX_LINES_KEY, maxLines);
  }
  updateStatsHUD();

  if (qualifiesForRecords(score)) {
    pendingRecordIndex = -1;
    nameForm.classList.remove('hidden');
    nameInput.value = '';
    renderAllRecords(-1);
  } else {
    nameForm.classList.add('hidden');
    renderAllRecords(-1);
  }

  overlay.classList.remove('hidden');
}

function submitName() {
  const idx = addRecord(nameInput.value.trim(), score);
  pendingRecordIndex = idx;
  nameForm.classList.add('hidden');
  renderAllRecords(idx);
}

function resetRecords() {
  records = [];
  saveRecords();
  renderAllRecords(-1);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameForm.classList.add('hidden');
    overlayRecords.innerHTML = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function applyTheme() {
  document.body.classList.toggle('light-theme', theme === 'light');
  if (themeToggle) themeToggle.checked = theme === 'light';
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  if (current) draw();
  if (next) drawNext();
}

themeToggle?.addEventListener('change', () => {
  theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem('tetris-theme', theme);
  applyTheme();
});

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  comboCounter = 0;
  pendingRecordIndex = -1;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameForm.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

nameForm?.addEventListener('submit', e => {
  e.preventDefault();
  submitName();
});

resetRecordsBtn?.addEventListener('click', resetRecords);

applyTheme();
updateStatsHUD();
renderAllRecords(-1);
init();
