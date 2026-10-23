// Rotatorie: un cerchio disegnato col dito diventa una rotonda, percorsa nel
// verso in cui è stato disegnato. Le strade che arrivano dentro il cerchio si
// accorciano e si attaccano all'anello. Chi è sull'anello ha la precedenza
// (l'anello è la strada principale di ogni suo nodo), chi entra si immette.

import { closestPointOnSegment, distance } from './geometry.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./graph.js').RoadNode} RoadNode */
/** @typedef {import('./graph.js').RoadEdge} RoadEdge */
/** @typedef {{x: number, y: number}} Point */

/** Raggio minimo e massimo dell'anello: il cerchio disegnato viene portato fra i due. */
export const MIN_RING_RADIUS = 28;
const MAX_RING_RADIUS = 60;
/** Distanza fra due nodi dell'anello, circa. */
const RING_STEP = 22;
/** Il cerchio disegnato deve chiudersi entro questa distanza. */
const CLOSE_DISTANCE = 40;
/** Una strada che finisce a meno di così dall'anello si accorcia ancora. */
const SPOKE_MIN = 10;

/**
 * @typedef {Object} Roundabout
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} radius
 * @property {number[]} ring   nodi dell'anello
 * @property {number} cost     tratti pagati per l'anello
 * @property {number} [inner]  tratti delle strade tolte dentro il cerchio: tornano
 *   alle strade se la rotonda ridiventa incrocio, al giocatore se l'anello si smonta
 */

/**
 * @typedef {Object} DrawnCircle
 * @property {number} x
 * @property {number} y
 * @property {number} radius     già portato fra il minimo e il massimo
 * @property {boolean} clockwise verso in cui è stato disegnato (visto sullo schermo)
 */

/**
 * Se il tratto disegnato è un cerchio, il suo centro, raggio e verso.
 * @param {Point[]} points
 * @returns {DrawnCircle | null}
 */
export function drawnCircle(points) {
  if (points.length < 6) return null;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1], points[i]);
  if (length < 90 || distance(points[0], points[points.length - 1]) > CLOSE_DISTANCE) return null;
  const center = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
  // Deve essere davvero un giro intorno al centro, non uno scarabocchio:
  // tutti i punti più o meno alla stessa distanza dal centro.
  const radii = points.map((p) => distance(p, center));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const spread = Math.sqrt(radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length);
  if (mean < 15 || mean > 90 || spread > mean * 0.35) return null;
  // Con l'asse y verso il basso, area con segno positiva = giro in senso orario sullo schermo.
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return { ...center, radius: Math.max(MIN_RING_RADIUS, Math.min(MAX_RING_RADIUS, mean)), clockwise: area > 0 };
}

/**
 * Tratti che costa un anello del raggio dato.
 * @param {number} radius
 * @param {number} segmentLength
 */
export function ringCost(radius, segmentLength) {
  return Math.ceil((2 * Math.PI * radius) / segmentLength - 1e-6);
}

/** I punti dell'anello, per controllare che non cadano in acqua o su un ostacolo. */
export function ringPoints(/** @type {DrawnCircle} */ c) {
  const n = Math.max(8, Math.round((2 * Math.PI * c.radius) / RING_STEP));
  return Array.from({ length: n }, (_, k) => {
    const a = (k * 2 * Math.PI) / n;
    return { x: c.x + Math.cos(a) * c.radius, y: c.y + Math.sin(a) * c.radius };
  });
}

/**
 * Costruisce la rotonda: l'anello a senso unico nel verso disegnato, e le strade
 * che entravano nel cerchio accorciate fino all'anello.
 * @param {RoadGraph} graph
 * @param {DrawnCircle} c
 * @param {number} id     identificativo della rotonda
 * @param {number} cost   tratti pagati, divisi fra gli archi dell'anello
 * @returns {Roundabout}
 */
