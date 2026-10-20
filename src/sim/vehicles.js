// Veicoli: partono da una stazione e viaggiano verso una stazione della loro forma.

import { distance } from './geometry.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./stations.js').Shape} Shape */

/** Velocità dei veicoli in unità di mondo al secondo. */
export const VEHICLE_SPEED = 60;

/**
 * @typedef {Object} Vehicle
 * @property {number} id
 * @property {Shape} shape   la forma delle stazioni dove il veicolo può arrivare
 * @property {number} fromStationId
 * @property {number} toStationId
 * @property {number[]} path  id dei nodi da attraversare, dalla partenza all'arrivo
 * @property {number} leg     indice del tratto in corso (da path[leg] a path[leg + 1])
 * @property {number} along   distanza già percorsa sul tratto in corso
 */

/**
 * Fa avanzare il veicolo di `dt` secondi.
 * @param {RoadGraph} graph
 * @param {Vehicle} v
 * @param {number} dt
 * @returns {boolean} true se il veicolo è arrivato a destinazione
 */
export function advanceVehicle(graph, v, dt) {
  v.along += VEHICLE_SPEED * dt;
  while (v.leg < v.path.length - 1) {
    const length = legLength(graph, v, v.leg);
    if (v.along < length) return false;
    v.along -= length;
    v.leg++;
  }
  return true;
}

/**
 * Posizione e direzione di marcia del veicolo.
 * @param {RoadGraph} graph
 * @param {Vehicle} v
 * @returns {{x: number, y: number, dx: number, dy: number}}  (dx, dy) ha lunghezza 1
 */
export function vehiclePose(graph, v) {
  const last = Math.min(v.leg, v.path.length - 2);
  const a = node(graph, v.path[last]);
  const b = node(graph, v.path[last + 1]);
  const length = distance(a, b) || 1;
  const t = Math.min(1, v.along / length);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    dx: (b.x - a.x) / length,
    dy: (b.y - a.y) / length,
  };
}

/**
 * @param {RoadGraph} graph
 * @param {Vehicle} v
 * @param {number} leg
 */
function legLength(graph, v, leg) {
  return distance(node(graph, v.path[leg]), node(graph, v.path[leg + 1]));
}

/**
 * @param {RoadGraph} graph
 * @param {number} id
 */
function node(graph, id) {
  const n = graph.nodes.get(id);
  if (!n) throw new Error(`Nodo ${id} inesistente`);
  return n;
}
