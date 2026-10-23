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
  rombo: '#1f9e9a',
  croce: '#9c6b3d',
  mezzaluna: '#3d4e8a',
  goccia: '#8fae2f',
};

const OUTLINE = '#ffffff';
/** Durata dell'animazione di comparsa di una stazione, in secondi. */
const APPEAR_TIME = 0.5;

const QUEUE_COLOR = '#8d9097';
const NAME_COLOR = '#5b5e65';
const DISTRICT_COLOR = '#8a8d93';
const QUEUE_ITEM_RADIUS = 5;
const QUEUE_SPACING = 13;
const QUEUE_PER_ROW = 6;
const QUEUE_MAX_ROWS = 2;

/**
 * Lo spazio che ogni stazione occupa sulla mappa: la forma con l'anello, la
 * coda sopra e il nome sotto. Serve agli altri nomi per non finirci sopra.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Station[]} stations
 * @param {number} [labelScale]
 * @returns {{x: number, y: number, width: number, height: number}[]}
 */
export function stationAreas(ctx, stations, labelScale = 1) {
  const ring = STATION_RADIUS + 12;
  const queueHeight = QUEUE_MAX_ROWS * QUEUE_SPACING + QUEUE_ITEM_RADIUS;
  const queueWidth = QUEUE_PER_ROW * QUEUE_SPACING;
  const areas = [];
  for (const s of stations) {
    areas.push({ x: s.x - ring, y: s.y - ring - queueHeight, width: 2 * ring, height: 2 * ring + queueHeight });
    areas.push({ x: s.x - queueWidth / 2, y: s.y - ring - queueHeight, width: queueWidth, height: queueHeight });
    if (!s.name) continue;
    ctx.font = `${s.landmark ? 600 : 400} ${11 * labelScale}px system-ui, sans-serif`;
    const w = ctx.measureText(s.name).width + 6 * labelScale;
    areas.push({ x: s.x - w / 2, y: s.y + STATION_RADIUS + 12, width: w, height: 14 * labelScale });
  }
  return areas;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Station[]} stations
 * @param {Map<number, Shape[]>} transit  veicoli nascosti sotto ogni stazione che attraversano
 * @param {number} time  secondi di gioco, per l'animazione di comparsa
 * @param {number} [labelScale]  ingrandimento dei nomi, per tenerli leggibili quando la vista si allarga
 */
export function drawStations(ctx, stations, transit, time, labelScale = 1) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  for (const s of stations) {
    const grow = Math.min(1, (time - s.bornAt) / APPEAR_TIME);
    // Leggero rimbalzo: supera la misura finale e poi torna indietro.
    const scale = grow < 1 ? 1 - (1 - grow) ** 3 + Math.sin(grow * Math.PI) * 0.15 : 1;
    ctx.beginPath();
    traceShape(ctx, s.shape, s.x, s.y, STATION_RADIUS * scale);
    ctx.fillStyle = SHAPE_COLORS[s.shape];
    ctx.fill();
    ctx.stroke();
    // Stazione migliorata: un bordo in più all'interno.
    if (s.upgrades > 0) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      traceShape(ctx, s.shape, s.x, s.y, STATION_RADIUS * scale * 0.6);
      ctx.stroke();
      ctx.lineWidth = 3;
    }
  }
  for (const s of stations) drawQueue(ctx, s, [...s.queue, ...(transit.get(s.id) ?? [])]);

  // Nomi sotto la stazione e sotto l'anello della congestione: i luoghi fissi
  // in evidenza, i quartieri più leggeri.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3 * labelScale;
  ctx.strokeStyle = 'rgba(242, 239, 232, 0.9)';
  for (const s of stations) {
    if (!s.name) continue;
    ctx.font = `${s.landmark ? 600 : 400} ${11 * labelScale}px system-ui, sans-serif`;
    ctx.fillStyle = s.landmark ? NAME_COLOR : DISTRICT_COLOR;
    const y = s.y + STATION_RADIUS + 12;
    ctx.strokeText(s.name, s.x, y);
    ctx.fillText(s.name, s.x, y);
  }
}