export function buildRoundabout(graph, c, id, cost) {
  const R = c.radius;
  // Le strade lunghe che attraversano il cerchio senza un nodo dentro si spezzano
  // nel punto più vicino al centro, così hanno anche loro un pezzo dentro.
  for (const e of [...graph.edges.values()]) {
    const a = /** @type {RoadNode} */ (graph.nodes.get(e.a));
    const b = /** @type {RoadNode} */ (graph.nodes.get(e.b));
    if (distance(a, c) <= R || distance(b, c) <= R) continue;
    const p = closestPointOnSegment(c, a, b);
    if (distance(p, c) < R) graph.splitEdge(e.id, p.x, p.y);
  }

  const inside = new Set([...graph.nodes.values()].filter((n) => n.stationId === undefined && distance(n, c) <= R).map((n) => n.id));
  const ring = ringPoints(c).map((p) => graph.addNode(p.x, p.y));
  const ringIds = new Set(ring.map((p) => p.id));
  const n = ring.length;
  for (let k = 0; k < n; k++) {
    const next = c.clockwise ? (k + 1) % n : (k + n - 1) % n;
    const e = graph.addEdge(ring[k].id, ring[next].id);
    if (e) {
      e.oneWay = true;
      e.ring = id;
      e.cost = cost / n;
    }
  }

  /** @type {Set<number>} */
  const used = new Set();
  for (const e of [...graph.edges.values()]) {
    // Può essere già sparita, tolta arretrando lungo un'altra strada.
    if (e.ring !== undefined || !graph.edges.has(e.id)) continue;
    const inA = inside.has(e.a);
    const inB = inside.has(e.b);
    if (inA && inB) {
      graph.removeEdge(e.id);
      continue;
    }
    if (!inA && !inB) continue;
    // Una strada che entra nel cerchio: si accorcia e si attacca all'anello.
    const toward = e.oneWay && inB; // senso unico che va verso il centro
    const away = e.oneWay && inA; // senso unico che esce dal centro
    let cost = e.cost ?? 0;
    let superPaid = e.superPaid ?? 0;
    let bridgeId = e.bridgeId;
    graph.removeEdge(e.id);
    let outer = graph.nodes.get(inA ? e.b : e.a);
    if (!outer) continue;
    // Se l'estremità esterna è appena fuori dall'anello, si arretra ancora un po',
    // ma solo lungo una strada semplice: ci si ferma a ogni incrocio, a ogni nodo
    // che ha già una strada attaccata all'anello, e prima di rientrare nel cerchio.
    // Così non si cancella mai un nodo che serve ancora (niente archi nel vuoto).
    while (distance(outer, c) < R + SPOKE_MIN && outer.stationId === undefined && !ringIds.has(outer.id)) {
      const here = outer;
      const rest = [...graph.edges.values()].filter((x) => x.a === here.id || x.b === here.id);
      if (rest.length !== 1) break;
      const back = rest[0];
      if (back.ring !== undefined || ringIds.has(back.a) || ringIds.has(back.b)) break;
      const nextId = back.a === here.id ? back.b : back.a;
      const nextNode = graph.nodes.get(nextId);
      if (!nextNode || inside.has(nextId)) break;
      cost += back.cost ?? 0;
      superPaid += back.superPaid ?? 0;
      bridgeId ??= back.bridgeId;
      graph.removeEdge(back.id);
      graph.nodes.delete(here.id);
      outer = nextNode;
    }
    const target = [...ring].sort((p, q) => distance(p, outer) - distance(q, outer)).find((p) => !used.has(p.id)) ?? ring[0];
    used.add(target.id);
    const spoke = toward ? graph.addEdge(outer.id, target.id) : away ? graph.addEdge(target.id, outer.id) : graph.addEdge(outer.id, target.id);
    if (spoke) {
      if (cost) spoke.cost = cost;
      if (superPaid) spoke.superPaid = superPaid;
      if (bridgeId !== undefined) spoke.bridgeId = bridgeId;
      graph.copyRoadKind(e, spoke);
    }
  }
  for (const id of inside) graph.nodes.delete(id);
  return { id, x: c.x, y: c.y, radius: R, ring: ring.map((p) => p.id), cost };
}

/**
 * Toglie la rotonda: l'anello sparisce e le strade che ci arrivavano si
 * riuniscono in un incrocio al centro.
 * @param {RoadGraph} graph
 * @param {Roundabout} r
 * @returns {number[]}  gli archi che ora arrivano al centro
 */
export function removeRoundabout(graph, r) {
  /** @type {number[]} */
  const spokes = [];
  const center = graph.addNode(r.x, r.y);
  // I nodi dell'anello: quelli di quando è nata, più quelli comparsi dopo
  // attaccando una strada a metà di un tratto dell'anello.
  const ring = new Set(r.ring);
  for (const e of graph.edges.values()) if (e.ring === r.id) ring.add(e.a).add(e.b);
  for (const e of [...graph.edges.values()]) {
    if (e.ring === r.id) {
      graph.removeEdge(e.id);
      continue;
    }
    if (!ring.has(e.a) && !ring.has(e.b)) continue;
    graph.removeEdge(e.id);
    const moved = graph.addEdge(ring.has(e.a) ? center.id : e.a, ring.has(e.b) ? center.id : e.b);
    if (moved) {
      spokes.push(moved.id);
      if (e.cost) moved.cost = e.cost;
      if (e.superPaid) moved.superPaid = e.superPaid;
      if (e.bridgeId !== undefined) moved.bridgeId = e.bridgeId;
      graph.copyRoadKind(e, moved);
    }
  }
  for (const id of ring) graph.nodes.delete(id);
  // Senza strade, il centro non serve.
  if (![...graph.edges.values()].some((e) => e.a === center.id || e.b === center.id)) graph.nodes.delete(center.id);
  return spokes;
}
