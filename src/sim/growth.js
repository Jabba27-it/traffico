// Generatore di stazioni: sceglie forma e posizione della prossima stazione.
// Solo nella parte visibile della città (e dentro le zone del livello, se ce
// ne sono), fuori dall'acqua, mai sopra strade o rotonde e lontano dalle altre stazioni. Fra i punti
// possibili preferisce quelli difficili da collegare, quanto dice il livello.

import { closestPointOnSegment, distance } from './geometry.js';
import { ROAD_WIDTH } from './graph.js';
import { STATION_RADIUS } from './stations.js';
import { distanceToWater, landOf, landsOf } from './water.js';
import { obstacleAt } from './terrain.js';

/** @typedef {import('./level.js').Level} Level */
/** @typedef {import('./level.js').StationDef} StationDef */
/** @typedef {import('./stations.js').Station} Station */
/** @typedef {import('./stations.js').Shape} Shape */
/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {{x: number, y: number}} Point */

/** Quanti punti casuali provare ogni volta: tanti, perché in una città piena di
 * strade restano liberi solo gli spazi fra un isolato e l'altro. */
const ATTEMPTS = 80;
/** Spazio minimo fra il bordo di una stazione e il bordo di una strada. */
const ROAD_MARGIN = 6;
/** Distanza minima fra il centro di una stazione nuova e l'asse di una strada. */
export const STATION_CLEARANCE = STATION_RADIUS + ROAD_WIDTH / 2 + ROAD_MARGIN;
/** Spazio minimo fra il bordo di una stazione e la riva. */
const WATER_MARGIN = 16;
/** Peso di "sta sulla stessa terra (riva o isola) delle altre stazioni della sua forma". */
const SAME_SIDE_BONUS = 0.6;
/** Peso di "è lontana dalle strade già costruite". */
const ROAD_WEIGHT = 0.5;

/**
 * @param {() => number} random
 * @param {Level} level
 * @param {Station[]} stations  le stazioni già presenti
 * @param {import('./view.js').Rect} area  dove può nascere (la vista attuale, già ristretta dai bordi)
 * @param {RoadGraph} graph  per stare lontano dalle strade già costruite
 * @param {(p: Point) => boolean} [allowed]  scarta altri punti, es. quelli coperti dall'interfaccia
 * @param {Iterable<{x: number, y: number, radius: number}>} [roundabouts]  le rotonde: dentro non si nasce
 * @returns {StationDef | null}  null se non c'è un punto libero adatto
 */
export function pickNewStation(random, level, stations, area, graph, allowed = () => true, roundabouts = []) {
  if (!level.growth || level.shapes.length === 0) return null;
  const { minDistance, difficulty } = level.growth;
  const shape = pickShape(random, level.shapes, stations);

  const rings = [...roundabouts];
  /** @type {Point[]} */
  const candidates = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const p = { x: area.x + random() * area.width, y: area.y + random() * area.height };
    const inZone = level.zones.length === 0 || level.zones.some((z) => p.x >= z.x && p.y >= z.y && p.x <= z.x + z.width && p.y <= z.y + z.height);
    const dry = distanceToWater(level.waters, p) >= STATION_RADIUS + WATER_MARGIN && !obstacleAt(level.terrain, p, STATION_RADIUS + WATER_MARGIN);
    if (inZone && dry && allowed(p) && stations.every((s) => distance(s, p) >= minDistance) && clearOfRoads(p, graph, rings)) {
      candidates.push(p);
    }
  }
  if (candidates.length === 0) return null;

  // Ogni punto riceve un voto di difficoltà; il livello decide quanto contano
  // il voto e quanto il caso.
  const scale = Math.hypot(area.width, area.height);
  const twins = stations.filter((s) => s.shape === shape);
  const roadNodes = [...graph.nodes.values()].filter((n) => n.stationId === undefined);
  const scores = candidates.map((p) => hardness(p, twins, stations, roadNodes, level, scale));
  const top = Math.max(...scores) || 1;

  let best = candidates[0];
  let bestValue = -Infinity;
  candidates.forEach((p, i) => {
    const value = difficulty * (scores[i] / top) + (1 - difficulty) * random();
    if (value > bestValue) {
      bestValue = value;
      best = p;
    }
  });
  const name = districtName(level, stations, best);
  return { shape, x: best.x, y: best.y, ...(name ? { name } : {}) };
}

