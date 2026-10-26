// Stazioni speciali: stadi, porti e aeroporti. Stanno nel loro posto reale e
// compaiono in un giorno deciso dal livello. Porti e aeroporti generano il
// doppio dei veicoli, soprattutto mezzi pesanti; lo stadio è tranquillo, ma ogni
// tanto c'è la partita: prima arrivano i tifosi, alla fine escono tutti insieme.

/** @typedef {'stadio' | 'porto' | 'aeroporto'} SpecialKind */

/** @type {readonly SpecialKind[]} */
export const SPECIAL_KINDS = ['stadio', 'porto', 'aeroporto'];

/** La capienza di una stazione speciale, rispetto a una normale. */
export const SPECIAL_CAPACITY = 2;

/** Quanti veicoli genera una stazione speciale, rispetto a una normale. */
export const SPAWN_FACTOR = { stadio: 1 / 3, porto: 2, aeroporto: 2 };

/**
 * Pesi dei tipi di veicolo (auto, camion, autobus) che partono da porti e
 * aeroporti: soprattutto mezzi pesanti.
 */
export const HEAVY_MIX = { porto: [0.3, 0.45, 0.25], aeroporto: [0.35, 0.15, 0.5] };

/**
 * La partita allo stadio. I tempi sono in secondi di gioco, le cadenze in giorni.
 * - every: giorni fra una partita e l'altra; first: giorni dalla comparsa alla prima
 * - warn: avviso col fischietto; arrive: arrivano i tifosi; play: si gioca; leave: si esce
 * - fans: veicoli in più verso lo stadio (dalle altre stazioni); out: veicoli che escono
 */
export const MATCH = { every: 5, first: 1, warn: 10, arrive: 20, play: 10, leave: 20, fans: 10, out: 12 };

/** @typedef {'avviso' | 'arrivo' | 'partita' | 'uscita'} MatchPhase */

/**
 * A che punto è la partita di uno stadio.
 * @param {{bornAt: number}} stadium
 * @param {number} elapsed  secondi di gioco
 * @param {number} dayLength
 * @returns {{cycle: number, phase: MatchPhase, done: number, left: number} | null}
 *   cycle = numero della partita, done = frazione già passata della fase,
 *   left = secondi alla fine della fase; null fra una partita e l'altra
 */
export function matchState(stadium, elapsed, dayLength) {
  const t = elapsed - stadium.bornAt - MATCH.first * dayLength;
  if (t < 0) return null;
  const period = MATCH.every * dayLength;
  const cycle = Math.floor(t / period);
  let k = t - cycle * period;
  /** @type {[MatchPhase, number][]} */
  const phases = [['avviso', MATCH.warn], ['arrivo', MATCH.arrive], ['partita', MATCH.play], ['uscita', MATCH.leave]];
  for (const [phase, length] of phases) {
    if (k < length) return { cycle, phase, done: k / length, left: length - k };
    k -= length;
  }
  return null;
}
