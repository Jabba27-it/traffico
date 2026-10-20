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
 * @typedef {Object} Zone  rettangolo dove possono comparire nuove stazioni
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} Growth
 * @property {number} interval     secondi fra una stazione nuova e la successiva
 * @property {number} max          numero massimo di stazioni nel livello
 * @property {number} minDistance  distanza minima fra due stazioni
 */

/**
 * @typedef {Object} Level
 * @property {string} name
 * @property {{width: number, height: number}} world
 * @property {Shape[]} shapes        forme ammesse per le stazioni nuove
 * @property {StationDef[]} stations stazioni presenti dall'inizio
 * @property {Growth | null} growth  null se la città non cresce
 * @property {Zone[]} zones
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
    checkShape(s?.forma, `Stazione ${i + 1}`);
    if (!isNum(s.x) || !isNum(s.y)) throw new Error(`Stazione ${i + 1}: mancano "x" o "y"`);
    return { shape: s.forma, x: s.x, y: s.y };
  });

  /** @type {Shape[]} */
  let shapes = stations.map((/** @type {StationDef} */ s) => s.shape);
  if (json.forme !== undefined) {
    if (!Array.isArray(json.forme)) throw new Error('"forme" deve essere una lista');
    json.forme.forEach((/** @type {any} */ f) => checkShape(f, '"forme"'));
    shapes = json.forme;
  }
  shapes = [...new Set(shapes)];

  let growth = null;
  /** @type {Zone[]} */
  let zones = [];
  if (json.crescita !== undefined) {
    const c = json.crescita;
    if (!isNum(c?.ogni) || c.ogni <= 0) throw new Error('"crescita" deve avere "ogni" (secondi, maggiore di 0)');
    growth = {
      interval: c.ogni,
      max: isNum(c.massimo) ? c.massimo : Infinity,
      minDistance: isNum(c.distanzaMinima) ? c.distanzaMinima : 80,
    };
    if (!Array.isArray(json.zone) || json.zone.length === 0) {
      throw new Error('Con "crescita" serve almeno una zona in "zone"');
    }
    zones = json.zone.map((/** @type {any} */ z, /** @type {number} */ i) => {
      if (!isNum(z?.x) || !isNum(z.y) || !isNum(z.larghezza) || !isNum(z.altezza)) {
        throw new Error(`Zona ${i + 1}: servono "x", "y", "larghezza", "altezza"`);
      }
      return { x: z.x, y: z.y, width: z.larghezza, height: z.altezza };
    });
  }

  return {
    name: String(json.nome ?? 'Senza nome'),
    world: { width: world.larghezza, height: world.altezza },
    shapes,
    stations,
    growth,
    zones,
  };
}

/**
 * @param {unknown} shape
 * @param {string} where
 */
function checkShape(shape, where) {
  if (!SHAPES.includes(/** @type {Shape} */ (shape))) {
    throw new Error(`${where}: forma "${shape}" sconosciuta (valide: ${SHAPES.join(', ')})`);
  }
}

/** @param {unknown} v */
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