/**
 * Il nome del quartiere dove nasce la stazione: il più vicino raggiungibile
 * senza attraversare l'acqua (così un nome non passa il fiume né va su
 * un'altra isola). Se c'è già una stazione con quel nome si numera
 * (es. "Prati 2"). null se il livello non ha quartieri.
 * @param {Level} level
 * @param {Station[]} stations
 * @param {Point} p
 * @returns {string | null}
 */
function districtName(level, stations, p) {
  if (level.districts.length === 0) return null;
  const byDistance = [...level.districts].sort((a, b) => distance(a, p) - distance(b, p));
  const nearest = (byDistance.find((d) => sameLand(level, p, d)) ?? byDistance[0]).name;
  const used = new Set(stations.map((s) => s.name));
  if (!used.has(nearest)) return nearest;
  let n = 2;
  while (used.has(`${nearest} ${n}`)) n++;
  return `${nearest} ${n}`;
}

/**
 * true se a e b stanno sulla stessa terra: si va dall'uno all'altro senza attraversare l'acqua.
 * @param {Level} level
 * @param {Point} a
 * @param {Point} b
 */
function sameLand(level, a, b) {
  if (level.waters.length === 0) return true;
  const map = landsOf(level);
  return landOf(map, a) === landOf(map, b);
}

/**
 * Quanto è difficile collegare una stazione nuova in p: lontana dalla stazione
 * della stessa forma più vicina e lontana dalle strade. Nei livelli con l'acqua
 * le stazioni di una forma stanno di preferenza sulla stessa terra (riva o isola):
 * così ogni terra ha le sue forme e per arrivare a destinazione bisogna attraversare.
 * @param {Point} p
 * @param {Station[]} twins     le stazioni della stessa forma
 * @param {Station[]} stations  tutte le stazioni
 * @param {Point[]} roadNodes
 * @param {Level} level
 * @param {number} scale  per riportare le distanze a numeri fra 0 e 1 circa
 */
function hardness(p, twins, stations, roadNodes, level, scale) {
  let score = 0;
  const pool = twins.length > 0 ? twins : stations;
  const nearest = nearestOf(pool, p);
  if (nearest) score += distance(nearest, p) / scale;
  if (twins.length > 0) {
    // Bonus se almeno metà delle stazioni gemelle sta sulla stessa terra (riva o isola).
    if (level.waters.length > 0) {
      const land = landOf(landsOf(level), p);
      const together = twins.filter((t) => landOf(landsOf(level), t) === land).length;
      if (together * 2 >= twins.length) score += SAME_SIDE_BONUS;
    }
  }
  const road = nearestOf(roadNodes, p);
  if (road) score += (ROAD_WEIGHT * distance(road, p)) / scale;
  return score;
}

/**
 * @template {Point} T
 * @param {T[]} points
 * @param {Point} p
 * @returns {T | null}
 */
function nearestOf(points, p) {
  let best = null;
  let bestD = Infinity;
  for (const q of points) {
    const d = distance(q, p);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/**
 * Una forma a caso fra quelle ammesse, più probabile se ha poche stazioni:
 * così ogni forma ha presto una destinazione per i suoi veicoli.
 * @param {() => number} random
 * @param {Shape[]} shapes
 * @param {Station[]} stations
 * @returns {Shape}
 */
function pickShape(random, shapes, stations) {
  const weights = shapes.map((shape) => 1 / (1 + stations.filter((s) => s.shape === shape).length) ** 2);
  return weightedPick(random, shapes, weights);
}

/**
 * @template T
 * @param {() => number} random
 * @param {T[]} items
 * @param {number[]} weights
 * @returns {T}
 */
function weightedPick(random, items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * true se una stazione in p non tocca nessuna strada (ponti e cavalcavia
 * compresi) e non cade dentro una rotonda, isola compresa.
 * @param {Point} p
 * @param {RoadGraph} graph
 * @param {{x: number, y: number, radius: number}[]} roundabouts
 */
export function clearOfRoads(p, graph, roundabouts) {
  const reach = STATION_CLEARANCE;
  for (const r of roundabouts) if (distance(r, p) < r.radius + reach) return false;
  for (const e of graph.edges.values()) {
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (a && b && distance(closestPointOnSegment(p, a, b), p) < reach) return false;
  }
  return true;
}
