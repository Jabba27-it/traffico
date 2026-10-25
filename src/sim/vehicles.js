// Veicoli: partono da una stazione e viaggiano verso una stazione della loro forma.
// Il percorso è una lista di nodi; il veicolo lo segue pezzo per pezzo, alternando
// tratti dritti di corsia e curve nei nodi.

import { pointOnPiece } from './lanes.js';

/** @typedef {import('./stations.js').Shape} Shape */
/** @typedef {import('./lanes.js').LaneGeometry} LaneGeometry */
/** @typedef {import('./lanes.js').Piece} Piece */

/**
 * @typedef {Object} VehicleType
 * @property {'auto' | 'camion' | 'autobus'} name
 * @property {number} length    in unità di mondo
 * @property {number} width
 * @property {number} maxSpeed  unità di mondo al secondo
 * @property {number} accel     accelerazione, unità al secondo²
 * @property {number} weight    quanto spesso nasce rispetto agli altri tipi
 */

/** I mezzi pesanti sono più lenti e ripartono più piano delle automobili. */
/** @type {VehicleType[]} */
export const VEHICLE_TYPES = [
  { name: 'auto', length: 10, width: 6, maxSpeed: 45, accel: 40, weight: 0.7 },
  { name: 'camion', length: 15, width: 6.8, maxSpeed: 32, accel: 22, weight: 0.2 },
  { name: 'autobus', length: 20, width: 7, maxSpeed: 30, accel: 20, weight: 0.1 },
];

/**
 * @typedef {Object} Vehicle
 * @property {number} id
 * @property {Shape} shape   la forma delle stazioni dove il veicolo può arrivare
 * @property {VehicleType} type
 * @property {number} fromStationId
 * @property {number} toStationId
 * @property {number[]} path  id dei nodi da attraversare, dalla partenza all'arrivo
 * @property {number} leg     tratto in corso: da path[leg] a path[leg + 1]
 * @property {'lane' | 'turn'} phase  sulla corsia di quel tratto, o nella curva alla sua fine
 * @property {number} s       distanza percorsa sul pezzo in corso
 * @property {number} speed
 * @property {{x: number, y: number, dx: number, dy: number}} pose  posizione all'ultimo passo
 * @property {number} departedAt  secondo di gioco in cui è partito
 */

/**
 * Il pezzo su cui si trova il veicolo.
 * @param {LaneGeometry} lanes
 * @param {Vehicle} v
 * @returns {Piece}
 */
export function currentPiece(lanes, v) {
  const { path, leg } = v;
  return v.phase === 'lane' ? lanes.lane(path[leg], path[leg + 1]) : lanes.turn(path[leg], path[leg + 1], path[leg + 2]);
}

/**
 * I pezzi che il veicolo percorrerà, a partire da quello in corso.
 * @param {LaneGeometry} lanes
 * @param {Vehicle} v
 * @returns {Generator<Piece>}
 */
export function* upcomingPieces(lanes, v) {
  const { path } = v;
  let leg = v.leg;
  let phase = v.phase;
  for (;;) {
    if (phase === 'lane') {
      yield lanes.lane(path[leg], path[leg + 1]);
      if (leg + 2 >= path.length) return;
      phase = 'turn';
    } else {
      yield lanes.turn(path[leg], path[leg + 1], path[leg + 2]);
      leg++;
      phase = 'lane';
    }
  }
}

/**
 * Fa avanzare il veicolo di `distance` lungo il percorso, passando da un pezzo al
 * successivo quando serve.
 * @param {LaneGeometry} lanes
 * @param {Vehicle} v
 * @param {number} distance
 * @param {(piece: Piece) => void} onLeave  chiamata per ogni pezzo lasciato
 * @returns {boolean} true se il veicolo è arrivato a destinazione
 */
export function moveVehicle(lanes, v, distance, onLeave) {
  v.s += distance;
  for (;;) {
    const piece = currentPiece(lanes, v);
    if (v.s < piece.length) break;
    if (v.phase === 'lane' && v.leg + 2 >= v.path.length) return true;
    v.s -= piece.length;
    onLeave(piece);
    if (v.phase === 'lane') {
      v.phase = 'turn';
    } else {
      v.phase = 'lane';
      v.leg++;
    }
  }
  v.pose = pointOnVehicle(lanes, v);
  return false;
}

/**
 * Posizione e direzione di marcia del veicolo, sul pezzo in corso.
 * @param {LaneGeometry} lanes
 * @param {Vehicle} v
 */
export function pointOnVehicle(lanes, v) {
  const piece = currentPiece(lanes, v);
  return pointOnPiece(piece, Math.max(0, Math.min(piece.length, v.s)));
}

/**
 * Un tipo di veicolo a caso, secondo il peso di ciascuno.
 * @param {() => number} random
 * @returns {VehicleType}
 */
export function randomVehicleType(random) {
  const total = VEHICLE_TYPES.reduce((a, t) => a + t.weight, 0);
  let r = random() * total;
  for (const t of VEHICLE_TYPES) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return VEHICLE_TYPES[0];
}
