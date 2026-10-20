// Percorso più rapido sul grafo stradale (Dijkstra).
// Il costo di un arco è la sua lunghezza: per ora tutti vanno alla stessa velocità.

import { distance } from './geometry.js';

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
 * @returns {ShortestPaths}
 */
export function shortestPaths(graph, sourceId) {
  /** @type {Map<number, {to: number, cost: number}[]>} */
  const adj = new Map();
  for (const e of graph.edges.values()) {
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    const cost = distance(a, b);
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    /** @type {{to: number, cost: number}[]} */ (adj.get(e.a)).push({ to: e.b, cost });
    /** @type {{to: number, cost: number}[]} */ (adj.get(e.b)).push({ to: e.a, cost });
  }

  const dist = new Map([[sourceId, 0]]);
  const prev = new Map();
  const done = new Set();
  // La rete è piccola: basta cercare ogni volta il nodo aperto più vicino.
  const open = new Set([sourceId]);
  while (open.size > 0) {
    let current = -1;
    let best = Infinity;
    for (const id of open) {
      const d = /** @type {number} */ (dist.get(id));
      if (d < best) {
        best = d;
        current = id;
      }
    }
    open.delete(current);
    done.add(current);
    for (const { to, cost } of adj.get(current) ?? []) {
      if (done.has(to)) continue;
      const d = best + cost;
      if (d < (dist.get(to) ?? Infinity)) {
        dist.set(to, d);
        prev.set(to, current);
        open.add(to);
      }
    }
  }
  return { dist, prev };
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
