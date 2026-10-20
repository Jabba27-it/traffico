// Disegno delle strade e dell'anteprima del tratto in corso.

import { ROAD_WIDTH } from '../sim/graph.js';

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */

const ROAD_COLOR = '#5d6169';
const PREVIEW_COLOR = 'rgba(93, 97, 105, 0.4)';
const BLOCKED_COLOR = 'rgba(224, 69, 58, 0.45)';
const REMOVAL_COLOR = 'rgba(224, 69, 58, 0.85)';
const LABEL_COLOR = '#3d4047';
const BLOCKED_TEXT = '#c0392b';
/** Il numero del costo sta sopra il dito, per non restare coperto. */
const LABEL_OFFSET = 34;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 */
export function drawRoads(ctx, graph) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ROAD_WIDTH;
  ctx.strokeStyle = ROAD_COLOR;
  ctx.beginPath();
  for (const e of graph.edges.values()) {
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

/**
 * Anteprima del tratto in corso: grigia fin dove bastano le strade, rossa
 * oltre. Vicino al dito mostra quanti tratti costerà.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} points
 * @param {import('../sim/roadBuilder.js').RoadPlan['cut']} cut
 * @param {number} cost  tratti di strada che verranno consumati
 * @param {number} worldWidth  per tenere la scritta dentro lo schermo
 */
export function drawPreview(ctx, points, cut, cost, worldWidth) {
  if (points.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ROAD_WIDTH;

  const affordable = cut ? [...points.slice(0, cut.index), cut] : points;
  strokeLine(ctx, affordable, PREVIEW_COLOR);
  if (cut) strokeLine(ctx, [cut, ...points.slice(cut.index)], BLOCKED_COLOR);

  const tip = points[points.length - 1];
  const label = cut ? 'Strade finite' : cost > 0 ? `−${cost}` : '';
  if (!label) return;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  const half = ctx.measureText(label).width / 2 + 6;
  const x = Math.max(half, Math.min(worldWidth - half, tip.x));
  ctx.strokeText(label, x, tip.y - LABEL_OFFSET);
  ctx.fillStyle = cut ? BLOCKED_TEXT : LABEL_COLOR;
  ctx.fillText(label, x, tip.y - LABEL_OFFSET);
}

/**
 * Il pezzo di strada che sta per essere rimosso, in rosso, con i tratti
 * che verranno restituiti.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {import('../sim/roadEditing.js').RoadPiece} piece
 * @param {number} refund
 * @param {{x: number, y: number}} finger
 * @param {number} worldWidth
 */
export function drawRemoval(ctx, graph, piece, refund, finger, worldWidth) {
  ctx.lineCap = 'round';
  ctx.lineWidth = ROAD_WIDTH;
  ctx.strokeStyle = REMOVAL_COLOR;
  ctx.beginPath();
  for (const id of piece.edgeIds) {
    const e = graph.edges.get(id);
    const a = e && graph.nodes.get(e.a);
    const b = e && graph.nodes.get(e.b);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  const label = `Rimuovi +${refund}`;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  const half = ctx.measureText(label).width / 2 + 6;
  const x = Math.max(half, Math.min(worldWidth - half, finger.x));
  ctx.strokeText(label, x, finger.y - LABEL_OFFSET);
  ctx.fillStyle = BLOCKED_TEXT;
  ctx.fillText(label, x, finger.y - LABEL_OFFSET);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} points
 * @param {string} color
 */
function strokeLine(ctx, points, color) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}