/**
 * Mentre si sceglie la stazione da migliorare: un alone che pulsa intorno a tutte.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Station[]} stations
 * @param {number} time  secondi, per la pulsazione
 */
export function drawSelectable(ctx, stations, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 5);
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(61, 64, 71, ${0.35 + 0.45 * pulse})`;
  for (const s of stations) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, STATION_RADIUS + 12 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * La fila sopra la stazione: prima i veicoli in coda, poi quelli in transito.
 * Forme grigie in righe, la prima più vicina alla stazione. Se non stanno
 * tutte, l'ultima posizione mostra "+N".
 * @param {CanvasRenderingContext2D} ctx
 * @param {Station} s
 * @param {Shape[]} shapes
 */
function drawQueue(ctx, s, shapes) {
  const count = shapes.length;
  if (count === 0) return;
  const capacity = QUEUE_PER_ROW * QUEUE_MAX_ROWS;
  const shown = count > capacity ? capacity - 1 : count;

  ctx.fillStyle = QUEUE_COLOR;
  // Sopra l'anello della congestione.
  const baseY = s.y - STATION_RADIUS - 18;
  const slot = (/** @type {number} */ i) => {
    const row = Math.floor(i / QUEUE_PER_ROW);
    const col = i % QUEUE_PER_ROW;
    const inRow = Math.min(QUEUE_PER_ROW, (count > capacity ? capacity : count) - row * QUEUE_PER_ROW);
    return {
      x: s.x + (col - (inRow - 1) / 2) * QUEUE_SPACING,
      y: baseY - row * QUEUE_SPACING,
    };
  };

  for (let i = 0; i < shown; i++) {
    const p = slot(i);
    ctx.beginPath();
    traceShape(ctx, shapes[i], p.x, p.y, QUEUE_ITEM_RADIUS);
    ctx.fill();
  }
  if (count > capacity) {
    const p = slot(capacity - 1);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${count - shown}`, p.x, p.y);
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
    case 'rombo':
      ctx.moveTo(x, y - r * 1.05);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x, y + r * 1.05);
      ctx.lineTo(x - r * 0.8, y);
      ctx.closePath();
      break;
    case 'croce': {
      const a = r * 0.36;
      const b = r * 0.95;
      ctx.moveTo(x - a, y - b);
      ctx.lineTo(x + a, y - b);
      ctx.lineTo(x + a, y - a);
      ctx.lineTo(x + b, y - a);
      ctx.lineTo(x + b, y + a);
      ctx.lineTo(x + a, y + a);
      ctx.lineTo(x + a, y + b);
      ctx.lineTo(x - a, y + b);
      ctx.lineTo(x - a, y + a);
      ctx.lineTo(x - b, y + a);
      ctx.lineTo(x - b, y - a);
      ctx.lineTo(x - a, y - a);
      ctx.closePath();
      break;
    }
    case 'mezzaluna':
      // Un cerchio a cui ne manca un altro, spostato a destra.
      ctx.arc(x - r * 0.1, y, r * 0.95, Math.PI * 0.32, Math.PI * 1.68);
      ctx.arc(x + r * 0.38, y - r * 0.02, r * 0.72, Math.PI * 1.25, Math.PI * 0.75, true);
      ctx.closePath();
      break;
    case 'goccia':
      ctx.moveTo(x, y - r * 1.05);
      ctx.bezierCurveTo(x + r * 0.95, y - r * 0.15, x + r * 0.8, y + r * 0.85, x, y + r * 0.85);
      ctx.bezierCurveTo(x - r * 0.8, y + r * 0.85, x - r * 0.95, y - r * 0.15, x, y - r * 1.05);
      ctx.closePath();
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
