// Stato della partita e avanzamento nel tempo: veicoli che nascono in coda
// nelle stazioni, partenze, movimento, viaggi completati e punteggio.

import { createRandom } from './random.js';
import { shortestPaths, pathTo } from './pathfinding.js';
import { advanceVehicle } from './vehicles.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./stations.js').Station} Station */
/** @typedef {import('./stations.js').Shape} Shape */
/** @typedef {import('./vehicles.js').Vehicle} Vehicle */

/** Intervallo fra due nuovi veicoli nella stessa stazione, in secondi. */
const SPAWN_MIN = 4;
const SPAWN_MAX = 6;
/** Una stazione fa partire al massimo un veicolo ogni tanti secondi. */
const DEPART_INTERVAL = 1;

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
    /** Forme presenti nel livello: i veicoli nascono solo con queste. */
    this.shapes = [...new Set(stations.map((s) => s.shape))];
    /** @type {Vehicle[]} */
    this.vehicles = [];
    this.nextVehicleId = 1;
    /** Secondi di gioco trascorsi. */
    this.elapsed = 0;
    /** Veicoli arrivati a destinazione. */
    this.trips = 0;
    /** @type {Map<number, number>} secondi al prossimo veicolo in coda, per stazione */
    this.spawnTimers = new Map(stations.map((s) => [s.id, this.nextSpawnDelay()]));
    /** @type {Map<number, number>} secondi alla prossima partenza possibile, per stazione */
    this.departTimers = new Map(stations.map((s) => [s.id, 0]));
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
      const spawn = /** @type {number} */ (this.spawnTimers.get(station.id)) - dt;
      if (spawn <= 0) this.enqueue(station);
      this.spawnTimers.set(station.id, spawn > 0 ? spawn : spawn + this.nextSpawnDelay());

      // Anche se nessuno può partire si riprova dopo DEPART_INTERVAL,
      // così il percorso non si ricalcola a ogni passo.
      const depart = /** @type {number} */ (this.departTimers.get(station.id)) - dt;
      if (depart <= 0 && station.queue.length > 0) {
        this.depart(station);
        this.departTimers.set(station.id, DEPART_INTERVAL);
      } else {
        this.departTimers.set(station.id, Math.max(0, depart));
      }
    }

    this.vehicles = this.vehicles.filter((v) => {
      if (!advanceVehicle(this.graph, v, dt)) return true;
      this.trips++;
      return false;
    });
  }

  /**
   * Aggiunge alla coda un veicolo di forma diversa da quella della stazione.
   * @param {Station} station
   */
  enqueue(station) {
    const options = this.shapes.filter((s) => s !== station.shape);
    if (options.length === 0) return;
    station.queue.push(options[Math.floor(this.random() * options.length)]);
  }

  /**
   * Fa partire il primo veicolo in coda che può raggiungere una stazione
   * della sua forma, verso quella più vicina lungo le strade.
   * @param {Station} origin
   * @returns {boolean} true se un veicolo è partito
   */
  depart(origin) {
    const paths = shortestPaths(this.graph, origin.nodeId);
    for (let i = 0; i < origin.queue.length; i++) {
      const shape = origin.queue[i];
      let target = null;
      let best = Infinity;
      for (const s of this.stations) {
        if (s === origin || s.shape !== shape) continue;
        const d = paths.dist.get(s.nodeId);
        if (d !== undefined && d < best) {
          best = d;
          target = s;
        }
      }
      if (!target) continue;
      origin.queue.splice(i, 1);
      this.vehicles.push({
        id: this.nextVehicleId++,
        shape,
        fromStationId: origin.id,
        toStationId: target.id,
        path: /** @type {number[]} */ (pathTo(paths, target.nodeId)),
        leg: 0,
        along: 0,
      });
      return true;
    }
    return false;
  }

  nextSpawnDelay() {
    return SPAWN_MIN + this.random() * (SPAWN_MAX - SPAWN_MIN);
  }
}
