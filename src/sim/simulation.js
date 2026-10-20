// Stato della partita e avanzamento nel tempo: veicoli che nascono in coda
// nelle stazioni, partenze, movimento, viaggi completati e punteggio.

import { createRandom } from './random.js';
import { shortestPaths, pathTo } from './pathfinding.js';
import { advanceVehicle, vehiclePose } from './vehicles.js';
import { closestPointOnSegment, distance } from './geometry.js';
import { STATION_RADIUS, createStation } from './stations.js';
import { pickNewStation } from './growth.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./level.js').Level} Level */
/** @typedef {import('./level.js').StationDef} StationDef */
/** @typedef {import('./graph.js').RoadNode} RoadNode */
/** @typedef {import('./stations.js').Station} Station */
/** @typedef {import('./stations.js').Shape} Shape */
/** @typedef {import('./vehicles.js').Vehicle} Vehicle */

/** Intervallo fra due nuovi veicoli nella stessa stazione, in secondi. */
const SPAWN_MIN = 4;
const SPAWN_MAX = 6;
/** Una stazione fa partire al massimo un veicolo ogni tanti secondi. */
const DEPART_INTERVAL = 1;
/** Se non c'è posto per una stazione nuova, si riprova dopo tanti secondi. */
const GROWTH_RETRY = 1;

export class Simulation {
  /**
   * @param {RoadGraph} graph
   * @param {Level} level
   * @param {number} seed
   */
  constructor(graph, level, seed) {
    this.graph = graph;
    this.level = level;
    this.random = createRandom(seed);
    /** @type {Station[]} */
    this.stations = [];
    /** @type {Vehicle[]} */
    this.vehicles = [];
    this.nextVehicleId = 1;
    /** Secondi di gioco trascorsi. */
    this.elapsed = 0;
    /** Veicoli arrivati a destinazione. */
    this.trips = 0;
    /** @type {Map<number, number>} secondi al prossimo veicolo in coda, per stazione */
    this.spawnTimers = new Map();
    /** @type {Map<number, number>} secondi alla prossima partenza possibile, per stazione */
    this.departTimers = new Map();
    /** Secondi alla prossima stazione nuova. */
    this.growthTimer = level.growth ? level.growth.interval : Infinity;

    // Le stazioni iniziali ci sono già: niente animazione di comparsa.
    for (const def of level.stations) this.addStation(def, -Infinity);
    /** Versione del grafo su cui sono calcolati i percorsi dei veicoli in viaggio. */
    this.routedVersion = graph.version;
  }

  /**
   * @param {StationDef} def
   * @param {number} bornAt
   */
  addStation(def, bornAt) {
    const station = createStation(this.graph, def, this.stations.length + 1, bornAt);
    this.stations.push(station);
    this.spawnTimers.set(station.id, this.nextSpawnDelay());
    this.departTimers.set(station.id, 0);
  }

  /** Fa comparire una stazione nuova quando è il momento, se c'è posto. */
  grow() {
    const growth = this.level.growth;
    if (!growth || this.stations.length >= growth.max) return;
    const def = pickNewStation(this.random, this.level, this.stations);
    if (def) {
      this.addStation(def, this.elapsed);
      this.growthTimer = growth.interval;
    } else {
      this.growthTimer = GROWTH_RETRY;
    }
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

    this.growthTimer -= dt;
    if (this.growthTimer <= 0) this.grow();

    if (this.graph.version !== this.routedVersion) {
      for (const v of this.vehicles) this.reroute(v);
      this.routedVersion = this.graph.version;
    }

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
   * I veicoli che in questo momento stanno attraversando una stazione (né quella
   * di partenza né quella d'arrivo) e quindi sono nascosti sotto di essa.
   * @returns {Map<number, Shape[]>} per ogni id di stazione, le forme in transito
   */
  transitShapes() {
    /** @type {Map<number, Shape[]>} */
    const result = new Map();
    for (const v of this.vehicles) {
      const p = vehiclePose(this.graph, v);
      for (const s of this.stations) {
        if (distance(p, s) > STATION_RADIUS) continue;
        const isDestination = s.id === v.toStationId;
        const isLeavingOrigin = s.id === v.fromStationId && v.leg === 0 && v.path[0] === s.nodeId;
        if (isDestination || isLeavingOrigin) continue;
        if (!result.has(s.id)) result.set(s.id, []);
        /** @type {Shape[]} */ (result.get(s.id)).push(v.shape);
      }
    }
    return result;
  }

  /**
   * Aggiunge alla coda un veicolo di forma diversa da quella della stazione.
   * @param {Station} station
   */
  enqueue(station) {
    // Solo forme di stazioni già comparse, così ogni veicolo ha una destinazione.
    const present = new Set(this.stations.map((s) => s.shape));
    const options = [...present].filter((s) => s !== station.shape);
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
      const target = this.nearestStation(paths, shape);
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

  /**
   * Ricalcola il percorso di un veicolo in viaggio sulla rete attuale. Il veicolo
   * finisce il tratto in corso (niente inversioni a metà strada) e da lì prende
   * il percorso più rapido, anche verso un'altra stazione della sua forma.
   * @param {Vehicle} v
   */
  reroute(v) {
    const here = v.path[v.leg];
    let next = v.path[v.leg + 1];
    if (next === undefined) return;

    // Se il tratto in corso è stato spezzato da un nuovo incrocio, il prossimo
    // nodo è il primo incrocio davanti al veicolo: lì potrà già svoltare.
    if (!this.graph.hasEdge(here, next)) {
      const a = /** @type {RoadNode} */ (this.graph.nodes.get(here));
      const b = /** @type {RoadNode} */ (this.graph.nodes.get(next));
      const length = distance(a, b);
      let bestT = Infinity;
      for (const n of this.graph.nodes.values()) {
        if (n.id === here || n.id === next) continue;
        const c = closestPointOnSegment(n, a, b);
        if (distance(c, n) < 0.5 && c.t * length > v.along && c.t < bestT) {
          bestT = c.t;
          next = n.id;
        }
      }
    }

    const paths = shortestPaths(this.graph, next);
    const target = this.nearestStation(paths, v.shape);
    if (!target) return;
    v.path = [here, .../** @type {number[]} */ (pathTo(paths, target.nodeId))];
    v.leg = 0;
    v.toStationId = target.id;
  }

  /**
   * La stazione della forma data più vicina lungo le strade, oppure null.
   * @param {import('./pathfinding.js').ShortestPaths} paths
   * @param {Shape} shape
   * @returns {Station | null}
   */
  nearestStation(paths, shape) {
    let target = null;
    let best = Infinity;
    for (const s of this.stations) {
      if (s.shape !== shape) continue;
      const d = paths.dist.get(s.nodeId);
      if (d !== undefined && d < best) {
        best = d;
        target = s;
      }
    }
    return target;
  }

  nextSpawnDelay() {
    return SPAWN_MIN + this.random() * (SPAWN_MAX - SPAWN_MIN);
  }
}
