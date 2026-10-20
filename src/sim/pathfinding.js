// Percorso più rapido sul grafo stradale (Dijkstra).
// Il costo di un arco è la sua lunghezza: per ora tutti vanno alla stessa velocità.

import { distance } from './geometry.js';

/** Costo di una superstrada rispetto a una strada normale lunga uguale. */
const SUPER_COST = 0.7;

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */

/**
 * @typedef {Object} ShortestPaths
 * @property {Map<number, number>} dist  distanza dalla partenza per ogni nodo raggiungibile
 * @property {Map<number, number>} prev  nodo precedente sul percorso migliore
 */

/**
 * Distanze minime dal nodo `sourceId` a tutti i nodi raggiungibili.
 * @param {RoadGraph} graph
 * @param {number} sourceId
 * @param {(nodeId: number) => number} [nodeCost]  costo in più per passare da un nodo
 * @param {(nodeId: number) => boolean} [stopsAt]  nodi dove si può arrivare ma da cui
 *   non si prosegue (es. le stazioni, che non si attraversano)
 * @returns {ShortestPaths}
 */
export function shortestPaths(graph, sourceId, nodeCost, stopsAt) {
  /** @type {Map<number, {to: number, cost: number}[]>} */
  const adj = new Map();
  for (const e of graph.edges.values()) {
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    // Sulle superstrade si va più veloci: a parità di lunghezza "costano" meno.
    const cost = distance(a, b) * (e.kind === 'super' ? SUPER_COST : 1);
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    /** @type {{to: number, cost: number}[]} */ (adj.get(e.a)).push({ to: e.b, cost });
    if (!e.oneWay) /** @type {{to: number, cost: number}[]} */ (adj.get(e.b)).push({ to: e.a, cost });
  }

  const dist = new Map([[sourceId, 0]]);
  const prev = new Map();
  const done = new Set();
  // Coda a priorità (heap binario) dei nodi da esaminare, dal più vicino.
  /** @type {[number, number][]} coppie [distanza, nodo] */
  const heap = [[0, sourceId]];
  while (heap.length > 0) {
    const [best, current] = popMin(heap);
    if (done.has(current)) continue;
    done.add(current);
    if (current !== sourceId && stopsAt?.(current)) continue;
    for (const { to, cost } of adj.get(current) ?? []) {
      if (done.has(to)) continue;
      const d = best + cost + (nodeCost ? nodeCost(to) : 0);
      if (d < (dist.get(to) ?? Infinity)) {
        dist.set(to, d);
        prev.set(to, current);
        push(heap, [d, to]);
      }
    }
  }
  return { dist, prev };
}

/**
 * @param {[number, number][]} heap
 * @param {[number, number]} item
 */
function push(heap, item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent][0] <= heap[i][0]) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

/**
 * @param {[number, number][]} heap
 * @returns {[number, number]}
 */
function popMin(heap) {
  const top = heap[0];
  const last = /** @type {[number, number]} */ (heap.pop());
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}

/**
 * Il percorso (lista di id di nodi) dalla partenza a `targetId`, oppure null.
 * @param {ShortestPaths} paths
 * @param {number} targetId
 * @returns {number[] | null}
 */
export function pathTo(paths, targetId) {
  if (!paths.dist.has(targetId)) return null;
  const path = [targetId];
  let id = targetId;
  while (paths.prev.has(id)) {
    id = /** @type {number} */ (paths.prev.get(id));
    path.push(id);
  }
  return path.reverse();
}
