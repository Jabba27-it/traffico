// Stato della partita e avanzamento nel tempo: partenze dei veicoli,
// movimento, viaggi completati e punteggio.

import { createRandom } from './random.js';
import { shortestPaths, pathTo } from './pathfinding.js';
import { advanceVehicle } from './vehicles.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./stations.js').Station} Station */
/** @typedef {import('./vehicles.js').Vehicle} Vehicle */

/** Intervallo fra due partenze dalla stessa stazione, in secondi. */
const SPAWN_MIN = 4;
const SPAWN_MAX = 6;

export class Simulation {
  /**
   * @param {RoadGraph} graph
   * @param {Station[]} stations
   * @param {number} seed
   */
  constructor(graph, stations, seed) {
    this.graph = graph;
    this.stations = stations;
    this.random = createRandom(seed);
    /** @type {Vehicle[]} */
    this.vehicles = [];
    this.nextVehicleId = 1;
    /** Secondi di gioco trascorsi. */
    this.elapsed = 0;
    /** Veicoli arrivati a destinazione. */
    this.trips = 0;
    /** @type {Map<number, number>} secondi alla prossima partenza, per stazione */
    this.spawnTimers = new Map(stations.map((s) => [s.id, this.nextSpawnDelay()]));
  }

  /** Secondi interi trascorsi (la tolleranza assorbe gli arrotondamenti dei passi). */
  get seconds() {
    return Math.floor(this.elapsed + 1e-6);
  }

  /** +1 per ogni viaggio completato e +1 per ogni secondo trascorso. */
  get score() {
    return this.trips + this.seconds;
  }

  /** @param {number} dt  secondi */
  step(dt) {
    this.elapsed += dt;

    for (const station of this.stations) {
      const t = /** @type {number} */ (this.spawnTimers.get(station.id)) - dt;
      if (t > 0) {
        this.spawnTimers.set(station.id, t);
        continue;
      }
      this.spawnFrom(station);
      this.spawnTimers.set(station.id, t + this.nextSpawnDelay());
    }

    this.vehicles = this.vehicles.filter((v) => {
      if (!advanceVehicle(this.graph, v, dt)) return true;
      this.trips++;
      return false;
    });
  }

  /**
   * Fa partire un veicolo verso la stazione della stessa forma più vicina
   * lungo le strade. Se nessuna è raggiungibile, non parte nessuno.
   * @param {Station} origin
   */
  spawnFrom(origin) {
    const paths = shortestPaths(this.graph, origin.nodeId);
    let target = null;
    let best = Infinity;
    for (const s of this.stations) {
      if (s === origin || s.shape !== origin.shape) continue;
      const d = paths.dist.get(s.nodeId);
      if (d !== undefined && d < best) {
        best = d;
        target = s;
      }
    }
    if (!target) return;
    const path = /** @type {number[]} */ (pathTo(paths, target.nodeId));
    this.vehicles.push({
      id: this.nextVehicleId++,
      shape: origin.shape,
      fromStationId: origin.id,
      toStationId: target.id,
      path,
      leg: 0,
      along: 0,
    });
  }

  nextSpawnDelay() {
    return SPAWN_MIN + this.random() * (SPAWN_MAX - SPAWN_MIN);
  }
}
