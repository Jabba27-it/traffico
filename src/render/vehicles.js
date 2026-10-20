// Disegno dei veicoli: piccole forme col colore della stazione d'origine.

import { vehiclePose } from '../sim/vehicles.js';
import { SHAPE_COLORS, traceShape } from './stations.js';

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */
/** @typedef {import('../sim/vehicles.js').Vehicle} Vehicle */

const VEHICLE_RADIUS = 6;
/** Spostamento a destra del senso di marcia, per separare le due direzioni. */
const LANE_OFFSET = 3.5;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {Vehicle[]} vehicles
 */
export function drawVehicles(ctx, graph, vehicles) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  for (const v of vehicles) {
    const p = vehiclePose(graph, v);
    // Con l'asse y verso il basso, la destra di (dx, dy) è (-dy, dx).
    const x = p.x - p.dy * LANE_OFFSET;
    const y = p.y + p.dx * LANE_OFFSET;
    ctx.beginPath();
    traceShape(ctx, v.shape, x, y, VEHICLE_RADIUS);
    ctx.fillStyle = SHAPE_COLORS[v.shape];
    ctx.fill();
    ctx.stroke();
  }
}
