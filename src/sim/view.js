// La parte visibile della città: si allarga in modo continuo seguendo le
// tappe del livello, giorno dopo giorno.

/** @typedef {import('./level.js').ViewKey} ViewKey */

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * La vista in un certo giorno (anche frazionario, 1 = inizio partita).
 * Fra due tappe si passa dall'una all'altra con un movimento morbido.
 * @param {ViewKey[]} keys
 * @param {number} day
 * @returns {Rect}
 */
export function viewAt(keys, day) {
  const k = segmentAt(keys, day);
  if (k < 0) return rect(keys[0]);
  if (k >= keys.length - 1) return rect(keys[keys.length - 1]);
  const a = keys[k];
  const b = keys[k + 1];
  const t = smooth((day - a.day) / (b.day - a.day));
  const mix = (/** @type {number} */ p, /** @type {number} */ q) => p + (q - p) * t;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), width: mix(a.width, b.width), height: mix(a.height, b.height) };
}

/**
 * Indice della tappa da cui la vista sta partendo: -1 prima della prima,
 * keys.length - 1 dopo l'ultima.
 * @param {ViewKey[]} keys
 * @param {number} day
 */
export function segmentAt(keys, day) {
  let k = -1;
  for (let i = 0; i < keys.length; i++) if (day >= keys[i].day) k = i;
  return k;
}

/**
 * Il rettangolo ristretto di `left`, `top`, `right`, `bottom` (in frazioni delle sue misure).
 * @param {Rect} r
 * @param {number} left
 * @param {number} top
 * @param {number} right
 * @param {number} bottom
 * @returns {Rect}
 */
export function insetRect(r, left, top, right, bottom) {
  return {
    x: r.x + r.width * left,
    y: r.y + r.height * top,
    width: r.width * (1 - left - right),
    height: r.height * (1 - top - bottom),
  };
}

/**
 * @param {Rect} r
 * @param {{x: number, y: number}} p
 * @param {number} [margin]  distanza minima dai bordi
 */
export function rectContains(r, p, margin = 0) {
  return p.x >= r.x + margin && p.y >= r.y + margin && p.x <= r.x + r.width - margin && p.y <= r.y + r.height - margin;
}

/** @param {ViewKey} k */
function rect(k) {
  return { x: k.x, y: k.y, width: k.width, height: k.height };
}

/** @param {number} t  0..1 */
function smooth(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}
