// Generatore di stazioni: sceglie forma e posizione della prossima stazione.
// Casuale, ma solo dentro le zone del livello e lontano dalle altre stazioni.

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
 * @returns {StationDef | null}  null se non c'è un punto libero adatto
 */
export function pickNewStation(random, level, stations) {
  if (!level.growth || level.zones.length === 0 || level.shapes.length === 0) return null;
  const minDistance = level.growth.minDistance;
  const margin = STATION_RADIUS + 4;

  for (let i = 0; i < ATTEMPTS; i++) {
    const zone = pickZone(random, level.zones);
    const x = clamp(zone.x + random() * zone.width, margin, level.world.width - margin);
    const y = clamp(zone.y + random() * zone.height, margin, level.world.height - margin);
    const p = { x, y };
    const dry = distanceToWater(level.waters, p) >= STATION_RADIUS + WATER_MARGIN;
    if (dry && stations.every((s) => distance(s, p) >= minDistance)) {
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
 * Una zona a caso, con probabilità proporzionale alla sua area.
 * @param {() => number} random
 * @param {import('./level.js').Zone[]} zones
 */
function pickZone(random, zones) {
  return weightedPick(random, zones, zones.map((z) => z.width * z.height));
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
 * @param {number} v
 * @param {number} min
 * @param {number} max
 */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
