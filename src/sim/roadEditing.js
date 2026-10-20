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
 * @property {number} bridges ponti che contiene
 */

/**
 * Il pezzo di strada che passa per (x, y), oppure null.
 * @param {RoadGraph} graph
 * @param {number} x
 * @param {number} y
 * @param {number} [radius]  quanto lontano dal centro della strada si può premere
 * @returns {RoadPiece | null}
 */
export function findRoadPiece(graph, x, y, radius = ROAD_WIDTH) {
  const hit = graph.findEdgeNear(x, y, Math.max(ROAD_WIDTH, radius));
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
  /** @type {Set<number>} */
  const bridgeIds = new Set();
  for (const id of piece) {
    const e = graph.edges.get(id);
    length += edgeLength(graph, id);
    cost += (e?.cost ?? 0) + (e?.superPaid ?? 0);
    if (e?.bridgeId !== undefined) bridgeIds.add(e.bridgeId);
  }
  return { edgeIds: [...piece], length, cost, bridges: bridgeIds.size };
}

/**
 * Tipo di un pezzo di strada: doppio senso, senso unico in un verso o
 * nell'altro (rispetto all'ordine della catena), superstrada.
 * @typedef {'two' | 'forward' | 'backward' | 'super'} RoadType
 */

/**
 * Gli archi del pezzo in fila, dal primo estremo all'altro, ciascuno con il
 * verso di percorrenza della fila.
 * @param {RoadGraph} graph
 * @param {RoadPiece} piece
 * @returns {{edge: import('./graph.js').RoadEdge, from: number, to: number}[]}
 */
export function orderedChain(graph, piece) {
  const edges = piece.edgeIds.map((id) => /** @type {import('./graph.js').RoadEdge} */ (graph.edges.get(id))).filter(Boolean);
  /** @type {Map<number, number>} */
  const count = new Map();
  for (const e of edges) for (const n of [e.a, e.b]) count.set(n, (count.get(n) ?? 0) + 1);
  // Si parte sempre dallo stesso estremo (il nodo di id più basso fra quelli
  // toccati una volta sola), così "avanti" e "indietro" non si scambiano fra un
  // tocco e l'altro. In un anello si parte dal nodo di id più basso.
  const ends = [...count.entries()].filter(([, c]) => c === 1).map(([id]) => id);
  let start = Math.min(...(ends.length > 0 ? ends : [...count.keys()]));
  const left = new Set(edges);
  const chain = [];
  while (left.size > 0) {
    const e = [...left].find((x) => x.a === start || x.b === start);
    if (!e) break;
    left.delete(e);
    const to = e.a === start ? e.b : e.a;
    chain.push({ edge: e, from: start, to });
    start = to;
  }
  return chain;
}

/**
 * @param {RoadGraph} graph
 * @param {RoadPiece} piece
 * @returns {RoadType}
 */
export function pieceType(graph, piece) {
  const first = orderedChain(graph, piece)[0];
  if (!first) return 'two';
  if (first.edge.kind === 'super') return 'super';
  if (!first.edge.oneWay) return 'two';
  return first.edge.a === first.from ? 'forward' : 'backward';
}

/**
 * Cambia il tipo di tutto il pezzo di strada.
 * @param {RoadGraph} graph
 * @param {RoadPiece} piece
 * @param {RoadType} type
 */
export function setPieceType(graph, piece, type) {
  for (const { edge, from, to } of orderedChain(graph, piece)) {
    delete edge.kind;
    delete edge.oneWay;
    if (type === 'super') edge.kind = 'super';
    if (type === 'forward' || type === 'backward') {
      edge.oneWay = true;
      // Il senso unico va da `a` a `b`: si girano gli estremi se serve.
      const [a, b] = type === 'forward' ? [from, to] : [to, from];
      edge.a = a;
      edge.b = b;
    }
  }
  graph.version++;
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
