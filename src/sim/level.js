// Lettura e controllo di un file di livello (vedi levels/*.json).

import { SHAPES } from './stations.js';

/** @typedef {import('./stations.js').Shape} Shape */

/**
 * @typedef {Object} StationDef
 * @property {Shape} shape
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Level
 * @property {string} name
 * @property {{width: number, height: number}} world
 * @property {StationDef[]} stations
 */

/**
 * Converte il JSON del livello (chiavi in italiano) nel formato usato dal codice.
 * Lancia un errore leggibile se il file non è valido.
 * @param {any} json
 * @returns {Level}
 */
export function parseLevel(json) {
  const world = json?.mondo;
  if (!isNum(world?.larghezza) || !isNum(world?.altezza)) {
    throw new Error('Il livello deve avere "mondo": { "larghezza", "altezza" }');
  }
  if (!Array.isArray(json.stazioni)) throw new Error('Il livello deve avere una lista "stazioni"');

  const stations = json.stazioni.map((/** @type {any} */ s, /** @type {number} */ i) => {
    if (!SHAPES.includes(s?.forma)) {
      throw new Error(`Stazione ${i + 1}: forma "${s?.forma}" sconosciuta (valide: ${SHAPES.join(', ')})`);
    }
    if (!isNum(s.x) || !isNum(s.y)) throw new Error(`Stazione ${i + 1}: mancano "x" o "y"`);
    return { shape: s.forma, x: s.x, y: s.y };
  });

  return {
    name: String(json.nome ?? 'Senza nome'),
    world: { width: world.larghezza, height: world.altezza },
    stations,
  };
}

/** @param {unknown} v */
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
