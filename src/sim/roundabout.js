// Rotatorie: un cerchio disegnato col dito diventa una rotonda, percorsa nel
// verso in cui è stato disegnato. Le strade che arrivano dentro il cerchio si
// accorciano e si attaccano all'anello. Chi è sull'anello ha la precedenza
// (l'anello è la strada principale di ogni suo nodo), chi entra si immette.

import { closestPointOnSegment, distance } from './geometry.js';
import { ROAD_WIDTH } from './graph.js';

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
  // Anche quelle che passano appena fuori ma toccano l'anello (che è largo una
  // strada): si spezzano lì e il punto viene tirato dentro, così la strada si
  // attacca alla rotonda invece di passarle sopra.
  // Mai i nodi di un'altra rotonda o di un cavalcavia: servono ancora a loro.
  /** @type {Set<number>} nodi fuori dal cerchio da trattare come dentro */
  const pulled = new Set();
  const otherRings = new Set();
  for (const e of graph.edges.values()) if (e.ring !== undefined) otherRings.add(e.a).add(e.b);
  const pullable = (/** @type {RoadNode} */ n) => n.stationId === undefined && !n.overpass && !otherRings.has(n.id);
  for (const e of [...graph.edges.values()]) {
    const a = /** @type {RoadNode} */ (graph.nodes.get(e.a));
    const b = /** @type {RoadNode} */ (graph.nodes.get(e.b));
    if (distance(a, c) <= R || distance(b, c) <= R) continue;
    const p = closestPointOnSegment(c, a, b);
    const d = distance(p, c);
    if (d < R) graph.splitEdge(e.id, p.x, p.y);
    else if (d < R + ROAD_WIDTH && e.ring === undefined) {
      const end = distance(p, a) < 1 ? a : distance(p, b) < 1 ? b : null;
      if (end) {
        if (pullable(end)) pulled.add(end.id);
      } else pulled.add(graph.splitEdge(e.id, p.x, p.y).id);
    }
  }

  const inside = new Set(
    [...graph.nodes.values()].filter((n) => n.stationId === undefined && (distance(n, c) <= R || pulled.has(n.id))).map((n) => n.id),
  );
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
      if (e.bridgeId !== undefined) moved.bridgeId = e.bridgeId;
      graph.copyRoadKind(e, moved);
    }
  }
  for (const id of ring) graph.nodes.delete(id);
  // Senza strade, il centro non serve.
  if (![...graph.edges.values()].some((e) => e.a === center.id || e.b === center.id)) graph.nodes.delete(center.id);
  return spokes;
}

/**
 * Un tratto disegnato che entra in una rotonda già fatta non deve passare
 * sull'isola: la parte dentro il cerchio si toglie e il tratto si ferma
 * sull'anello, dove entra, e riparte dall'anello, dove esce. Così la strada si
 * attacca alla rotonda da una parte e, se la attraversa, anche dall'altra.
 * @param {Point[]} points
 * @param {Iterable<{x: number, y: number, radius: number}>} rings
 * @returns {Point[]}
 */
export function clipAtRings(points, rings) {
  const list = [...rings];
  if (list.length === 0 || points.length === 0) return points;
  const isInside = (/** @type {Point} */ p) => list.some((r) => distance(p, r) < r.radius);
  /** @type {Point[]} */
  const out = [];
  if (!isInside(points[0])) out.push(points[0]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    // Dove il pezzo a→b taglia i cerchi, in ordine lungo il pezzo.
    /** @type {number[]} */
    const cuts = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 > 0) {
      for (const r of list) {
        const fx = a.x - r.x;
        const fy = a.y - r.y;
        const k = (fx * dx + fy * dy) / len2;
        const disc = k * k - (fx * fx + fy * fy - r.radius * r.radius) / len2;
        if (disc <= 0) continue;
        for (const t of [-k - Math.sqrt(disc), -k + Math.sqrt(disc)]) if (t > 0 && t <= 1) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    for (const t of cuts) out.push({ x: a.x + dx * t, y: a.y + dy * t });
    if (!isInside(b)) out.push(b);
  }
  return out;
}
