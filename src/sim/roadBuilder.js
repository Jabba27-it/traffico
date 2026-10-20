// Trasforma un tratto disegnato (lista di punti) in nodi e archi del grafo,
// creando gli incroci dove il tratto tocca o attraversa strade esistenti.

import { distance, segmentIntersection } from './geometry.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {{x: number, y: number}} Point */

/** Un incrocio che cade così vicino a un nodo esistente riusa quel nodo. */
const MERGE_RADIUS = 10;

/**
 * @param {RoadGraph} graph
 * @param {Point[]} points
 * @param {number} snapRadius  distanza entro cui un estremo si aggancia a una strada
 */
export function buildRoad(graph, points, snapRadius) {
  if (points.length < 2) return;
  const first = points[0];
  const last = points[points.length - 1];

  const startId = attach(graph, first, snapRadius);
  const startNode = /** @type {Point} */ (graph.nodes.get(startId));
  const endPos =
    graph.findNodeNear(last.x, last.y, snapRadius) ?? graph.findEdgeNear(last.x, last.y, snapRadius) ?? last;

  // Scarta i punti intermedi che cadono dentro il raggio di aggancio degli estremi.
  let from = 1;
  let to = points.length - 2;
  while (from <= to && distance(points[from], startNode) <= snapRadius) from++;
  while (to >= from && distance(points[to], endPos) <= snapRadius) to--;

  let prevId = startId;
  for (let i = from; i <= to; i++) {
    prevId = crossTo(graph, prevId, points[i]);
    const prev = /** @type {Point} */ (graph.nodes.get(prevId));
    if (distance(prev, points[i]) > MERGE_RADIUS) {
      const id = graph.addNode(points[i].x, points[i].y).id;
      graph.addEdge(prevId, id);
      prevId = id;
    }
  }

  prevId = crossTo(graph, prevId, endPos);
  graph.addEdge(prevId, attach(graph, endPos, snapRadius));
}

/**
 * Il nodo su cui poggia p: un nodo vicino, un nuovo nodo a metà di una strada
 * vicina, oppure un nodo nuovo isolato.
 * @param {RoadGraph} graph
 * @param {Point} p
 * @param {number} snapRadius
 * @returns {number}
 */
function attach(graph, p, snapRadius) {
  const node = graph.findNodeNear(p.x, p.y, snapRadius);
  if (node) return node.id;
  const hit = graph.findEdgeNear(p.x, p.y, snapRadius);
  if (hit) return graph.splitEdge(hit.edge.id, hit.x, hit.y).id;
  return graph.addNode(p.x, p.y).id;
}

/**
 * Prolunga la strada dal nodo `fromId` verso p, creando un incrocio su ogni
 * strada attraversata. Restituisce l'ultimo nodo raggiunto (p escluso).
 * @param {RoadGraph} graph
 * @param {number} fromId
 * @param {Point} p
 * @returns {number}
 */
function crossTo(graph, fromId, p) {
  const a = /** @type {Point} */ (graph.nodes.get(fromId));
  /** @type {{edgeId: number, x: number, y: number, t: number}[]} */
  const hits = [];
  for (const e of graph.edges.values()) {
    if (e.a === fromId || e.b === fromId) continue;
    const ea = graph.nodes.get(e.a);
    const eb = graph.nodes.get(e.b);
    if (!ea || !eb) continue;
    const hit = segmentIntersection(a, p, ea, eb);
    if (hit) hits.push({ edgeId: e.id, x: hit.x, y: hit.y, t: hit.t });
  }
  hits.sort((h1, h2) => h1.t - h2.t);

  let prevId = fromId;
  for (const h of hits) {
    const id = crossingNode(graph, h);
    graph.addEdge(prevId, id);
    prevId = id;
  }
  return prevId;
}

/**
 * @param {RoadGraph} graph
 * @param {{edgeId: number, x: number, y: number}} hit
 * @returns {number}
 */
function crossingNode(graph, hit) {
  const edge = graph.edges.get(hit.edgeId);
  if (!edge) {
    // L'arco è già stato spezzato da un incrocio vicinissimo: riusa quel nodo.
    const near = graph.findNodeNear(hit.x, hit.y, MERGE_RADIUS);
    return near ? near.id : graph.addNode(hit.x, hit.y).id;
  }
  const a = /** @type {Point} */ (graph.nodes.get(edge.a));
  const b = /** @type {Point} */ (graph.nodes.get(edge.b));
  if (distance(hit, a) <= MERGE_RADIUS) return edge.a;
  if (distance(hit, b) <= MERGE_RADIUS) return edge.b;
  return graph.splitEdge(edge.id, hit.x, hit.y).id;
}
