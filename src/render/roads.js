// Disegno delle strade e dell'anteprima del tratto in corso.

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */

const ROAD_WIDTH = 14;
const ROAD_COLOR = '#5d6169';
const PREVIEW_COLOR = 'rgba(93, 97, 105, 0.4)';

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
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} points
 */
export function drawPreview(ctx, points) {
  if (points.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ROAD_WIDTH;
  ctx.strokeStyle = PREVIEW_COLOR;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}
