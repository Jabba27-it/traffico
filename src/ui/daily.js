// Sfida del giorno: ogni giorno una città, la stessa per tutti, con le regole
// della modalità senza fine. Il seme viene dalla data, quindi le stazioni nascono
// uguali per chiunque giochi quel giorno (e a ogni tentativo). Il record del
// giorno e la serie di giorni di fila restano sul telefono.

import { createRandom } from '../sim/random.js';

/** @typedef {import('./menu.js').LevelEntry} LevelEntry */

const RECORD_PREFIX = 'traffico.sfida.';
/** Dove si ricordano i giorni in cui si è giocata la sfida (per la serie). */
const DAYS_KEY = 'traffico.sfida-giorni';
/** Quanti giorni giocati si ricordano: bastano per una serie lunga. */
const DAYS_KEPT = 400;
/** Seme fisso con cui si mescola l'ordine delle città: uguale per tutti. */
const ORDER_SEED = 2026;
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/**
 * Il giorno di oggi (ora del telefono) come "2026-10-26".
 * @param {Date} [date]
 */
export function todayKey(date = new Date()) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** @param {string} key */
export function isDayKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key);
}

/**
 * Il numero del giorno, contato dal 1° gennaio 1970 (senza fusi orari).
 * @param {string} key
 */
function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Il seme della simulazione per quel giorno.
 * @param {string} key
 */
export function dailySeed(key) {
  // FNV-1a sul testo della data.
  let h = 0x811c9dc5;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/**
 * La città del giorno: le città a rotazione, in un ordine mescolato una volta per tutte.
 * @param {LevelEntry[]} levels  dall'indice; contano solo quelle che hanno la modalità senza fine
 * @param {string} key
 */
export function dailyCity(levels, key) {
  const cities = levels.filter((l) => l.sandbox);
  const random = createRandom(ORDER_SEED);
  const order = cities.map((c) => ({ c, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.c);
  return order[((dayNumber(key) % order.length) + order.length) % order.length];
}

/**
 * "26 ottobre".
 * @param {string} key
 */
export function dayLabel(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * Il miglior punteggio fatto nella sfida di quel giorno (0 se non giocata).
 * @param {string} key
 */
export function loadDailyBest(key) {
  try {
    const n = Number(localStorage.getItem(RECORD_PREFIX + key));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** @returns {string[]} i giorni in cui si è giocata la sfida */
function playedDays() {
  try {
    const list = JSON.parse(localStorage.getItem(DAYS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((d) => typeof d === 'string' && isDayKey(d)) : [];
  } catch {
    return [];
  }
}

/**
 * Salva il risultato di una partita alla sfida di quel giorno.
 * @param {string} key
 * @param {number} score
 * @returns {{ best: number, newBest: boolean }}
 */
export function saveDaily(key, score) {
  const old = loadDailyBest(key);
  try {
    if (score > old) localStorage.setItem(RECORD_PREFIX + key, String(score));
    const days = playedDays();
    if (!days.includes(key)) localStorage.setItem(DAYS_KEY, JSON.stringify([...days, key].slice(-DAYS_KEPT)));
  } catch {
    // niente salvataggio: il record vale solo per questa partita
  }
  return { best: Math.max(old, score), newBest: score > old };
}

/**
 * Quanti giorni di fila si è giocata la sfida, fino a oggi. Se oggi non si è
 * ancora giocato, la serie di ieri è ancora viva e si conta quella.
 * @param {string} [key]  oggi
 */
export function dailyStreak(key = todayKey()) {
  const days = new Set(playedDays().map(dayNumber));
  let day = dayNumber(key);
  if (!days.has(day)) day--;
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day--;
  }
  return streak;
}

/**
 * Il testo da condividere dopo una partita alla sfida.
 * @param {string} game  nome del gioco
 * @param {string} key
 * @param {string} city
 * @param {number} score
 * @param {number} days  giorni resistiti
 */
export function shareText(game, key, city, score, days) {
  const [, m, d] = key.split('-').map(Number);
  return `${game} – Sfida del ${d}/${m}, ${city}: ${score} punti in ${days} ${days === 1 ? 'giorno' : 'giorni'}. Riesci a fare meglio?`;
}
