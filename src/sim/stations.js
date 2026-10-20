// Stazioni: punti fissi della città, ognuno con una forma.
// Ogni stazione ha un nodo nel grafo stradale a cui si collegano le strade.

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
 */

/**
 * Crea le stazioni del livello e i rispettivi nodi nel grafo.
 * @param {RoadGraph} graph
 * @param {StationDef[]} defs
 * @returns {Station[]}
 */
export function createStations(graph, defs) {
  return defs.map((def, i) => {
    const node = graph.addNode(def.x, def.y);
    const id = i + 1;
    node.stationId = id;
    return { id, shape: def.shape, x: def.x, y: def.y, nodeId: node.id, queue: [] };
  });
}
