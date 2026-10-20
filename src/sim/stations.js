// Stazioni: punti della città, ognuno con una forma.
// Ogni stazione ha un nodo nel grafo stradale a cui si collegano le strade.

import { closestPointOnSegment, distance } from './geometry.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./level.js').StationDef} StationDef */

/** @typedef {'cerchio' | 'quadrato' | 'triangolo' | 'pentagono' | 'esagono' | 'stella'} Shape */

/** @type {readonly Shape[]} */
export const SHAPES = ['cerchio', 'quadrato', 'triangolo', 'pentagono', 'esagono', 'stella'];

/** Raggio dell'area occupata da una stazione: nessuna strada la scavalca. */
export const STATION_RADIUS = 24;

/**
 * @typedef {Object} Station
 * @property {number} id
 * @property {Shape} shape
 * @property {number} x
 * @property {number} y
 * @property {number} nodeId  nodo del grafo stradale che rappresenta la stazione
 * @property {Shape[]} queue   forme dei veicoli in attesa di partire, dal primo arrivato
 * @property {number} bornAt   secondo di gioco in cui è comparsa
 * @property {number} capacity veicoli in coda che regge senza sovraccarico
 * @property {number} overload secondi di sovraccarico accumulati
 */

/**
 * Crea una stazione e il suo nodo nel grafo. Le strade che passano già sopra
 * quel punto vengono deviate dentro la stazione, perché nessuna la scavalchi.
 * @param {RoadGraph} graph
 * @param {StationDef} def
 * @param {number} id
 * @param {number} bornAt
 * @param {number} capacity
 * @returns {Station}
 */
export function createStation(graph, def, id, bornAt, capacity) {
  const node = graph.addNode(def.x, def.y);
  node.stationId = id;
  for (const e of [...graph.edges.values()]) {
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    if (distance(closestPointOnSegment(node, a, b), node) > STATION_RADIUS) continue;
    graph.removeEdge(e.id);
    graph.addEdge(e.a, node.id);
    graph.addEdge(node.id, e.b);
  }
  return { id, shape: def.shape, x: def.x, y: def.y, nodeId: node.id, queue: [], bornAt, capacity, overload: 0 };
}
