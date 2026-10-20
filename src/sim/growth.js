// Generatore di stazioni: sceglie forma e posizione della prossima stazione.
// Casuale, ma solo nella parte visibile della città (e dentro le zone del
// livello, se ce ne sono), fuori dall'acqua e lontano dalle altre stazioni.

import { distance } from './geometry.js';
import { STATION_RADIUS } from './stations.js';
import { distanceToWater } from './water.js';

/** @typedef {import('./level.js').Level} Level */
/** @typedef {import('./level.js').StationDef} StationDef */
/** @typedef {import('./stations.js').Station} Station */
/** @typedef {import('./stations.js').Shape} Shape */

/** Quanti punti casuali provare prima di rinunciare per questa volta. */
const ATTEMPTS = 20;
/** Spazio minimo fra il bordo di una stazione e la riva. */
const WATER_MARGIN = 16;

/**
 * @param {() => number} random
 * @param {Level} level
 * @param {Station[]} stations  le stazioni già presenti
 * @param {import('./view.js').Rect} area  dove può nascere (la vista attuale, già ristretta dai bordi)
 * @returns {StationDef | null}  null se non c'è un punto libero adatto
 */
export function pickNewStation(random, level, stations, area) {
  if (!level.growth || level.shapes.length === 0) return null;
  const minDistance = level.growth.minDistance;

  for (let i = 0; i < ATTEMPTS; i++) {
    const x = area.x + random() * area.width;
    const y = area.y + random() * area.height;
    const p = { x, y };
    const inZone = level.zones.length === 0 || level.zones.some((z) => x >= z.x && y >= z.y && x <= z.x + z.width && y <= z.y + z.height);
    const dry = distanceToWater(level.waters, p) >= STATION_RADIUS + WATER_MARGIN;
    if (inZone && dry && stations.every((s) => distance(s, p) >= minDistance)) {
      return { shape: pickShape(random, level.shapes, stations), x, y };
    }
  }
  return null;
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
