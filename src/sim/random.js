// Generatore di numeri casuali con seme: con lo stesso seme dà sempre la
// stessa sequenza, così la simulazione è riproducibile.

/**
 * @param {number} seed
 * @returns {() => number} restituisce numeri in [0, 1)
 */
export function createRandom(seed) {
  let s = seed >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
