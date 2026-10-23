// Record per livello (miglior punteggio, stelle e platino presi almeno una volta),
// salvati sul telefono. Se il browser non lo permette, semplicemente non si salvano.

const PREFIX = 'traffico.record.';

/**
 * @typedef {Object} LevelRecord
 * @property {number} score
 * @property {boolean[]} stars
 * @property {boolean} platinum
 */

/**
 * @param {string} levelFile
 * @returns {LevelRecord}
 */
export function loadRecord(levelFile) {
  try {
    const raw = localStorage.getItem(PREFIX + levelFile);
    const data = raw ? JSON.parse(raw) : null;
    if (data && typeof data.score === 'number' && Array.isArray(data.stars)) {
      return { score: data.score, stars: [0, 1, 2].map((i) => data.stars[i] === true), platinum: data.platinum === true };
    }
  } catch {
    // archivio non disponibile o dati rovinati: si riparte da zero
  }
  return { score: 0, stars: [false, false, false], platinum: false };
}

/**
 * Unisce il risultato della partita al record: il punteggio migliore e tutte
 * le stelle prese, anche in partite diverse.
 * @param {string} levelFile
 * @param {number} score
 * @param {boolean[]} stars
 * @param {boolean} [platinum]
 * @returns {{ record: LevelRecord, newBest: boolean }}
 */
export function saveRecord(levelFile, score, stars, platinum = false) {
  const old = loadRecord(levelFile);
  const record = { score: Math.max(old.score, score), stars: old.stars.map((s, i) => s || stars[i] === true), platinum: old.platinum || platinum };
  try {
    localStorage.setItem(PREFIX + levelFile, JSON.stringify(record));
  } catch {
    // niente salvataggio: il record vale solo per questa partita
  }
  return { record, newBest: score > old.score };
}
