// Rotatorie: si disegna un cerchio intorno a un incrocio e l'incrocio diventa un
// anello a senso unico, percorso in senso antiorario. Chi è sull'anello ha la
// precedenza (l'anello è la strada principale di ogni suo nodo), chi entra si immette.

import { distance } from './geometry.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./graph.js').RoadNode} RoadNode */
/** @typedef {import('./graph.js').RoadEdge} RoadEdge */
/** @typedef {{x: number, y: number}} Point */

/** Raggio dell'anello. */
export const RING_RADIUS = 36;
/** Nodi dell'anello: più sono, più la rotatoria è rotonda. */
const RING_NODES = 10;
/** Il cerchio disegnato deve chiudersi entro questa distanza... */
const CLOSE_DISTANCE = 40;
/** ...e il suo centro deve cadere così vicino a un incrocio. */
const CENTER_REACH = 35;

/**
 * @typedef {Object} Roundabout
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number[]} ring   nodi dell'anello
 * @property {number} cost     tratti pagati per l'anello
 */

/**
 * Se il tratto disegnato è un cerchio intorno a un incrocio, quell'incrocio.
 * @param {RoadGraph} graph
 * @param {Point[]} points
 * @returns {RoadNode | null}
 */
export function circledJunction(graph, points) {
  if (points.length < 6) return null;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1], points[i]);
  if (length < 90 || distance(points[0], points[points.length - 1]) > CLOSE_DISTANCE) return null;
  const center = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
  // Deve essere davvero un giro intorno al centro, non uno scarabocchio.
  const radii = points.map((p) => distance(p, center));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  if (mean < 12 || mean > 90) return null;

  let best = null;
  let bestD = CENTER_REACH;
  for (const n of graph.nodes.values()) {
    if (n.stationId !== undefined || n.overpass) continue;
    const degree = [...graph.edges.values()].filter((e) => e.a === n.id || e.b === n.id).length;
    if (degree < 3) continue;
    const d = distance(n, center);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Tratti che costa l'anello. */
export function ringCost(segmentLength) {
  return Math.ceil((2 * Math.PI * RING_RADIUS) / segmentLength - 1e-6);
}

/**
 * Trasforma l'incrocio in rotatoria.
 * @param {RoadGraph} graph
 * @param {RoadNode} center
 * @param {number} id     identificativo della rotatoria
 * @param {number} cost   tratti pagati, divisi fra gli archi dell'anello
 * @returns {Roundabout}
 */
export function buildRoundabout(graph, center, id, cost) {
  /** @type {RoadNode[]} */
  const ring = [];
  for (let k = 0; k < RING_NODES; k++) {
    const angle = (k * 2 * Math.PI) / RING_NODES;
    ring.push(graph.addNode(center.x + Math.cos(angle) * RING_RADIUS, center.y + Math.sin(angle) * RING_RADIUS));
  }
  // Senso antiorario visto dall'alto: con l'asse y verso il basso, angolo che diminuisce.
  for (let k = 0; k < RING_NODES; k++) {
    const e = graph.addEdge(ring[k].id, ring[(k + RING_NODES - 1) % RING_NODES].id);
    if (e) {
      e.oneWay = true;
      e.ring = id;
      e.cost = cost / RING_NODES;
    }
  }
  // Ogni strada che entrava nell'incrocio si accorcia fino a fuori dall'anello e
  // si attacca al nodo dell'anello più vicino ancora libero.
  /** @type {Set<number>} */
  const used = new Set();
  for (const first of [...graph.edges.values()]) {
    if (first.a !== center.id && first.b !== center.id) continue;
    const towardCenter = first.oneWay && first.b === center.id;
    const away = first.oneWay && first.a === center.id;
    let cost = 0;
    let prev = center.id;
    let edge = first;
    let outer = /** @type {RoadNode} */ (graph.nodes.get(edge.a === center.id ? edge.b : edge.a));
    // Si tolgono i pezzi di strada che finirebbero dentro l'anello.
    for (;;) {
      cost += edge.cost ?? 0;
      graph.removeEdge(edge.id);
      if (prev !== center.id) graph.nodes.delete(prev);
      if (distance(outer, center) >= RING_RADIUS + 10 || outer.stationId !== undefined) break;
      const next = [...graph.edges.values()].filter((e) => e.a === outer.id || e.b === outer.id);
      if (next.length !== 1) break;
      prev = outer.id;
      edge = next[0];
      outer = /** @type {RoadNode} */ (graph.nodes.get(edge.a === outer.id ? edge.b : edge.a));
    }
    const target = [...ring].sort((p, q) => distance(p, outer) - distance(q, outer)).find((p) => !used.has(p.id)) ?? ring[0];
    used.add(target.id);
    const spoke = towardCenter ? graph.addEdge(outer.id, target.id) : away ? graph.addEdge(target.id, outer.id) : graph.addEdge(outer.id, target.id);
    if (spoke) {
      if (cost) spoke.cost = cost;
      graph.copyRoadKind(first, spoke);
    }
  }
  graph.nodes.delete(center.id);
  return { id, x: center.x, y: center.y, ring: ring.map((n) => n.id), cost };
}

/**
 * Riporta la rotatoria a incrocio: l'anello sparisce e le strade tornano a un nodo centrale.
 * @param {RoadGraph} graph
 * @param {Roundabout} r
 */
export function removeRoundabout(graph, r) {
  const center = graph.addNode(r.x, r.y);
  const ring = new Set(r.ring);
  for (const e of [...graph.edges.values()]) {
    if (e.ring === r.id) {
      graph.removeEdge(e.id);
      continue;
    }
    if (!ring.has(e.a) && !ring.has(e.b)) continue;
    graph.removeEdge(e.id);
    const moved = graph.addEdge(ring.has(e.a) ? center.id : e.a, ring.has(e.b) ? center.id : e.b);
    if (moved) {
      if (e.cost) moved.cost = e.cost;
      graph.copyRoadKind(e, moved);
    }
  }
  for (const id of r.ring) graph.nodes.delete(id);
}
