// Congestione delle stazioni: carico, sovraccarico e sconfitta.

/** @typedef {import('./stations.js').Station} Station */

/** Quando la coda torna sotto la capienza, il sovraccarico cala a questa velocità. */
const RECOVERY_RATE = 0.5;

/**
 * Veicoli in coda che contano per la capienza: i rientrati da una strada
 * cancellata no, così rifare una strada non fa perdere la partita.
 * @param {Station} s
 */
export function waitingCount(s) {
  return s.queue.length - Math.min(s.returned, s.queue.length);
}

/**
 * Carico della stazione: 0 = vuota, 1 = coda piena, oltre 1 = sovraccarica.
 * @param {Station} s
 */
export function stationLoad(s) {
  return waitingCount(s) / s.capacity;
}

/**
 * Aggiorna il sovraccarico di ogni stazione.
 * @param {Station[]} stations
 * @param {number} dt
 * @param {number} tolerance  secondi di sovraccarico che portano alla sconfitta
 * @returns {Station | null} la stazione che ha fatto fallire il livello, se c'è
 */
export function updateCongestion(stations, dt, tolerance) {
  for (const s of stations) {
    if (waitingCount(s) > s.capacity) {
      s.overload = Math.min(tolerance, s.overload + dt);
      if (s.overload >= tolerance) return s;
    } else {
      s.overload = Math.max(0, s.overload - dt * RECOVERY_RATE);
    }
  }
  return null;
}
