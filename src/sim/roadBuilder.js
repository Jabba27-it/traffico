// Trasforma un tratto disegnato (lista di punti) in nodi e archi del grafo,
// creando gli incroci dove il tratto tocca o attraversa strade esistenti
// e facendolo entrare nelle stazioni su cui passa.

import { closestPointOnSegment, distance, segmentIntersection } from './geometry.js';
import { STATION_RADIUS } from './stations.js';
import { ROAD_WIDTH } from './graph.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./graph.js').RoadNode} RoadNode */
/** @typedef {{x: number, y: number}} Point */

/** Un incrocio che cade così vicino a un nodo esistente riusa quel nodo. */
const MERGE_RADIUS = 12;
/** Un tratto che passa così vicino all'estremità di una strada (le due si toccano a vista) vi si collega. */
const DEAD_END_RADIUS = ROAD_WIDTH;
/** Un estremo del tratto che cade così vicino a una stazione vi si aggancia. */
const STATION_SNAP = STATION_RADIUS + 8;

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
  const startNode = /** @type {RoadNode} */ (graph.nodes.get(startId));
  const endNode = graph.findNodeNear(last.x, last.y, STATION_SNAP, true) ?? graph.findNodeNear(last.x, last.y, snapRadius);
  /** @type {Point} */
  const endPos = endNode ?? graph.findEdgeNear(last.x, last.y, snapRadius) ?? last;

  // Scarta i punti intermedi che cadono dentro il raggio di aggancio degli estremi.
  let from = 1;
  let to = points.length - 2;
  const startReach = reach(startNode, snapRadius);
  const endReach = endNode ? reach(endNode, snapRadius) : snapRadius;
  while (from <= to && distance(points[from], startNode) <= startReach) from++;
  while (to >= from && distance(points[to], endPos) <= endReach) to--;

  let prevId = startId;
  for (let i = from; i <= to; i++) {
    prevId = crossTo(graph, prevId, points[i]);
    const prev = /** @type {RoadNode} */ (graph.nodes.get(prevId));
    // Un punto dentro una stazione appena attraversata non diventa un nodo.
    const limit = prev.stationId !== undefined ? STATION_RADIUS : MERGE_RADIUS;
    if (distance(prev, points[i]) > limit) {
      const id = graph.addNode(points[i].x, points[i].y).id;
      graph.addEdge(prevId, id);
      prevId = id;
    }
  }

  prevId = crossTo(graph, prevId, endPos);
  graph.addEdge(prevId, attach(graph, endPos, snapRadius));
}

/**
 * Il nodo su cui poggia p: una stazione vicina, un nodo vicino, un nuovo nodo
 * a metà di una strada vicina, oppure un nodo nuovo isolato.
 * @param {RoadGraph} graph
 * @param {Point} p
 * @param {number} snapRadius
 * @returns {number}
 */
function attach(graph, p, snapRadius) {
  const node = graph.findNodeNear(p.x, p.y, STATION_SNAP, true) ?? graph.findNodeNear(p.x, p.y, snapRadius);
  if (node) return node.id;
  const hit = graph.findEdgeNear(p.x, p.y, snapRadius);
  if (hit) return graph.splitEdge(hit.edge.id, hit.x, hit.y).id;
  return graph.addNode(p.x, p.y).id;
}

/**
 * @param {RoadNode} node
 * @param {number} snapRadius
 */
function reach(node, snapRadius) {
  return node.stationId !== undefined ? STATION_SNAP : snapRadius;
}

/**
 * Prolunga la strada dal nodo `fromId` verso p, creando un incrocio su ogni
 * strada attraversata, collegando le estremità di strada che sfiora ed entrando
 * nelle stazioni su cui passa. Restituisce l'ultimo nodo raggiunto (p escluso).
 * @param {RoadGraph} graph
 * @param {number} fromId
 * @param {Point} p
 * @returns {number}
 */
function crossTo(graph, fromId, p) {
  const a = /** @type {Point} */ (graph.nodes.get(fromId));
  /** @type {Map<number, number>} */
  const degree = new Map();
  /** @type {Set<number>} */
  const neighbors = new Set();
  /** @type {({edgeId: number, x: number, y: number, t: number} | {nodeId: number, t: number})[]} */
  const hits = [];
  for (const e of graph.edges.values()) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    if (e.a === fromId) neighbors.add(e.b);
    if (e.b === fromId) neighbors.add(e.a);
    if (e.a === fromId || e.b === fromId) continue;
    const ea = graph.nodes.get(e.a);
    const eb = graph.nodes.get(e.b);
    if (!ea || !eb) continue;
    const hit = segmentIntersection(a, p, ea, eb);
    if (!hit) continue;
    // Dentro una stazione non si creano incroci: ci pensa l'ingresso nella stazione.
    if (insideStation(ea, hit) || insideStation(eb, hit)) continue;
    hits.push({ edgeId: e.id, x: hit.x, y: hit.y, t: hit.t });
  }
  for (const n of graph.nodes.values()) {
    if (n.id === fromId || neighbors.has(n.id)) continue;
    const isStation = n.stationId !== undefined;
    if (!isStation && degree.get(n.id) !== 1) continue;
    const c = closestPointOnSegment(n, a, p);
    const radius = isStation ? STATION_RADIUS : DEAD_END_RADIUS;
    if (c.t > 0 && distance(c, n) <= radius) hits.push({ nodeId: n.id, t: c.t });
  }
  hits.sort((h1, h2) => h1.t - h2.t);

  let prevId = fromId;
  for (const h of hits) {
    const id = 'nodeId' in h ? h.nodeId : crossingNode(graph, h);
    graph.addEdge(prevId, id);
    prevId = id;
  }
  return prevId;
}

/**
 * @param {RoadNode} node
 * @param {Point} p
 */
function insideStation(node, p) {
  return node.stationId !== undefined && distance(node, p) <= STATION_RADIUS;
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
