// Stato della partita e avanzamento nel tempo: veicoli che nascono in coda
// nelle stazioni, partenze, movimento, viaggi completati e punteggio.

import { createRandom } from './random.js';
import { shortestPaths, pathTo } from './pathfinding.js';
import { advanceVehicle, vehiclePose } from './vehicles.js';
import { closestPointOnSegment, distance } from './geometry.js';
import { STATION_RADIUS, createStation } from './stations.js';
import { pickNewStation } from './growth.js';
import { updateCongestion } from './congestion.js';
import { planRoad, buildPlannedRoad } from './roadBuilder.js';
import { findRoadPiece, removeRoadPiece, removeIsolatedNodes, edgeLength } from './roadEditing.js';
import { isInWater } from './water.js';
import { viewAt, segmentAt, insetRect, rectContains } from './view.js';
import { starGoals } from './stars.js';

/** @typedef {import('./roadEditing.js').RoadPiece} RoadPiece */
/** @typedef {import('./graph.js').RoadEdge} RoadEdge */
/** @typedef {import('./view.js').Rect} Rect */

/** Margini della vista (in frazioni) dove non nascono stazioni. */
const SPAWN_INSET = { left: 0.05, top: 0.04, right: 0.05, bottom: 0.04 };
/**
 * Distanza minima di una stazione da una zona riservata: tiene libera anche
 * la fila della coda, che si disegna sopra la stazione.
 */
const RESERVED_MARGIN = STATION_RADIUS + 40;
/** Una stazione fissa compare quando è dentro la vista almeno di tanto. */
const FIXED_STATION_MARGIN = STATION_RADIUS + 12;

/**
 * @param {RoadGraph} graph
 * @param {RoadEdge} e
 */
