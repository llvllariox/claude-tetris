# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

Tetris en JavaScript vanilla + HTML5 Canvas. Sin dependencias, sin `package.json`, sin bundler ni transpilador. Todo el proyecto son 3 archivos: `index.html`, `style.css`, `game.js`.

## Ejecutar / probar cambios

No hay build ni tests. Para probar cambios, abrir `index.html` directo en el navegador o levantar un server estático:

```bash
python3 -m http.server 8000
# o
npx serve .
```

No existen linter ni test runner configurados en el repo.

## Arquitectura (`game.js`)

Todo el estado y lógica vive en variables globales a nivel de módulo (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) — no hay clases ni módulos separados.

- **Tablero**: matriz `ROWS × COLS` (20×10). Cada celda es `0` (vacía) o índice 1–7 que indexa `COLORS`.
- **Piezas**: matrices cuadradas en `PIECES`. Rotación vía `rotateCW` (transposición + reverso de filas), sin matriz de rotación real.
- **Wall kicks** (`tryRotate`): tras rotar, prueba desplazamientos `[0, -1, 1, -2, 2]` en x hasta encontrar una posición sin colisión.
- **Colisión** (`collide`): única función de chequeo de límites/solapamiento; se reutiliza para movimiento, rotación y ghost piece.
- **Loop de juego** (`loop`): basado en `requestAnimationFrame`, acumula `dt` en `dropAccum` y baja la pieza cuando supera `dropInterval`.
- **Líneas completas** (`clearLines`): recorre de abajo hacia arriba, usa `splice`/`unshift`; al eliminar una fila reprocesa el mismo índice (`r++` dentro del loop descendente).
- **Puntuación/nivel**: `LINE_SCORES = [0,100,300,500,800]` × `level`; nivel sube cada 10 líneas; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Ghost piece**: `ghostY()` proyecta hacia abajo la posición final antes de dibujar con `globalAlpha = 0.2`.
- Input por `keydown` global (flechas, `X` rotar, `Space` hard drop, `P` pausa). Reinicio vía botón `#restart-btn` que llama `init()`.

Si se cambia `COLS`, `ROWS` o `BLOCK` en `game.js`, hay que actualizar también `width`/`height` de `<canvas id="board">` en `index.html` (`COLS×BLOCK` por `ROWS×BLOCK`).
