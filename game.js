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

const SKIN_PALETTES = {
  retro: COLORS,
  neon: [
    null,
    '#00fff2', '#faff00', '#ff2df9', '#39ff6a',
    '#ff2d55', '#3d8bff', '#ff9900', '#e8fbff',
  ],
  pastel: [
    null,
    '#a8dadc', '#ffe8a3', '#d9b8e8', '#b8e8c1',
    '#f7b7c2', '#b8d0f0', '#f9d3a8', '#dcdcdc',
  ],
  pixel: COLORS,
};

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
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme = localStorage.getItem('tetris-theme') || 'dark';
let skin = SKIN_PALETTES[localStorage.getItem('tetris-skin')] ? localStorage.getItem('tetris-skin') : 'retro';
let gridColor = '#22222e';

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
    updateHUD();
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
  const color = SKIN_PALETTES[skin][colorIndex];
  const a = alpha ?? 1;
  switch (skin) {
    case 'neon':
      drawBlockNeon(context, x, y, color, size, a);
      break;
    case 'pastel':
      drawBlockPastel(context, x, y, color, size, a);
      break;
    case 'pixel':
      drawBlockPixel(context, x, y, color, size, a);
      break;
    default:
      drawBlockRetro(context, x, y, color, size, a);
  }
}

function drawBlockRetro(context, x, y, color, size, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockNeon(context, x, y, color, size, alpha) {
  context.save();
  context.globalAlpha = alpha;
  const px = x * size + 3, py = y * size + 3, s = size - 6;
  context.shadowColor = color;
  context.shadowBlur = size * 0.6;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,255,255,0.5)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  context.restore();
}

function roundedRectPath(context, px, py, s, r) {
  if (context.roundRect) {
    context.beginPath();
    context.roundRect(px, py, s, s, r);
    return;
  }
  context.beginPath();
  context.moveTo(px + r, py);
  context.arcTo(px + s, py, px + s, py + s, r);
  context.arcTo(px + s, py + s, px, py + s, r);
  context.arcTo(px, py + s, px, py, r);
  context.arcTo(px, py, px + s, py, r);
  context.closePath();
}

function drawBlockPastel(context, x, y, color, size, alpha) {
  context.save();
  context.globalAlpha = alpha;
  const px = x * size + 2, py = y * size + 2, s = size - 4;
  const r = size * 0.25;
  context.fillStyle = color;
  roundedRectPath(context, px, py, s, r);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.4)';
  roundedRectPath(context, px + s * 0.15, py + s * 0.12, s * 0.7, r * 0.6);
  context.fill();
  context.restore();
}

function drawBlockPixel(context, x, y, color, size, alpha) {
  context.save();
  context.globalAlpha = alpha;
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  const sub = s / 3;
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if ((i + j) % 2 === 0) context.fillRect(px + i * sub, py + j * sub, sub, sub);
  context.strokeStyle = 'rgba(0,0,0,0.4)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  context.restore();
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
  overlay.classList.remove('hidden');
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

function updateGridColor() {
  // Neon usa fondo negro puro fijo, independiente del tema claro/oscuro,
  // así que la grilla se calcula aparte en vez de leer --grid-line.
  gridColor = skin === 'neon'
    ? 'rgba(0, 255, 242, 0.12)'
    : getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
}

function applyTheme() {
  document.body.classList.toggle('light-theme', theme === 'light');
  if (themeToggle) themeToggle.checked = theme === 'light';
  updateGridColor();
  if (current) draw();
  if (next) drawNext();
}

themeToggle?.addEventListener('change', () => {
  theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem('tetris-theme', theme);
  applyTheme();
});

function applySkin() {
  document.body.classList.remove('skin-retro', 'skin-neon', 'skin-pastel', 'skin-pixel');
  document.body.classList.add(`skin-${skin}`);
  if (skinSelect) skinSelect.value = skin;
  updateGridColor();
  if (current) draw();
  if (next) drawNext();
}

skinSelect?.addEventListener('change', () => {
  skin = skinSelect.value;
  localStorage.setItem('tetris-skin', skin);
  applySkin();
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
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
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

applyTheme();
applySkin();
init();
