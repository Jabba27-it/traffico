// Segnali agli incroci: le luci dei semafori e i triangoli di "dare precedenza"
// sulle strade laterali, così si vede chi deve aspettare.

import { ROAD_WIDTH } from '../sim/graph.js';
import { drawIsland } from './looks.js';

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */
/** @typedef {import('../sim/lanes.js').LaneGeometry} LaneGeometry */

const GREEN = '#3fbf5f';
const RED = '#e0453a';
const AMBER = '#f2c53d';
const YIELD = 'rgba(255, 255, 255, 0.85)';
const YIELD_EDGE = 'rgba(214, 84, 70, 0.9)';
/** Distanza dal centro dell'incrocio dove si mettono luci e triangoli. */
const MARK_DISTANCE = 19;

/**
 * L'isola al centro delle rotatorie, nello stile della città.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Iterable<{id: number, x: number, y: number, radius: number}>} roundabouts
 * @param {import('../sim/level.js').Look} [look]
 */
export function drawRoundaboutIslands(ctx, roundabouts, look) {
  for (const r of roundabouts) drawIsland(ctx, r, look);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {LaneGeometry} lanes
 * @param {Map<number, {phase: 0 | 1, allRed: boolean}>} signals
 */
export function drawJunctionMarks(ctx, graph, lanes, signals) {
  /** @type {Map<number, number[]>} vicini di ogni nodo */
  const around = new Map();
  for (const e of graph.edges.values()) {
    for (const [p, q] of [[e.a, e.b], [e.b, e.a]]) {
      if (!around.has(p)) around.set(p, []);
      /** @type {number[]} */ (around.get(p)).push(q);
    }
  }
  for (const [id, neighbors] of around) {
    const n = graph.nodes.get(id);
    if (!n || neighbors.length < 3 || n.stationId !== undefined || n.overpass) continue;
    const main = lanes.mainRoad(id);
    const signal = signals.get(id);
    for (const other of neighbors) {
      // Solo le strade da cui si arriva (i sensi unici in uscita no).
      if (!graph.canTravel(other, id)) continue;
      const o = graph.nodes.get(other);
      if (!o) continue;
      const len = Math.hypot(o.x - n.x, o.y - n.y) || 1;
      const dx = (o.x - n.x) / len;
      const dy = (o.y - n.y) / len;
      const fromMain = main.has(other);
      // Sulla corsia di chi arriva: a destra guardando verso l'incrocio.
      const side = graph.getEdge(id, other)?.oneWay ? 0 : ROAD_WIDTH / 4;
      const x = n.x + dx * MARK_DISTANCE + dy * side;
      const y = n.y + dy * MARK_DISTANCE - dx * side;
      if (signal) {
        const green = !signal.allRed && (signal.phase === 0) === fromMain;
        ctx.fillStyle = '#2b2e34';
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = signal.allRed ? AMBER : green ? GREEN : RED;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (!fromMain) {
        // Triangolo con la punta verso chi arriva, come il cartello vero.
        const s = 3.6;
        ctx.beginPath();
        ctx.moveTo(x + dx * s, y + dy * s);
        ctx.lineTo(x - dx * s * 0.6 - dy * s, y - dy * s * 0.6 + dx * s);
        ctx.lineTo(x - dx * s * 0.6 + dy * s, y - dy * s * 0.6 - dx * s);
        ctx.closePath();
        ctx.fillStyle = YIELD;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = YIELD_EDGE;
        ctx.stroke();
      }
    }
  }
}
