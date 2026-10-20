// Stato della partita e avanzamento nel tempo: veicoli che nascono in coda
// nelle stazioni, partenze, movimento, viaggi completati e punteggio.

import { createRandom } from './random.js';
import { shortestPaths, pathTo } from './pathfinding.js';
import { pointOnVehicle, randomVehicleType } from './vehicles.js';
import { LaneGeometry, projectOnLane } from './lanes.js';
import { Traffic } from './traffic.js';
import { closestPointOnSegment, distance } from './geometry.js';
import { STATION_RADIUS, createStation } from './stations.js';
import { pickNewStation } from './growth.js';
import { updateCongestion } from './congestion.js';
import { planRoad, buildPlannedRoad } from './roadBuilder.js';
import { findRoadPiece, removeRoadPiece, removeIsolatedNodes, edgeLength, orderedChain, pieceType, setPieceType } from './roadEditing.js';
import { isInWater } from './water.js';
import { viewAt, segmentAt, insetRect, rectContains } from './view.js';
import { starGoals } from './stars.js';
import { buildOverpass, overpassPairs, removeOverpass } from './overpass.js';

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

/** Una stazione fa partire al massimo un veicolo ogni tanti secondi. */
const DEPART_INTERVAL = 1;
/** Se non c'è posto per una stazione nuova, si riprova dopo tanti secondi. */
const GROWTH_RETRY = 1;
/**
 * Ritardo stimato per ogni incrocio attraversato, in unità di strada: i veicoli
 * preferiscono i percorsi con meno incroci a parità di lunghezza.
 */