function edgeMidpoint(graph, e) {
  const a = /** @type {RoadNode} */ (graph.nodes.get(e.a));
  const b = /** @type {RoadNode} */ (graph.nodes.get(e.b));
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** @typedef {{x: number, y: number}} Point */
/** @typedef {import('./roadBuilder.js').RoadPlan} RoadPlan */

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./level.js').Level} Level */
/** @typedef {import('./level.js').StationDef} StationDef */
/** @typedef {import('./graph.js').RoadNode} RoadNode */
/** @typedef {import('./stations.js').Station} Station */
/** @typedef {import('./stations.js').Shape} Shape */
/** @typedef {import('./vehicles.js').Vehicle} Vehicle */

/** Intervallo fra due nuovi veicoli nella stessa stazione, in secondi. */
const SPAWN_MIN = 6;
const SPAWN_MAX = 8;
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
    /**
     * Zone della mappa coperte dall'interfaccia (pannello, pulsanti), in
     * coordinate di mondo: lì non nascono stazioni. Le aggiorna chi disegna.
     * @type {Rect[]}
     */
    this.reserved = [];
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
    /** @type {Station | null} la stazione rimasta sovraccarica troppo a lungo */
    this.failedStation = null;
    /** Tratti di strada ancora disponibili. */
    this.roadBudget = level.roads.initial;
    /** Ponti ancora disponibili. */
    this.bridgeBudget = level.bridges;
    this.nextBridgeId = 1;
    /** L'ultimo giorno per cui sono già stati dati i tratti in più. */
    this.rewardedDay = 1;
    /** Settimane concluse per cui il premio è già stato proposto. */
    this.rewardedWeeks = 0;
    /** true a fine settimana, finché il giocatore non ha scelto il premio. */
    this.rewardPending = false;

    /** Le stazioni fisse che la vista non ha ancora raggiunto. */
    this.hiddenStations = [...level.stations];
    // Quelle già visibili all'inizio ci sono già: niente animazione di comparsa.
    this.revealStations(-Infinity);
    /** Versione del grafo su cui sono calcolati i percorsi dei veicoli in viaggio. */
    this.routedVersion = graph.version;
    /** Tappa della vista da cui si sta partendo, per gli avvisi. */
    this.viewSegment = segmentAt(level.view, 1);
    /** @type {{text: string, at: number} | null} l'ultimo avviso "la città si allarga" */
    this.announcement = null;
    /** Stelle già guadagnate in questa partita. */
    this.starsEarned = [false, false, false];
    /** @type {{index: number, label: string} | null} l'ultima stella guadagnata */
    this.lastStar = null;
    this.starTimer = 0;
  }

  /**
   * A che punto sono gli obiettivi delle stelle (vuoto se il livello non ne ha).
   * @returns {import('./stars.js').StarGoal[]}
   */
  starGoals() {
    if (!this.level.stars) return [];
    return starGoals(this.level.stars, {
      trips: this.trips,
      daysSurvived: Math.floor(this.elapsed / this.level.dayLength + 1e-6),
      stations: this.stations,
      hiddenNamed: this.hiddenStations.filter((d) => d.name).length,
      graph: this.graph,
    });
  }

  /** Controlla se è stata raggiunta una stella nuova. Una stella presa resta presa. */
  updateStars() {
    this.starGoals().forEach((goal, i) => {
      if (!goal.reached || this.starsEarned[i]) return;
      this.starsEarned[i] = true;
      this.lastStar = { index: i, label: goal.label };
    });
  }

  /**
   * true se p è sotto (o troppo vicino a) una zona coperta dall'interfaccia.
   * @param {Point} p
   */
  isReserved(p) {
    return this.reserved.some((r) => rectContains({ x: r.x - RESERVED_MARGIN, y: r.y - RESERVED_MARGIN, width: r.width + 2 * RESERVED_MARGIN, height: r.height + 2 * RESERVED_MARGIN }, p));
  }

  /** La parte visibile della città in questo momento. */
  get view() {
    return viewAt(this.level.view, this.elapsed / this.level.dayLength + 1);
  }

  /**
   * Aggiunge le stazioni fisse entrate nella vista.
   * @param {number} bornAt
   */
  revealStations(bornAt) {
    const view = this.view;
    this.hiddenStations = this.hiddenStations.filter((def) => {
      if (!rectContains(view, def, FIXED_STATION_MARGIN) || this.isReserved(def)) return true;
      this.addStation(def, bornAt);
      return false;
    });
  }

  /**
   * @param {StationDef} def
   * @param {number} bornAt
   */
  addStation(def, bornAt) {
    const station = createStation(this.graph, def, this.stations.length + 1, bornAt, this.level.congestion.capacity);
    this.stations.push(station);
    this.spawnTimers.set(station.id, this.nextSpawnDelay());
    this.departTimers.set(station.id, 0);
  }

  /** Fa comparire una stazione nuova quando è il momento, se c'è posto. */
  grow() {
    const growth = this.level.growth;
    if (!growth || this.stations.length >= growth.max) return;
    const i = SPAWN_INSET;
    const area = insetRect(this.view, i.left, i.top, i.right, i.bottom);
    const def = pickNewStation(this.random, this.level, this.stations, area, this.graph, (p) => !this.isReserved(p));
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

  /** Giorno in corso, a partire da 1. */
  get day() {
    return Math.floor(this.elapsed / this.level.dayLength + 1e-6) + 1;
  }

  /** Quanto del giorno in corso è passato, da 0 a 1. */
  get dayProgress() {
    return (this.elapsed / this.level.dayLength) % 1;
  }

  /**
   * Cosa costerebbe costruire il tratto disegnato, già troncato ai tratti disponibili.
   * @param {Point[]} points
   * @returns {RoadPlan}
   */
  planRoad(points) {
    return planRoad(this.graph, points, {
      maxLength: this.roadBudget * this.level.roads.segmentLength,
      bridges: this.bridgeBudget,
      waters: this.level.waters,
      bounds: this.view,
    });
  }

  /**
   * Tratti di strada che un piano consuma (ogni pezzo iniziato conta intero).
   * @param {RoadPlan} plan
   */
  roadCost(plan) {
    return Math.ceil(plan.length / this.level.roads.segmentLength - 1e-6);
  }

  /**
   * Costruisce il tratto disegnato, fin dove bastano i tratti disponibili.
   * @param {Point[]} points
   * @param {number} snapRadius
   */
  buildRoad(points, snapRadius) {
    const plan = this.planRoad(points);
    if (plan.runs.length === 0) return;
    const before = new Set(this.graph.edges.keys());
    buildPlannedRoad(this.graph, plan, snapRadius);
    const cost = this.roadCost(plan);
    this.roadBudget -= cost;
    this.bridgeBudget -= plan.bridges;

    // Ogni arco nuovo ricorda la sua parte del costo, così rimuoverlo
    // restituisce esattamente quanto era stato pagato.
    const added = [...this.graph.edges.values()].filter((e) => !before.has(e.id) && !e.cost);
    const lengths = added.map((e) => edgeLength(this.graph, e.id));
    const total = lengths.reduce((a, b) => a + b, 0);
    if (total > 0) added.forEach((e, i) => (e.cost = (cost * lengths[i]) / total));

    // Gli archi nuovi in acqua sono ponti: ogni gruppo di archi collegati è un ponte.
    const wet = added.filter((e) => isInWater(this.level.waters, edgeMidpoint(this.graph, e)));
    for (const e of wet) {
      if (e.bridgeId !== undefined) continue;
      const id = this.nextBridgeId++;
      const stack = [e];
      while (stack.length) {
        const cur = /** @type {RoadEdge} */ (stack.pop());
        if (cur.bridgeId !== undefined) continue;
        cur.bridgeId = id;
        for (const o of wet) {
          if (o.bridgeId === undefined && (o.a === cur.a || o.a === cur.b || o.b === cur.a || o.b === cur.b)) stack.push(o);
        }
      }
    }
  }

  /** true quando il livello è fallito: da lì la simulazione è ferma. */
  get failed() {
    return this.failedStation !== null;
  }

  /** true se il tempo scorre: né livello fallito né premio in attesa di scelta. */
  get running() {
    return !this.failed && !this.rewardPending;
  }

  /** Premio di fine settimana: ponti in più. */
  chooseBridgesReward() {
    if (!this.rewardPending) return;
    this.bridgeBudget += this.level.rewards.bridges;
    this.rewardPending = false;
  }

  /** Premio di fine settimana: tratti di strada in più. */
  chooseRoadsReward() {
    if (!this.rewardPending) return;
    this.roadBudget += this.level.rewards.roads;
    this.rewardPending = false;
  }

  /**
   * Premio di fine settimana: una stazione regge più veicoli in coda.
   * @param {number} stationId
   */
  chooseUpgradeReward(stationId) {
    const station = this.stations.find((s) => s.id === stationId);
    if (!this.rewardPending || !station) return;
    station.capacity += this.level.rewards.capacity;
    station.upgrades++;
    this.rewardPending = false;
  }

  /** @param {number} dt  secondi */
  step(dt) {
    if (!this.running) return;
    this.elapsed += dt;

    const day = this.day;
    if (day > this.rewardedDay) {
      this.roadBudget += (day - this.rewardedDay) * this.level.roads.perDay;
      this.rewardedDay = day;
    }
    // Alla fine di ogni settimana (7 giorni) il gioco si ferma per il premio.
    const weeks = Math.floor((day - 1) / 7);
    if (weeks > this.rewardedWeeks) {
      this.rewardedWeeks = weeks;
      this.rewardPending = true;
      return;
    }

    // La vista si allarga: avviso quando si parte verso una nuova zona,
    // e le stazioni fisse raggiunte compaiono.
    const segment = segmentAt(this.level.view, this.elapsed / this.level.dayLength + 1);
    if (segment !== this.viewSegment) {
      this.viewSegment = segment;
      const next = this.level.view[segment + 1];
      if (next?.name) this.announcement = { text: `La città si allarga: ${next.name}`, at: this.elapsed };
    }
    this.revealStations(this.elapsed);

    this.growthTimer -= dt;
    if (this.growthTimer <= 0) this.grow();

    if (this.graph.version !== this.routedVersion) this.updateRoutes();

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

    this.failedStation = updateCongestion(this.stations, dt, this.level.congestion.tolerance);

    // Le reti si controllano una volta al secondo: basta e costa poco.
    this.starTimer -= dt;
    if (this.starTimer <= 0) {
      this.starTimer = 1;
      this.updateStars();
    }
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
   * @returns {boolean} false se il veicolo non può più proseguire: la sua strada
   *   è stata rimossa o non porta più a nessuna stazione della sua forma
   */
  reroute(v) {
    const here = v.path[v.leg];
    let next = v.path[v.leg + 1];
    if (next === undefined) return true;

    if (!this.graph.hasEdge(here, next)) {
      const a = /** @type {RoadNode} */ (this.graph.nodes.get(here));
      const b = /** @type {RoadNode} */ (this.graph.nodes.get(next));
      const length = distance(a, b);
      let found = false;
      // Il tratto in corso è stato spezzato da un nuovo incrocio: il prossimo
      // nodo è il primo incrocio davanti al veicolo, dove potrà già svoltare.
      let bestT = Infinity;
      for (const n of this.graph.nodes.values()) {
        if (n.id === here || n.id === next) continue;
        const c = closestPointOnSegment(n, a, b);
        if (distance(c, n) < 0.5 && c.t * length > v.along && c.t < bestT) {
          bestT = c.t;
          next = n.id;
          found = true;
        }
      }
      // Oppure il tratto è stato deviato dentro una stazione comparsa sopra.
      if (!found) {
        for (const n of this.graph.nodes.values()) {
          if (n.stationId !== undefined && this.graph.hasEdge(here, n.id) && this.graph.hasEdge(n.id, next)) {
            next = n.id;
            found = true;
            break;
          }
        }
      }
      // Altrimenti la strada sotto il veicolo è stata rimossa.
      if (!found) return false;
    }

    const paths = shortestPaths(this.graph, next);
    const target = this.nearestStation(paths, v.shape);
    if (!target) return false;
    v.path = [here, .../** @type {number[]} */ (pathTo(paths, target.nodeId))];
    v.leg = 0;
    v.toStationId = target.id;
    return true;
  }

  /**
   * Ricalcola i percorsi di tutti i veicoli in viaggio. Chi non può più
   * proseguire torna in testa alla coda della sua stazione d'origine.
   */
  updateRoutes() {
    this.vehicles = this.vehicles.filter((v) => {
      if (this.reroute(v)) return true;
      const origin = this.stations.find((s) => s.id === v.fromStationId);
      origin?.queue.unshift(v.shape);
      return false;
    });
    this.routedVersion = this.graph.version;
  }

  /**
   * Il pezzo di strada sotto il punto (x, y), se c'è.
   * @param {number} x
   * @param {number} y
   * @param {number} [radius]
   * @returns {RoadPiece | null}
   */
  findRoadPiece(x, y, radius) {
    return findRoadPiece(this.graph, x, y, radius);
  }

  /**
   * Tratti restituiti rimuovendo un pezzo di strada: quanto era stato pagato
   * per i suoi archi, arrotondato per difetto.
   * @param {RoadPiece} piece
   */
  refundOf(piece) {
    return Math.floor(piece.cost + 1e-6);
  }

  /**
   * Rimuove un pezzo di strada e restituisce i suoi tratti.
   * @param {RoadPiece} piece
   */
  removeRoad(piece) {
    this.bridgeBudget += piece.bridges;
    const touched = removeRoadPiece(this.graph, piece);
    this.roadBudget += this.refundOf(piece);
    // Subito, e non al prossimo passo: anche in pausa nessun veicolo deve
    // restare su nodi che stanno per sparire.
    this.updateRoutes();
    removeIsolatedNodes(this.graph, touched);
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
