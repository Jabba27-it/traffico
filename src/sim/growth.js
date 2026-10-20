// Generatore di stazioni: sceglie forma e posizione della prossima stazione.
// Solo nella parte visibile della città (e dentro le zone del livello, se ce
// ne sono), fuori dall'acqua e lontano dalle altre stazioni. Fra i punti
// possibili preferisce quelli difficili da collegare, quanto dice il livello.

import { distance } from './geometry.js';
import { STATION_RADIUS } from './stations.js';
import { distanceToWater, isInWater } from './water.js';

/** @typedef {import('./level.js').Level} Level */
/** @typedef {import('./level.js').StationDef} StationDef */
/** @typedef {import('./stations.js').Station} Station */
/** @typedef {import('./stations.js').Shape} Shape */
/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {{x: number, y: number}} Point */

/** Quanti punti casuali provare ogni volta. */
const ATTEMPTS = 24;
/** Spazio minimo fra il bordo di una stazione e la riva. */
const WATER_MARGIN = 16;
/** Peso di "c'è acqua fra la stazione nuova e la sua gemella più vicina". */
const WATER_BONUS = 0.4;
/** Peso di "è lontana dalle strade già costruite". */
const ROAD_WEIGHT = 0.5;

/**
 * @param {() => number} random
 * @param {Level} level
 * @param {Station[]} stations  le stazioni già presenti
 * @param {import('./view.js').Rect} area  dove può nascere (la vista attuale, già ristretta dai bordi)
 * @param {RoadGraph} graph  per stare lontano dalle strade già costruite
 * @param {(p: Point) => boolean} [allowed]  scarta altri punti, es. quelli coperti dall'interfaccia
 * @returns {StationDef | null}  null se non c'è un punto libero adatto
 */
export function pickNewStation(random, level, stations, area, graph, allowed = () => true) {
  if (!level.growth || level.shapes.length === 0) return null;
  const { minDistance, difficulty } = level.growth;
  const shape = pickShape(random, level.shapes, stations);

  /** @type {Point[]} */
  const candidates = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const p = { x: area.x + random() * area.width, y: area.y + random() * area.height };
    const inZone = level.zones.length === 0 || level.zones.some((z) => p.x >= z.x && p.y >= z.y && p.x <= z.x + z.width && p.y <= z.y + z.height);
    const dry = distanceToWater(level.waters, p) >= STATION_RADIUS + WATER_MARGIN;
    if (inZone && dry && allowed(p) && stations.every((s) => distance(s, p) >= minDistance)) candidates.push(p);
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
  return { shape, x: best.x, y: best.y };
}

/**
 * Quanto è difficile collegare una stazione nuova in p: lontana dalla stazione
 * della stessa forma più vicina, con l'acqua in mezzo, lontana dalle strade.
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
  if (nearest) {
    score += distance(nearest, p) / scale;
    if (crossesWater(level, p, nearest)) score += WATER_BONUS;
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
 * true se il segmento a-b passa sopra l'acqua.
 * @param {Level} level
 * @param {Point} a
 * @param {Point} b
 */
function crossesWater(level, a, b) {
  const STEPS = 16;
  for (let k = 1; k < STEPS; k++) {
    const t = k / STEPS;
    if (isInWater(level.waters, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return true;
  }
  return false;
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
