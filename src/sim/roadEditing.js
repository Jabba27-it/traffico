// Rimozione delle strade: trova il pezzo di strada sotto il dito, cioè la catena
// di archi fra due incroci (o stazioni, o estremità libere), e lo toglie dal grafo.

import { distance } from './geometry.js';
import { ROAD_WIDTH } from './graph.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */

/**
 * @typedef {Object} RoadPiece
 * @property {number[]} edgeIds
 * @property {number} length
 * @property {number} cost    tratti pagati a suo tempo per costruirlo
 */

/**
 * Il pezzo di strada che passa per (x, y), oppure null.
 * @param {RoadGraph} graph
 * @param {number} x
 * @param {number} y
 * @returns {RoadPiece | null}
 */
export function findRoadPiece(graph, x, y) {
  const hit = graph.findEdgeNear(x, y, ROAD_WIDTH);
  if (!hit) return null;

  /** @type {Map<number, number[]>} archi che toccano ogni nodo */
  const byNode = new Map();
  for (const e of graph.edges.values()) {
    for (const id of [e.a, e.b]) {
      if (!byNode.has(id)) byNode.set(id, []);
      /** @type {number[]} */ (byNode.get(id)).push(e.id);
    }
  }

  const piece = new Set([hit.edge.id]);
  // Si allarga nelle due direzioni finché i nodi sono semplici punti di
  // passaggio: due archi e nessuna stazione.
  for (const start of [hit.edge.a, hit.edge.b]) {
    let nodeId = start;
    for (;;) {
      const node = graph.nodes.get(nodeId);
      const edges = byNode.get(nodeId) ?? [];
      if (!node || node.stationId !== undefined || edges.length !== 2) break;
      const nextId = edges.find((id) => !piece.has(id));
      if (nextId === undefined) break; // anello chiuso
      piece.add(nextId);
      const next = /** @type {import('./graph.js').RoadEdge} */ (graph.edges.get(nextId));
      nodeId = next.a === nodeId ? next.b : next.a;
    }
  }

  let length = 0;
  let cost = 0;
  for (const id of piece) {
    length += edgeLength(graph, id);
    cost += graph.edges.get(id)?.cost ?? 0;
  }
  return { edgeIds: [...piece], length, cost };
}

/**
 * Toglie dal grafo gli archi del pezzo.
 * @param {RoadGraph} graph
 * @param {RoadPiece} piece
 * @returns {Set<number>} i nodi che toccavano il pezzo, da ripulire dopo
 */
export function removeRoadPiece(graph, piece) {
  /** @type {Set<number>} */
  const touched = new Set();
  for (const id of piece.edgeIds) {
    const e = graph.edges.get(id);
    if (!e) continue;
    touched.add(e.a);
    touched.add(e.b);
    graph.removeEdge(id);
  }
  return touched;
}

/**
 * Elimina i nodi indicati se sono rimasti isolati e non sono stazioni.
 * @param {RoadGraph} graph
 * @param {Iterable<number>} nodeIds
 */
export function removeIsolatedNodes(graph, nodeIds) {
  /** @type {Set<number>} */
  const used = new Set();
  for (const e of graph.edges.values()) {
    used.add(e.a);
    used.add(e.b);
  }
  for (const id of nodeIds) {
    const n = graph.nodes.get(id);
    if (n && n.stationId === undefined && !used.has(id)) graph.nodes.delete(id);
  }
}

/**
 * @param {RoadGraph} graph
 * @param {number} edgeId
 */
export function edgeLength(graph, edgeId) {
  const e = graph.edges.get(edgeId);
  const a = e && graph.nodes.get(e.a);
  const b = e && graph.nodes.get(e.b);
  return a && b ? distance(a, b) : 0;
}