const JUNCTION_COST = 25;

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
    this.lanes = new LaneGeometry(graph);
    this.traffic = new Traffic(this.lanes);
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
    /** Cavalcavia ancora disponibili. */
    this.overpassBudget = level.overpasses;
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
      hiddenNamed: this.hiddenStations.filter((d) => d.landmark).length,
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

  /** Premio di fine settimana: cavalcavia in più. */
  chooseOverpassReward() {
    if (!this.rewardPending) return;
    this.overpassBudget += this.level.rewards.overpasses;
    this.rewardPending = false;
  }

  /**
   * Tocco breve sulla mappa: su un incrocio ne cambia il tipo, su una strada ne
   * cambia il senso di marcia o la fa diventare superstrada.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {string | null}  cosa è successo (per l'avviso), null se niente
   */
  tap(x, y, radius) {
    const junction = this.toggleOverpass(x, y, radius);
    if (junction) return junction;
    const piece = this.findRoadPiece(x, y, radius);
    return piece ? this.cycleRoadType(piece) : null;
  }

  /**
   * Doppio senso → senso unico → senso unico al contrario → superstrada → doppio senso.
   * La superstrada costa altrettanti tratti quanti ne è lunga, restituiti quando torna normale.
   * @param {RoadPiece} piece
   * @returns {string}
   */
  cycleRoadType(piece) {
    /** @type {import('./roadEditing.js').RoadType[]} */
    const order = ['two', 'forward', 'backward', 'super'];
    const current = pieceType(this.graph, piece);
    let next = order[(order.indexOf(current) + 1) % order.length];
    const chain = orderedChain(this.graph, piece);

    if (current === 'super') {
      let paid = 0;
      for (const { edge } of chain) {
        paid += edge.superPaid ?? 0;
        delete edge.superPaid;
      }
      this.roadBudget += Math.floor(paid + 1e-6);
    }
    let result = next;
    if (next === 'super') {
      const extra = Math.ceil(piece.length / this.level.roads.segmentLength - 1e-6);
      if (this.roadBudget < extra) {
        next = 'two';
        result = 'super-too-expensive';
      } else {
        this.roadBudget -= extra;
        for (const { edge } of chain) edge.superPaid = (extra * edgeLength(this.graph, edge.id)) / (piece.length || 1);
      }
    }
    setPieceType(this.graph, piece, next);
    this.updateRoutes();
    return result;
  }

  /**
   * Tocco su un incrocio: lo trasforma in cavalcavia, o un cavalcavia torna
   * incrocio (e il cavalcavia si riprende).
   * @param {number} x
   * @param {number} y
   * @param {number} radius  quanto lontano dal centro dell'incrocio si può toccare
   * @returns {'built' | 'removed' | 'none-left' | 'not-a-cross' | null}
   *   null se il tocco non era su un incrocio
   */
  toggleOverpass(x, y, radius) {
    let best = null;
    let bestD = radius;
    for (const n of this.graph.nodes.values()) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d > bestD || n.stationId !== undefined) continue;
      const degree = [...this.graph.edges.values()].filter((e) => e.a === n.id || e.b === n.id).length;
      if (!n.overpass && degree < 3) continue;
      best = n;
      bestD = d;
    }
    if (!best) return null;
    // A giro: incrocio → semaforo → cavalcavia (solo sulle croci) → incrocio.
    if (best.overpass) {
      removeOverpass(this.graph, best);
      this.overpassBudget++;
      this.updateRoutes();
      return 'removed';
    }
    if (!best.signal) {
      best.signal = true;
      this.graph.version++;
      return 'signal';
    }
    delete best.signal;
    this.graph.version++;
    if (!overpassPairs(this.graph, best)) return 'normal';
    if (this.overpassBudget <= 0) return 'normal-no-overpass';
    buildOverpass(this.graph, best);
    this.overpassBudget--;
    this.updateRoutes();
    return 'built';
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

    const arrived = new Set(this.traffic.step(this.vehicles, dt));
    if (arrived.size > 0) {
      this.trips += arrived.size;
      this.vehicles = this.vehicles.filter((v) => !arrived.has(v));
    }

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
      const p = v.pose;
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
   * della sua forma, verso quella più vicina lungo le strade. Parte solo se
   * all'uscita della stazione c'è posto: altrimenti resta in coda.
   * @param {Station} origin
   * @returns {boolean} true se un veicolo è partito
   */
  depart(origin) {
    const paths = this.paths(origin.nodeId);
    for (let i = 0; i < origin.queue.length; i++) {
      const shape = origin.queue[i];
      const target = this.nearestStation(paths, shape);
      if (!target) continue;
      /** @type {Vehicle} */
      const v = {
        id: this.nextVehicleId,
        shape,
        type: randomVehicleType(this.random),
        fromStationId: origin.id,
        toStationId: target.id,
        path: /** @type {number[]} */ (pathTo(paths, target.nodeId)),
        leg: 0,
        phase: 'lane',
        s: 0,
        speed: 0,
        pose: { x: origin.x, y: origin.y, dx: 1, dy: 0 },
      };
      if (!this.traffic.roomToDepart(v)) return false;
      v.pose = pointOnVehicle(this.lanes, v);
      this.nextVehicleId++;
      origin.queue.splice(i, 1);
      this.vehicles.push(v);
      return true;
    }
    return false;
  }

  /**
   * Percorsi più rapidi da un nodo: la lunghezza delle strade più un piccolo
   * ritardo per ogni incrocio attraversato. Le stazioni non si attraversano:
   * ci si entra solo per arrivare.
   * @param {number} from
   */
  paths(from) {
    return shortestPaths(
      this.graph,
      from,
      (id) => (this.lanes.isJunction(id) ? JUNCTION_COST : 0),
      (id) => this.graph.nodes.get(id)?.stationId !== undefined,
    );
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
    // In curva: il veicolo finisce la curva e riparte dalla corsia d'uscita.
    if (v.phase === 'turn') {
      const [a, b, c] = v.path.slice(v.leg, v.leg + 3);
      if (!this.graph.hasEdge(a, b) || !this.graph.hasEdge(b, c)) return false;
      const ending = this.endsAtStation(v, c);
      if (ending !== null) {
        if (!ending) return false;
        v.path = [a, b, c];
        v.leg = 0;
        return true;
      }
      const paths = this.paths(c);
      const target = this.nearestStation(paths, v.shape);
      if (!target) return false;
      v.path = [a, b, .../** @type {number[]} */ (pathTo(paths, target.nodeId))];
      v.leg = 0;
      v.toStationId = target.id;
      v.s = Math.min(v.s, this.lanes.turn(a, b, c).length);
      return true;
    }

    const here = v.path[v.leg];
    let next = v.path[v.leg + 1];
    if (!this.graph.nodes.has(here) || !this.graph.nodes.has(next)) return false;

    if (!this.graph.hasEdge(here, next)) {
      const a = /** @type {RoadNode} */ (this.graph.nodes.get(here));
      const b = /** @type {RoadNode} */ (this.graph.nodes.get(next));
      const length = distance(a, b);
      // Quanto il veicolo ha già percorso del tratto, misurato sul centro strada.
      const along = closestPointOnSegment(v.pose, a, b).t * length;
      let found = false;
      // Il tratto in corso è stato spezzato da un nuovo incrocio: il prossimo
      // nodo è il primo incrocio davanti al veicolo, dove potrà già svoltare.
      let bestT = Infinity;
      for (const n of this.graph.nodes.values()) {
        if (n.id === here || n.id === next) continue;
        const c = closestPointOnSegment(n, a, b);
        if (distance(c, n) < 0.5 && c.t * length > along && c.t < bestT) {
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

    const ending = this.endsAtStation(v, next);
    if (ending !== null) {
      if (!ending) return false;
      v.path = [here, next];
      v.leg = 0;
      v.s = projectOnLane(this.lanes.lane(here, next), v.pose);
      return true;
    }
    const paths = this.paths(next);
    const target = this.nearestStation(paths, v.shape);
    if (!target) return false;
    v.path = [here, .../** @type {number[]} */ (pathTo(paths, target.nodeId))];
    v.leg = 0;
    v.toStationId = target.id;
    // Le corsie possono essersi accorciate o spostate: si riparte dal punto più vicino.
    v.s = projectOnLane(this.lanes.lane(here, next), v.pose);
    return true;
  }

  /**
   * Se il nodo davanti al veicolo è una stazione, il viaggio finisce lì per forza:
   * true se è una stazione della sua forma (ci arriva), false se no (non può
   * attraversarla), null se il nodo non è una stazione.
   * @param {Vehicle} v
   * @param {number} nodeId
   * @returns {boolean | null}
   */
  endsAtStation(v, nodeId) {
    const stationId = this.graph.nodes.get(nodeId)?.stationId;
    if (stationId === undefined) return null;
    const station = this.stations.find((s) => s.id === stationId);
    if (!station || station.shape !== v.shape) return false;
    v.toStationId = station.id;
    return true;
  }

  /**
   * Ricalcola i percorsi di tutti i veicoli in viaggio. Chi non può più
   * proseguire torna in testa alla coda della sua stazione d'origine.
   */
  updateRoutes() {
    this.vehicles = this.vehicles.filter((v) => {
      if (this.reroute(v)) return true;
      this.traffic.forget(v);
      const origin = this.stations.find((s) => s.id === v.fromStationId);
      origin?.queue.unshift(v.shape);
      return false;
    });
    this.traffic.reset(this.vehicles);
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
    // Se una delle due strade di un cavalcavia sparisce, il cavalcavia non
    // serve più: torna nodo normale e si riprende.
    for (const id of touched) {
      const n = this.graph.nodes.get(id);
      if (!n?.overpass) continue;
      const partner = this.graph.nodes.get(n.overpass.partner);
      const alive = (/** @type {number} */ nid) => [...this.graph.edges.values()].some((e) => e.a === nid || e.b === nid);
      if (alive(n.id) && partner && alive(partner.id)) continue;
      removeOverpass(this.graph, n);
      this.overpassBudget++;
    }
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
    const { min, max } = this.level.spawn;
    return min + this.random() * (max - min);
  }
}
