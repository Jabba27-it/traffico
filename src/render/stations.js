// Disegno delle stazioni: una forma piena con un colore per ogni tipo.

import { STATION_RADIUS } from '../sim/stations.js';

/** @typedef {import('../sim/stations.js').Station} Station */
/** @typedef {import('../sim/stations.js').Shape} Shape */

/** @type {Record<Shape, string>} */
export const SHAPE_COLORS = {
  cerchio: '#e0533d',
  quadrato: '#2f7fc1',
  triangolo: '#e9a23b',
  pentagono: '#4d9a5b',
  esagono: '#8a5bb5',
  stella: '#d6487f',
};

const OUTLINE = '#ffffff';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Station[]} stations
 */
export function drawStations(ctx, stations) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  for (const s of stations) {
    ctx.beginPath();
    traceShape(ctx, s.shape, s.x, s.y, STATION_RADIUS);
    ctx.fillStyle = SHAPE_COLORS[s.shape];
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Traccia la forma centrata in (x, y). Le dimensioni sono ritoccate a occhio
 * perché tutte le forme sembrino grandi uguali.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Shape} shape
 * @param {number} x
 * @param {number} y
 * @param {number} r
 */
export function traceShape(ctx, shape, x, y, r) {
  switch (shape) {
    case 'cerchio':
      ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
      break;
    case 'quadrato':
      ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
      break;
    case 'triangolo':
      polygon(ctx, x, y + r * 0.15, r * 1.1, 3);
      break;
    case 'pentagono':
      polygon(ctx, x, y + r * 0.05, r * 0.95, 5);
      break;
    case 'esagono':
      polygon(ctx, x, y, r * 0.92, 6);
      break;
    case 'stella':
      star(ctx, x, y + r * 0.08, r * 1.1, r * 0.5, 5);
      break;
  }
}

/**
 * Poligono regolare con un vertice in alto.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number} sides
 */
function polygon(ctx, x, y, r, sides) {
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} outer
 * @param {number} inner
 * @param {number} points
 */
function star(ctx, x, y, outer, inner, points) {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
