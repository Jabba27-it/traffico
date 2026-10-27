// Stato della partita e avanzamento nel tempo: veicoli che nascono in coda
// nelle stazioni, partenze, movimento, viaggi completati e punteggio.

import { createRandom } from './random.js';
import { shortestPaths, pathTo } from './pathfinding.js';
import { pointOnVehicle, randomVehicleType, VEHICLE_TYPES } from './vehicles.js';
import { LaneGeometry, projectOnLane } from './lanes.js';
import { Traffic, SLOW } from './traffic.js';
import { closestPointOnSegment, distance } from './geometry.js';
import { STATION_RADIUS, createStation } from './stations.js';
import { pickNewStation, clearOfRoads, STATION_CLEARANCE } from './growth.js';
import { updateCongestion } from './congestion.js';
import { planRoad, buildPlannedRoad } from './roadBuilder.js';
import { findRoadPiece, removeRoadPiece, removeIsolatedNodes, edgeLength, pieceType, setPieceType } from './roadEditing.js';
import { isInWater, lengthInWater, landOf, landsOf } from './water.js';
import { viewAt, insetRect, rectContains } from './view.js';
import { starGoals, platinumGoal } from './stars.js';
import { buildOverpass, overpassPairs, removeOverpass } from './overpass.js';
import { drawnCircle, buildRoundabout, removeRoundabout, ringCost, ringPoints, clipAtRings } from './roundabout.js';
import { obstacleAt } from './terrain.js';
import { SPECIAL_CAPACITY, SPAWN_FACTOR, HEAVY_MIX, MATCH, SPECIAL_DEPART_INTERVAL, SPECIAL_SPACE, matchState } from './specials.js';

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
 * true se una parte qualsiasi dell'arco passa sull'acqua. Non basta guardare
 * il punto di mezzo: un arco lungo (un dito veloce lascia punti radi) può
 * attraversare un fiume stretto vicino a un suo estremo.
 * @param {RoadGraph} graph
 * @param {import('./water.js').Water[]} waters
 * @param {RoadEdge} e
 */
function edgeOverWater(graph, waters, e) {
  const a = /** @type {RoadNode} */ (graph.nodes.get(e.a));
  const b = /** @type {RoadNode} */ (graph.nodes.get(e.b));
  return lengthInWater(waters, [a, b]) > 0;
}

/** @typedef {{x: number, y: number}} Point */

/** Un veicolo fermo in strada da così tanti secondi fa scattare l'allarme ingorgo. */
export const JAM_ALERT = 15;
/** Fermo da così tanti secondi: l'ingorgo fa perdere la partita. */
export const JAM_LOSS = 30;
/** Sotto questa velocità un veicolo conta come fermo. */
const JAM_SPEED = 0.5;
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
 * Secondi di gioco in cui una stazione nuova si vede in anteprima prima di
 * nascere: il suo posto è riservato e lì non si costruisce.
 */
export const STATION_PREVIEW = 5;
/**
 * Ritardo stimato per ogni incrocio attraversato, in unità di strada: i veicoli
 * preferiscono i percorsi con meno incroci a parità di lunghezza.
 */
const JUNCTION_COST = 25;
/** Secondi su cui si ammorbidisce il traffico lento "attuale" della terza stella. */
const RECENT_TRAFFIC = 5;
/** Spazio minimo fra l'anello di una rotonda nuova e un'altra rotonda o un cavalcavia. */
const ROUNDABOUT_GAP = 12;
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
    /** Il seme della partita: da lui vengono anche i dadi delle stazioni nuove. */
    this.seed = seed;
    /** Stazioni nate a caso finora e tentativi falliti per la prossima (per i loro dadi). */
    this.growthDraws = { born: 0, tries: 0 };
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
    this.lanes = new LaneGeometry(graph, level.terrain);
    this.traffic = new Traffic(this.lanes);
    /** Secondi di gioco trascorsi. */
    this.elapsed = 0;
    /** Veicoli arrivati a destinazione. */
    this.trips = 0;
    /** @type {Map<number, number>} viaggi completati da ogni stazione di partenza */
    this.tripsFrom = new Map();
    /**
     * Quante volte il giocatore ha fatto ciascuna azione: serve al tutorial per
     * capire quando un esercizio è stato fatto.
     */
    this.events = { removed: 0, roadType: 0, junction: 0, roundabout: 0, undo: 0, bridge: 0, reward: 0 };
    /**
     * Nel tutorial non si perde: quando si perderebbe, qui c'è il motivo
     * ('station' o 'jam') e il tutorial lo mostra e rimette a posto lo scenario.
     * @type {'station' | 'jam' | null}
     */
    this.wouldLose = null;
    /**
     * Per la terza stella: secondi-veicolo passati in strada, e quanti di questi
     * andando lenti (sotto la stessa soglia che vela di rosso le strade).
     */
    this.roadTime = 0;
    this.slowTime = 0;
    /** Traffico lento "attuale": quota di veicoli lenti, ammorbidita sugli ultimi secondi (0..1). */
    this.recentSlow = 0;
    /** Secondi di gioco di fila col traffico attuale sotto la soglia della terza stella. */
    this.trafficStreak = 0;
    /** @type {Map<number, number>} secondi al prossimo veicolo in coda, per stazione */
    this.spawnTimers = new Map();
    /** @type {Map<number, number>} secondi alla prossima partenza possibile, per stazione */
    this.departTimers = new Map();
    /** Secondi alla prossima stazione nuova. */
    this.growthTimer = level.growth ? this.nextGrowthDelay(this.growthRandom()) : Infinity;
    /**
     * Le stazioni che stanno per nascere, in anteprima: dove, di che forma e quando.
     * Al più una nata a caso, più le speciali (stadi, porti, aeroporti) arrivate al loro giorno.
     * @type {{def: StationDef, at: number}[]}
     */
    this.upcoming = [];
    /** @type {Station | null} la stazione rimasta sovraccarica troppo a lungo */
    this.failedStation = null;
    /** Dove un ingorgo ha fatto perdere la partita (null se non è successo). */
    this.failedJam = null;
    /** Tratti di strada ancora disponibili. */
    this.roadBudget = level.roads.initial;
    /**
     * Frazione di tratto già restituita ma non ancora intera: togliendo pezzi
     * piccoli (es. archi di una rotonda) i decimali si sommano invece di perdersi.
     */
    this.roadCredit = 0;
    /**
     * Ponti ancora disponibili. Si parte senza (salvo i ponti in più del livello):
     * ogni stazione che nasce su una terra nuova ne porta uno, il minimo per
     * raggiungerla; gli altri, per non passare tutti dallo stesso, sono premi.
     */
    this.bridgeBudget = level.bridges;
    /** Le terre (rive e isole) su cui c'è già almeno una stazione. */
    this.landsWithStations = new Set();
    /** Cavalcavia ancora disponibili. */
    this.overpassBudget = level.overpasses;
    /** @type {Map<number, import('./roundabout.js').Roundabout>} */
    this.roundabouts = new Map();
    this.nextRoundaboutId = 1;
    this.nextBridgeId = 1;
    /** L'ultima mossa del giocatore, per poterla annullare (una sola). */
    this.lastMove = null;
    /** L'ultimo giorno per cui sono già stati dati i tratti in più. */
    this.rewardedDay = 1;
    /** Settimane concluse per cui il premio è già stato proposto. */
    this.rewardedWeeks = 0;
    /** true a fine settimana, finché il giocatore non ha scelto il premio. */
    this.rewardPending = false;

    /**
     * Rompicapo: quanti veicoli di ogni riga del programma sono già partiti, com'è
     * finita la prova (null mentre è in corso), dove si è bloccato, quante mosse
     * fatte e quanti tratti c'erano all'inizio del progetto.
     * @type {{spawned: number[], result: 'risolto' | 'tempo' | 'ingorgo' | null, failPoint: Point | null, finishedAt: number, moves: number, roadsAtStart: number} | null}
     */
    this.puzzle = level.puzzle
      ? { spawned: level.puzzle.program.map(() => 0), result: null, failPoint: null, finishedAt: 0, moves: 0, roadsAtStart: level.roads.initial }
      : null;

    /** Le stazioni fisse che la vista non ha ancora raggiunto. */
    this.hiddenStations = [...level.stations];
    // Quelle già visibili all'inizio ci sono già: niente animazione di comparsa.
    this.revealStations(-Infinity);
    /** Versione del grafo su cui sono calcolati i percorsi dei veicoli in viaggio. */
    this.routedVersion = graph.version;
    /** Stelle guadagnate in questa partita. */
    this.starsEarned = [false, false, false];
    this.starsAnnounced = [false, false, false];
    /** true quando sono state prese tutte le stelle: la partita è vinta e finisce. */
    this.completed = false;
    /** Stella di platino: si prende resistendo qualche giorno dopo le tre stelle. */
    this.platinum = false;
    /** Secondo di gioco in cui sono arrivate tutte e tre le stelle (null se non ancora). */
    this.threeStarsAt = null;
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
    // Una stella presa resta presa: anche negli obiettivi risulta fatta.
    return starGoals(this.level.stars, this.starState()).map((g, i) => (this.starsEarned[i] ? { ...g, reached: true } : g));
  }

  /**
   * A che punto è la stella di platino (null se il livello non ce l'ha).
   * @returns {import('./stars.js').StarGoal | null}
   */
  platinumGoal() {
    const days = this.level.stars?.platinum;
    return days == null ? null : platinumGoal(days, this.starState());
  }

  /** @returns {import('./stars.js').StarState} */
  starState() {
    return {
      trips: this.trips,
      daysSurvived: Math.floor(this.elapsed / this.level.dayLength + 1e-6),
      stations: this.stations.length,
      lastGenerated: this.stations[this.stations.length - 1]?.generated ?? 0,
      trafficNow: Math.round(this.recentSlow * 100),
      trafficStreak: this.trafficStreak,
      daysAfterThree: this.threeStarsAt == null ? null : Math.floor((this.elapsed - this.threeStarsAt) / this.level.dayLength + 1e-6),
    };
  }

  /**
   * Aggiorna le stelle. Quelle "durature" (oggi tutte) restano prese; le altre
   * valgono solo finché l'obiettivo resta raggiunto.
   */
  updateStars() {
    const goals = this.starGoals();
    goals.forEach((goal, i) => {
      const was = this.starsEarned[i];
      this.starsEarned[i] = goal.lasting ? was || goal.reached : goal.reached;
      // L'avviso solo la prima volta, anche se la stella va e viene.
      if (this.starsEarned[i] && !was && !this.starsAnnounced[i]) {
        this.starsAnnounced[i] = true;
        this.lastStar = { index: i, label: goal.label };
      }
    });
    // Tutte e tre le stelle: se il livello ha il platino si continua a giocare
    // finché passano i giorni della Maratona (o finché non si perde); senza
    // platino il livello è completato e la partita finisce.
    if (goals.length > 0 && goals.every((_, i) => this.starsEarned[i])) {
      if (this.threeStarsAt == null) this.threeStarsAt = this.elapsed;
      const platinum = this.platinumGoal();
      if (!platinum) this.completed = true;
      else if (platinum.reached) {
        this.platinum = true;
        this.completed = true;
      }
    }
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
    const day = this.elapsed / this.level.dayLength + 1;
    this.hiddenStations = this.hiddenStations.filter((def) => {
      if (!rectContains(view, def, FIXED_STATION_MARGIN) || this.isReserved(def)) return true;
      if (def.day !== undefined && day < def.day) return true;
      // Stadi, porti e aeroporti si annunciano con l'anteprima, come le stazioni nate a caso.
      if (def.kind && bornAt !== -Infinity) this.upcoming.push({ def, at: this.elapsed + STATION_PREVIEW });
      else this.addStation(def, bornAt);
      return false;
    });
  }

  /**
   * @param {StationDef} def
   * @param {number} bornAt
   */
  addStation(def, bornAt) {
    const capacity = this.level.congestion.capacity * (def.kind ? SPECIAL_CAPACITY : 1);
    const station = createStation(this.graph, def, this.stations.length + 1, bornAt, capacity);
    this.stations.push(station);
    // Prima stazione su una terra nuova: arriva il ponte per collegarla.
    const land = landOf(landsOf(this.level), station);
    if (land >= 0 && !this.landsWithStations.has(land)) {
      if (this.landsWithStations.size > 0 && !this.puzzle) {
        this.bridgeBudget++;
        station.bridgeGift = true;
      }
      this.landsWithStations.add(land);
    }
    this.spawnTimers.set(station.id, this.nextSpawnDelay(station));
    this.departTimers.set(station.id, 0);
  }

  /**
   * Finita l'anteprima, la stazione nasce. Se intanto il posto si è occupato
   * (una strada tornata con l'annulla) si rinuncia e se ne sceglie un'altra.
   */
  hatchUpcoming() {
    for (const up of this.upcoming.filter((u) => this.elapsed >= u.at)) {
      this.upcoming.splice(this.upcoming.indexOf(up), 1);
      // Le speciali nascono comunque al loro posto: le strade che ci passano entrano nella stazione.
      if (up.def.kind || clearOfRoads(up.def, this.graph, this.roundabouts.values())) this.addStation(up.def, this.elapsed);
      else this.growthTimer = GROWTH_RETRY;
    }
  }

  /** Fa comparire una stazione nuova quando è il momento, se c'è posto. */
  grow() {
    const growth = this.level.growth;
    if (!growth || this.upcoming.some((u) => !u.def.kind) || this.stations.length + this.upcoming.length >= growth.max) return;
    const i = SPAWN_INSET;
    const area = insetRect(this.view, i.left, i.top, i.right, i.bottom);
    const random = this.growthRandom();
    // Lontano anche dai luoghi fissi che devono ancora comparire (stadi, porti e
    // aeroporti compresi) e da quelli in anteprima; dalle speciali ancora di più.
    const places = [...this.stations.filter((s) => s.kind), ...this.hiddenStations, ...this.upcoming.map((u) => u.def)];
    const roomy = (/** @type {Point} */ p) => places.every((d) => distance(d, p) >= growth.minDistance * (d.kind ? SPECIAL_SPACE : 1));
    const def = pickNewStation(random, this.level, this.stations, area, this.graph, (p) => !this.isReserved(p) && roomy(p), this.roundabouts.values());
    if (def) {
      // Prima si vede in anteprima, poi nasce (vedi hatchUpcoming).
      this.upcoming.push({ def, at: this.elapsed + STATION_PREVIEW });
      this.growthTimer = this.nextGrowthDelay(random);
      this.growthDraws = { born: this.growthDraws.born + 1, tries: 0 };
    } else {
      this.growthTimer = GROWTH_RETRY;
      this.growthDraws.tries++;
    }
  }

  /**
   * Conta il viaggio per la stazione da cui è partito.
   * @param {Vehicle} v
   */
  recordTrip(v) {
    this.tripsFrom.set(v.fromStationId, (this.tripsFrom.get(v.fromStationId) ?? 0) + 1);
  }

  /**
   * Traffico lento medio in percentuale: quota del tempo passato in strada dai
   * veicoli andando sotto il 30% della loro velocità massima. null finché
   * nessuno è partito.
   */
  /**
   * true quando la terza stella si misura: tutte le stazioni ci sono e l'ultima
   * nata ha già generato abbastanza veicoli.
   */
  get trafficMeasured() {
    const goal = this.level.stars?.traffic;
    const last = this.stations[this.stations.length - 1];
    return Boolean(goal && last && this.stations.length >= goal.stations && last.generated >= goal.after);
  }

  get slowTraffic() {
    return this.roadTime > 0 ? Math.round((100 * this.slowTime) / this.roadTime) : null;
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
      terrain: this.level.terrain,
      upcoming: this.upcoming.map((u) => u.def),
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
   * Se il tratto è un cerchio intorno a un incrocio, ne fa una rotatoria.
   * @param {Point[]} points
   * @param {number} snapRadius
   * @returns {string | null}  esito da mostrare, se ce n'è uno: per un tratto
   *   fermato prima della fine "cut-" più il motivo (es. "cut-long").
   * È una mossa: si può annullare.
   */
  buildRoad(points, snapRadius) {
    return this.asMove(() => this._buildRoad(points, snapRadius));
  }

  /**
   * Toglie un pezzo di strada. È una mossa: si può annullare.
   * @param {RoadPiece} piece
   */
  removeRoad(piece) {
    return this.asMove(() => this._removeRoad(piece));
  }

  /**
   * Tocco breve su strade, incroci e rotonde. È una mossa: si può annullare.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {string | null}
   */
  tap(x, y, radius) {
    return this.asMove(() => this._tap(x, y, radius));
  }

  /** Le risorse che una mossa può spendere o restituire. */
  budgets() {
    return { road: this.roadBudget, credit: this.roadCredit, bridge: this.bridgeBudget, overpass: this.overpassBudget };
  }

  /**
   * Esegue una mossa ricordando com'erano le strade prima, per poterla annullare.
   * Se la mossa non cambia niente, resta annullabile quella precedente.
   * @template T
   * @param {() => T} action
   * @returns {T}
   */
  asMove(action) {
    const before = {
      version: this.graph.version,
      nodes: new Map([...this.graph.nodes].map(([id, n]) => [id, { ...n, ...(n.overpass ? { overpass: { ...n.overpass } } : {}) }])),
      edges: new Map([...this.graph.edges].map(([id, e]) => [id, { ...e }])),
      roundabouts: new Map([...this.roundabouts].map(([id, r]) => [id, { ...r, ring: [...r.ring] }])),
      budgets: this.budgets(),
    };
    const result = action();
    const after = this.budgets();
    const changed =
      this.graph.version !== before.version || Object.keys(after).some((k) => after[/** @type {keyof typeof after} */ (k)] !== before.budgets[/** @type {keyof typeof after} */ (k)]);
    if (changed) {
      this.lastMove = { before, after };
      if (this.puzzle) this.puzzle.moves++;
    }
    return result;
  }

  /**
   * Gli ingorghi in allarme: i veicoli fermi in strada da almeno JAM_ALERT secondi,
   * con la loro sagoma e quanto manca alla sconfitta (0..1).
   * @returns {{x: number, y: number, dx: number, dy: number, length: number, width: number, progress: number}[]}
   */
  get jams() {
    return this.vehicles
      .filter((v) => (v.stopped ?? 0) >= JAM_ALERT)
      .map((v) => ({
        ...v.pose,
        length: v.type.length,
        width: v.type.width,
        progress: Math.min(1, /** @type {number} */ (v.stopped) / JAM_LOSS),
      }));
  }

  /**
   * Tutorial, scenario dell'ingorgo: mette un furgone fermo sulla strada fra due
   * stazioni, a metà del primo tratto. Resta fermo finché quella strada c'è.
   * @param {number} fromStationId
   * @param {number} toStationId
   * @returns {boolean}  false se fra le due stazioni non c'è strada
   */
  parkVan(fromStationId, toStationId) {
    const from = this.stations.find((s) => s.id === fromStationId);
    const to = this.stations.find((s) => s.id === toStationId);
    if (!from || !to) return false;
    const path = pathTo(this.paths(from.nodeId), to.nodeId);
    if (!path || path.length < 3) return false;
    /** @type {Vehicle} */
    const van = {
      id: this.nextVehicleId++,
      shape: to.shape,
      type: VEHICLE_TYPES[1],
      fromStationId: from.id,
      toStationId: to.id,
      path,
      leg: 1,
      phase: 'lane',
      s: 0,
      speed: 0,
      pose: { x: from.x, y: from.y, dx: 1, dy: 0 },
      departedAt: this.elapsed,
      parked: true,
    };
    van.s = this.lanes.lane(path[1], path[2]).length / 2;
    van.pose = pointOnVehicle(this.lanes, van);
    this.vehicles.push(van);
    return true;
  }

  /** true se c'è una mossa da annullare. */
  get canUndo() {
    return this.lastMove !== null;
  }

  /**
   * Annulla l'ultima mossa: le strade tornano com'erano e le risorse spese (o
   * restituite) tornano indietro. Quello che si è guadagnato nel frattempo, come
   * i tratti del giorno, resta. Chi era su una strada che sparisce torna in coda.
   * @returns {boolean}  false se non c'era niente da annullare
   */
  undo() {
    const move = this.lastMove;
    if (!move) return false;
    const { before, after } = move;
    // Le stazioni nate dopo la mossa restano.
    const born = [...this.graph.nodes.values()].filter((n) => n.stationId !== undefined && !before.nodes.has(n.id));
    this.graph.nodes = before.nodes;
    for (const n of born) this.graph.nodes.set(n.id, n);
    this.graph.edges = before.edges;
    this.graph.version = Math.max(this.graph.version, before.version) + 1;
    this.roundabouts = before.roundabouts;
    this.roadBudget += before.budgets.road - after.road;
    this.roadCredit = Math.max(0, this.roadCredit + before.budgets.credit - after.credit);
    this.bridgeBudget += before.budgets.bridge - after.bridge;
    this.overpassBudget += before.budgets.overpass - after.overpass;
    this.lastMove = null;
    this.events.undo++;
    if (this.puzzle) this.puzzle.moves = Math.max(0, this.puzzle.moves - 1);
    this.updateRoutes();
    return true;
  }

  /**
   * La costruzione vera, senza la fotografia per l'annulla (vedi buildRoad).
   * @param {Point[]} points
   * @param {number} snapRadius
   * @returns {string | null}
   */
  _buildRoad(points, snapRadius) {
    // Un cerchio disegnato diventa una rotonda, nel verso in cui è stato disegnato.
    const circle = drawnCircle(points);
    if (circle) {
      const result = this.makeRoundabout(circle);
      if (result === 'roundabout') this.events.roundabout++;
      return result;
    }

    // Niente strade sull'isola delle rotonde: il tratto si ferma sull'anello.
    points = clipAtRings(points, this.roundabouts.values());
    if (points.length < 2) return null;
    const plan = this.planRoad(points);
    const outcome = plan.cut ? `cut-${plan.cut.reason}` : null;
    if (plan.runs.length === 0) return outcome;
    const before = new Set(this.graph.edges.keys());
    buildPlannedRoad(this.graph, plan, snapRadius);
    const cost = this.roadCost(plan);
    this.roadBudget -= cost;
    this.bridgeBudget -= plan.bridges;
    if (plan.bridges > 0) this.events.bridge++;

    // Ogni arco nuovo ricorda la sua parte del costo, così rimuoverlo
    // restituisce esattamente quanto era stato pagato.
    const added = [...this.graph.edges.values()].filter((e) => !before.has(e.id) && !e.cost);
    const lengths = added.map((e) => edgeLength(this.graph, e.id));
    const total = lengths.reduce((a, b) => a + b, 0);
    if (total > 0) added.forEach((e, i) => (e.cost = (cost * lengths[i]) / total));

    // Gli archi nuovi in acqua sono ponti: ogni gruppo di archi collegati è un ponte.
    const wet = added.filter((e) => edgeOverWater(this.graph, this.level.waters, e));
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
    return outcome;
  }

  /**
   * @param {import('./roundabout.js').DrawnCircle} circle
   * @returns {string}  esito, per l'avviso
   */
  makeRoundabout(circle) {
    if (this.stations.some((st) => Math.hypot(st.x - circle.x, st.y - circle.y) < circle.radius + STATION_RADIUS)) return 'roundabout-station';
    if (this.upcoming.some((u) => Math.hypot(u.def.x - circle.x, u.def.y - circle.y) < circle.radius + STATION_CLEARANCE)) return 'roundabout-upcoming';
    const view = this.view;
    const blocked = ringPoints(circle).some(
      (p) => isInWater(this.level.waters, p) || obstacleAt(this.level.terrain, p, 6) !== null || !rectContains(view, p),
    );
    if (blocked) return 'roundabout-blocked';
    // Una rotonda non si sovrappone a un'altra (nemmeno ai resti di una rotta)
    // né a un cavalcavia: cancellerebbe nodi che servono ancora all'altra.
    // Se però le rotonde toccate sono tutte più piccole, la nuova le sostituisce.
    /** @type {Map<number, number>} nodo dell'anello → numero della sua rotonda */
    const ringOf = new Map();
    for (const e of this.graph.edges.values()) if (e.ring !== undefined) ringOf.set(e.a, e.ring).set(e.b, e.ring);
    /** @type {Set<number>} rotonde (o loro resti) che il cerchio nuovo tocca */
    const touched = new Set();
    // Anche un cerchio tutto dentro l'isola di un'altra rotonda la tocca.
    for (const r of this.roundabouts.values()) {
      if (Math.hypot(r.x - circle.x, r.y - circle.y) < r.radius + circle.radius + ROUNDABOUT_GAP) touched.add(r.id);
    }
    for (const n of this.graph.nodes.values()) {
      const d = Math.hypot(n.x - circle.x, n.y - circle.y);
      if (d >= circle.radius + ROUNDABOUT_GAP) continue;
      const ring = ringOf.get(n.id);
      if (ring !== undefined) touched.add(ring);
      else if (n.overpass) return 'roundabout-overpass';
    }
    const replaced = [...touched].map((id) => this.roundabouts.get(id));
    if (replaced.some((r) => !r || r.radius >= circle.radius)) return 'roundabout-overlap';
    const cost = ringCost(circle.radius, this.level.roads.segmentLength);
    // Le rotonde sostituite restituiscono i tratti del loro anello.
    const refunded = replaced.reduce((sum, r) => sum + (r?.cost ?? 0), 0);
    if (this.roadBudget + refunded < cost) return 'roundabout-too-expensive';
    for (const r of replaced) if (r) this.dismantleRoundabout(r);
    this.roadBudget -= cost;
    const before = this.paidInRoads();
    const r = buildRoundabout(this.graph, circle, this.nextRoundaboutId++, cost);
    // I pezzi di strada rimasti dentro il cerchio spariscono: la rotonda ne tiene i tratti.
    r.inner = before + cost - this.paidInRoads();
    this.roundabouts.set(r.id, r);
    this.updateRoutes();
    return 'roundabout';
  }

  /**
   * Tocco al centro di una rotatoria: torna incrocio e restituisce i tratti dell'anello.
   * @param {number} x
   * @param {number} y
   * @returns {string | null}
   */
  tapRoundabout(x, y) {
    for (const r of this.roundabouts.values()) {
      if (Math.hypot(r.x - x, r.y - y) > r.radius * 0.7) continue;
      this.dismantleRoundabout(r);
      this.updateRoutes();
      return 'roundabout-removed';
    }
    return null;
  }

  /**
   * Toglie una rotatoria: torna incrocio e restituisce i tratti dell'anello.
   * @param {import('./roundabout.js').Roundabout} r
   */
  dismantleRoundabout(r) {
    const before = this.paidInRoads();
    const spokes = removeRoundabout(this.graph, r);
    this.roundabouts.delete(r.id);
    this.refund(before - this.paidInRoads());
    // Le strade tornano fino al centro: riprendono i tratti dei pezzi che erano dentro.
    const lengths = spokes.map((id) => edgeLength(this.graph, id));
    const total = lengths.reduce((a, b) => a + b, 0);
    if (total > 0) spokes.forEach((id, i) => {
      const e = /** @type {RoadEdge} */ (this.graph.edges.get(id));
      e.cost = (e.cost ?? 0) + ((r.inner ?? 0) * lengths[i]) / total;
    });
    else this.refund(r.inner ?? 0);
  }

  /** true quando il livello è fallito: da lì la simulazione è ferma. */
  get failed() {
    return this.failedStation !== null || this.failedJam !== null;
  }

  /** true se il tempo scorre: né livello finito (perso o completato) né premio in attesa di scelta. */
  get running() {
    return !this.failed && !this.completed && !this.rewardPending && !this.puzzle?.result;
  }

  /** Premio di fine settimana: cavalcavia in più. */
  chooseOverpassReward() {
    this.lastMove = null;
    if (!this.rewardPending) return;
    this.overpassBudget += this.level.rewards.overpasses;
    this.rewardPending = false;
    this.events.reward++;
  }

  /**
   * Tocco breve sulla mappa: su un incrocio ne cambia il tipo, su una strada ne
   * cambia il senso di marcia.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {string | null}  cosa è successo (per l'avviso), null se niente
   */
  _tap(x, y, radius) {
    const roundabout = this.tapRoundabout(x, y);
    if (roundabout) return roundabout;
    const junction = this.toggleOverpass(x, y, radius);
    if (junction) {
      this.events.junction++;
      return junction;
    }
    const piece = this.findRoadPiece(x, y, radius);
    if (!piece) return null;
    this.events.roadType++;
    return this.cycleRoadType(piece);
  }

  /**
   * Doppio senso → senso unico → senso unico al contrario → doppio senso.
   * @param {RoadPiece} piece
   * @returns {string}
   */
  cycleRoadType(piece) {
    /** @type {import('./roadEditing.js').RoadType[]} */
    const order = ['two', 'forward', 'backward'];
    const next = order[(order.indexOf(pieceType(this.graph, piece)) + 1) % order.length];
    setPieceType(this.graph, piece, next);
    this.updateRoutes();
    return next;
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
    // A giro: incrocio → cavalcavia (solo sulle croci) → incrocio.
    if (best.overpass) {
      removeOverpass(this.graph, best);
      this.overpassBudget++;
      this.updateRoutes();
      return 'removed';
    }
    if (!overpassPairs(this.graph, best)) return 'not-a-cross';
    if (this.overpassBudget <= 0) return 'normal-no-overpass';
    buildOverpass(this.graph, best);
    this.overpassBudget--;
    this.updateRoutes();
    return 'built';
  }

  /** Premio di fine settimana: ponti in più. */
  chooseBridgesReward() {
    this.lastMove = null;
    if (!this.rewardPending) return;
    this.bridgeBudget += this.level.rewards.bridges;
    this.rewardPending = false;
    this.events.reward++;
  }

  /** Premio di fine settimana: tratti di strada in più. */
  chooseRoadsReward() {
    this.lastMove = null;
    if (!this.rewardPending) return;
    this.roadBudget += this.level.rewards.roads;
    this.rewardPending = false;
    this.events.reward++;
  }

  /**
   * Premio di fine settimana: una stazione regge più veicoli in coda.
   * @param {number} stationId
   */
  chooseUpgradeReward(stationId) {
    this.lastMove = null;
    const station = this.stations.find((s) => s.id === stationId);
    if (!this.rewardPending || !station) return;
    station.capacity += this.level.rewards.capacity;
    station.upgrades++;
    this.rewardPending = false;
    this.events.reward++;
  }

  /** @param {number} dt  secondi */
  step(dt) {
    if (!this.running) return;
    this.elapsed += dt;

    const day = this.day;
    // Nei rompicapi niente giorni: né tratti in più né premi.
    if (this.puzzle) this.playProgram();
    else if (day > this.rewardedDay) {
      this.roadBudget += (day - this.rewardedDay) * this.level.roads.perDay;
      this.rewardedDay = day;
    }
    // Alla fine di ogni settimana (7 giorni) il gioco si ferma per il premio.
    const weeks = Math.floor((day - 1) / 7);
    if (weeks > this.rewardedWeeks && !this.puzzle) {
      this.rewardedWeeks = weeks;
      this.rewardPending = true;
      return;
    }

    // La vista si allarga: le stazioni fisse raggiunte compaiono.
    this.revealStations(this.elapsed);

    this.hatchUpcoming();
    this.growthTimer -= dt;
    if (this.growthTimer <= 0) this.grow();

    if (this.graph.version !== this.routedVersion) this.updateRoutes();

    for (const station of this.stations) {
      if (station.kind === 'stadio') this.playMatch(station);
      // Nei rompicapi i veicoli nascono solo dal programma (playProgram).
      if (!this.puzzle) {
        const spawn = /** @type {number} */ (this.spawnTimers.get(station.id)) - dt;
        if (spawn <= 0) this.enqueue(station);
        this.spawnTimers.set(station.id, spawn > 0 ? spawn : spawn + this.nextSpawnDelay(station));
      }

      // Anche se nessuno può partire si riprova dopo DEPART_INTERVAL,
      // così il percorso non si ricalcola a ogni passo.
      const depart = /** @type {number} */ (this.departTimers.get(station.id)) - dt;
      if (depart <= 0 && station.queue.length > 0) {
        this.depart(station);
        this.departTimers.set(station.id, station.kind || station.gate ? SPECIAL_DEPART_INTERVAL : DEPART_INTERVAL);
      } else {
        this.departTimers.set(station.id, Math.max(0, depart));
      }
    }

    const arrived = new Set(this.traffic.step(this.vehicles, dt));
    let slowNow = 0;
    for (const v of this.vehicles) {
      this.roadTime += dt;
      if (v.speed < v.type.maxSpeed * SLOW) {
        this.slowTime += dt;
        slowNow++;
      }
    }
    this.recentSlow += ((this.vehicles.length ? slowNow / this.vehicles.length : 0) - this.recentSlow) * Math.min(1, dt / RECENT_TRAFFIC);
    const trafficGoal = this.level.stars?.traffic;
    // Presa la terza stella, il traffico non si misura più: la stella resta.
    if (trafficGoal && this.trafficMeasured && !this.starsEarned[2]) {
      this.trafficStreak = this.recentSlow * 100 <= trafficGoal.max ? this.trafficStreak + dt : 0;
    }
    if (arrived.size > 0) {
      this.trips += arrived.size;
      this.vehicles = this.vehicles.filter((v) => !arrived.has(v));
      for (const v of arrived) this.recordTrip(v);
    }

    if (this.puzzle) {
      this.judgePuzzle(dt);
      return;
    }

    const overloaded = updateCongestion(this.stations, dt, this.level.congestion.tolerance);
    // Nel tutorial si prova senza perdere: la sconfitta diventa un avviso.
    if (this.level.tutorial) {
      if (overloaded) this.wouldLose = 'station';
    } else this.failedStation = overloaded;

    // Ingorgo: un veicolo fermo in strada troppo a lungo fa perdere la partita.
    for (const v of this.vehicles) {
      v.stopped = v.speed < JAM_SPEED ? (v.stopped ?? 0) + dt : 0;
      if (v.stopped < JAM_LOSS) continue;
      if (this.level.tutorial) this.wouldLose = 'jam';
      else if (!this.failedJam) this.failedJam = { x: v.pose.x, y: v.pose.y };
    }

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
    station.generated++;
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
    /** @type {Set<number>} strade d'uscita senza posto: chi va di lì aspetta */
    const full = new Set();
    for (let i = 0; i < origin.queue.length; i++) {
      const shape = origin.queue[i];
      const target = this.nearestStation(paths, shape);
      if (!target) continue;
      const path = /** @type {number[]} */ (pathTo(paths, target.nodeId));
      if (full.has(path[1])) continue;
      /** @type {Vehicle} */
      const v = {
        id: this.nextVehicleId,
        shape,
        type: origin.types?.[i] ?? randomVehicleType(this.random, origin.kind === 'porto' || origin.kind === 'aeroporto' ? HEAVY_MIX[origin.kind] : undefined),
        fromStationId: origin.id,
        toStationId: target.id,
        path,
        leg: 0,
        phase: 'lane',
        s: 0,
        speed: 0,
        pose: { x: origin.x, y: origin.y, dx: 1, dy: 0 },
        departedAt: this.elapsed,
      };
      if (!this.traffic.roomToDepart(v)) {
        // Porti, aeroporti, stadi e porte dei rompicapi non restano bloccati dietro
        // al primo della fila: se la sua strada è piena, parte chi va da un'altra strada.
        if (!origin.kind && !origin.gate) return false;
        full.add(path[1]);
        continue;
      }
      v.pose = pointOnVehicle(this.lanes, v);
      this.nextVehicleId++;
      origin.queue.splice(i, 1);
      origin.types?.splice(i, 1);
      if (i < origin.returned) origin.returned--;
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
      if (!found || !this.graph.hasEdge(here, next)) return false;
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
   * Rete di sicurezza dopo un errore imprevisto: toglie gli archi rimasti senza
   * un estremo e le rotonde che hanno perso pezzi, poi rimette in strada i veicoli.
   */
  repair() {
    for (const e of [...this.graph.edges.values()]) {
      if (!this.graph.nodes.has(e.a) || !this.graph.nodes.has(e.b)) this.graph.removeEdge(e.id);
    }
    for (const [id, r] of this.roundabouts) {
      if (r.ring.some((n) => !this.graph.nodes.has(n))) this.roundabouts.delete(id);
    }
    this.updateRoutes();
  }

  /**
   * Ricalcola i percorsi di tutti i veicoli in viaggio. Chi non può più
   * proseguire torna in testa alla coda della sua stazione d'origine.
   */
  updateRoutes() {
    this.vehicles = this.vehicles.filter((v) => {
      if (this.reroute(v)) return true;
      this.traffic.forget(v);
      // Il furgone fermo del tutorial non torna in coda: sparisce con la sua strada.
      if (v.parked) return false;
      // Torna in testa alla coda come "rientrato": riparte per primo e non conta
      // per il sovraccarico, così rifare una strada non fa perdere la partita.
      const origin = this.stations.find((s) => s.id === v.fromStationId);
      if (origin) {
        origin.queue.unshift(v.shape);
        origin.returned++;
      }
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
   * per i suoi archi, più i decimali avanzati dalle rimozioni precedenti e,
   * se il pezzo rompe una rotonda, i tratti che questa custodiva.
   * @param {RoadPiece} piece
   */
  refundOf(piece) {
    const rings = new Set(piece.edgeIds.map((id) => this.graph.edges.get(id)?.ring).filter((r) => r !== undefined));
    let inner = 0;
    for (const id of rings) inner += this.roundabouts.get(/** @type {number} */ (id))?.inner ?? 0;
    return Math.floor(piece.cost + inner + this.roadCredit + 1e-6);
  }

  /**
   * Restituisce tratti, anche frazioni: la parte intera subito, il resto si
   * mette da parte per la prossima volta.
   * @param {number} amount
   */
  refund(amount) {
    if (amount <= 0) return;
    const total = amount + this.roadCredit;
    const whole = Math.floor(total + 1e-6);
    this.roadBudget += whole;
    this.roadCredit = Math.max(0, total - whole);
  }

  /** Tratti pagati per tutte le strade della mappa. */
  paidInRoads() {
    let paid = 0;
    for (const e of this.graph.edges.values()) paid += e.cost ?? 0;
    return paid;
  }

  /**
   * Rimuove un pezzo di strada e restituisce i suoi tratti.
   * @param {RoadPiece} piece
   */
  _removeRoad(piece) {
    this.events.removed++;
    // Togliere un pezzo d'anello rompe la rotatoria: resta una strada a senso unico.
    for (const id of piece.edgeIds) {
      const ring = this.graph.edges.get(id)?.ring;
      if (ring === undefined || !this.roundabouts.has(ring)) continue;
      // La rotonda si rompe e non tornerà incrocio: i tratti che custodiva tornano al giocatore.
      this.refund(this.roundabouts.get(ring)?.inner ?? 0);
      this.roundabouts.delete(ring);
    }
    const bridgeIds = new Set(piece.edgeIds.map((id) => this.graph.edges.get(id)?.bridgeId).filter((b) => b !== undefined));
    const before = this.paidInRoads();
    const touched = removeRoadPiece(this.graph, piece);
    this.refund(before - this.paidInRoads());
    // Un ponte con un incrocio sopra è fatto di più pezzi: torna solo quando ne sparisce l'ultimo.
    for (const e of this.graph.edges.values()) bridgeIds.delete(e.bridgeId);
    this.bridgeBudget += bridgeIds.size;
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
    // restare su nodi spariti. Prima si tolgono i nodi rimasti senza strade,
    // così chi ci stava sopra torna in coda invece di restare su un nodo che non c'è.
    removeIsolatedNodes(this.graph, touched);
    this.updateRoutes();
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

  /**
   * Secondi alla prossima stazione nuova, a caso nell'intervallo del livello.
   * @param {() => number} random
   */
  nextGrowthDelay(random) {
    const { intervalMin: min, intervalMax: max } = /** @type {import('./level.js').Growth} */ (this.level.growth);
    return min + random() * (max - min);
  }

  /**
   * Il dado della prossima stazione nuova. Ogni stazione ha il suo, che dipende
   * solo dal seme e da quante ne sono nate prima: così, con lo stesso seme (la
   * sfida del giorno), le stazioni nascono uguali qualunque cosa si costruisca e
   * qualunque veicolo parta.
   */
  growthRandom() {
    const { born, tries } = this.growthDraws;
    return createRandom(Math.imul(this.seed ^ 0x9e3779b9, 31) + born * 1009 + tries * 7919);
  }

  /**
   * Secondi al prossimo veicolo di una stazione: col passare dei giorni nascono
   * un po' più spesso, fino a un massimo. Porti e aeroporti il doppio, lo stadio
   * (fuori dalle partite) un terzo.
   * @param {Station} [station]
   */
  nextSpawnDelay(station) {
    const factor = station?.kind ? SPAWN_FACTOR[station.kind] : 1;
    return (this.level.spawn.min + this.random() * (this.level.spawn.max - this.level.spawn.min)) / (1 + this.spawnIncrease()) / factor;
  }

  /**
   * Rompicapo: mette in coda i veicoli del programma il cui momento è arrivato,
   * ognuno col suo tipo.
   */
  playProgram() {
    const puzzle = /** @type {NonNullable<typeof this.puzzle>} */ (this.puzzle);
    /** @type {import('./level.js').Departure[]} */ (this.level.puzzle?.program).forEach((d, k) => {
      const due = this.elapsed < d.start ? 0 : Math.min(d.count, Math.floor((this.elapsed - d.start) / d.every) + 1);
      const station = this.stations.find((s) => s.name === d.from);
      if (!station) return;
      for (; puzzle.spawned[k] < due; puzzle.spawned[k]++) {
        station.queue.push(d.shape);
        (station.types ??= []).push(/** @type {import('./vehicles.js').VehicleType} */ (VEHICLE_TYPES.find((t) => t.name === d.type)));
        station.generated++;
      }
    });
  }

  /** Rompicapo: quanti veicoli in tutto prevede il programma. */
  get puzzleTotal() {
    return (this.level.puzzle?.program ?? []).reduce((a, d) => a + d.count, 0);
  }

  /**
   * Rompicapo: risolto quando sono arrivati tutti; fallito se scade il tempo o se
   * un veicolo resta fermo in strada troppo a lungo (qui basta l'allarme).
   * @param {number} dt
   */
  judgePuzzle(dt) {
    const puzzle = /** @type {NonNullable<typeof this.puzzle>} */ (this.puzzle);
    for (const v of this.vehicles) {
      v.stopped = v.speed < JAM_SPEED ? (v.stopped ?? 0) + dt : 0;
      if (v.stopped >= JAM_ALERT && !puzzle.result) {
        puzzle.result = 'ingorgo';
        puzzle.failPoint = { x: v.pose.x, y: v.pose.y };
      }
    }
    if (puzzle.result) return;
    if (this.trips >= this.puzzleTotal) {
      puzzle.result = 'risolto';
      puzzle.finishedAt = this.elapsed;
    } else if (this.elapsed >= /** @type {import('./level.js').Puzzle} */ (this.level.puzzle).time) {
      puzzle.result = 'tempo';
      // Si indica la stazione con più veicoli che non sono riusciti a partire o,
      // se sono partiti tutti, il veicolo fermo da più tempo.
      const worst = [...this.stations].sort((a, b) => b.queue.length - a.queue.length)[0];
      const stuck = [...this.vehicles].sort((a, b) => (b.stopped ?? 0) - (a.stopped ?? 0))[0];
      puzzle.failPoint = worst && worst.queue.length > 0 ? { x: worst.x, y: worst.y } : stuck ? { x: stuck.pose.x, y: stuck.pose.y } : null;
    }
  }

  /**
   * Un punto a metà di un pezzo di strada: serve a ritrovarlo (rompicapi ricordati).
   * @param {RoadPiece} piece
   * @returns {Point}
   */
  pieceMiddle(piece) {
    const e = this.graph.edges.get(piece.edgeIds[Math.floor(piece.edgeIds.length / 2)]);
    const a = e && this.graph.nodes.get(e.a);
    const b = e && this.graph.nodes.get(e.b);
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
  }

  /**
   * Rompicapo: inizio del progetto. Quello che c'è già (le strade dei "Ripara")
   * non conta come mossa e non si annulla.
   */
  startPuzzle() {
    if (!this.puzzle) return;
    this.puzzle.moves = 0;
    this.puzzle.roadsAtStart = this.roadBudget;
    this.lastMove = null;
  }

  /**
   * Rompicapo: si torna al progetto. Le strade restano come sono, il traffico
   * riparte da zero.
   */
  restartPuzzle() {
    if (!this.puzzle) return;
    for (const v of this.vehicles) this.traffic.forget(v);
    this.vehicles = [];
    this.traffic.reset([]);
    for (const s of this.stations) {
      s.queue = [];
      s.types = [];
      s.returned = 0;
      s.overload = 0;
      s.generated = 0;
      this.departTimers.set(s.id, 0);
    }
    this.elapsed = 0;
    this.trips = 0;
    Object.assign(this.puzzle, { spawned: this.puzzle.spawned.map(() => 0), result: null, failPoint: null, finishedAt: 0 });
  }

  /**
   * Rompicapo risolto: le stelle prese. Prima: risolto; seconda: pochi tratti (o
   * poche mosse, nei "Ripara"); terza: tutti arrivati entro il tempo delle stelle.
   * @returns {boolean[]}
   */
  puzzleStars() {
    const goal = this.level.puzzle;
    const puzzle = this.puzzle;
    if (!goal || !puzzle || puzzle.result !== 'risolto') return [false, false, false];
    const thrifty = goal.moves !== null ? puzzle.moves <= (goal.stars.moves ?? goal.moves) : this.puzzleRoadsUsed <= (goal.stars.roads ?? Infinity);
    return [true, thrifty, puzzle.finishedAt <= goal.stars.time];
  }

  /** Rompicapo: tratti spesi nel progetto (quelli restituiti togliendo strade non contano). */
  get puzzleRoadsUsed() {
    return this.puzzle ? this.puzzle.roadsAtStart - this.roadBudget : 0;
  }

  /**
   * A che punto è la partita di uno stadio (null se non è uno stadio o non si gioca).
   * @param {Station} station
   */
  matchOf(station) {
    return station.kind === 'stadio' ? matchState(station, this.elapsed, this.level.dayLength) : null;
  }

  /**
   * La partita allo stadio: mentre arrivano i tifosi le altre stazioni mandano
   * veicoli in più della forma dello stadio; alla fine lo stadio si svuota tutto insieme.
   * @param {Station} stadium
   */
  playMatch(stadium) {
    const m = this.matchOf(stadium);
    if (!m) return;
    if (stadium.matchCycle !== m.cycle) {
      stadium.matchCycle = m.cycle;
      stadium.fans = 0;
      stadium.out = 0;
    }
    if (m.phase === 'arrivo') {
      const others = this.stations.filter((s) => s !== stadium && s.shape !== stadium.shape);
      while (others.length > 0 && (stadium.fans ?? 0) < Math.ceil(m.done * MATCH.fans)) {
        const from = others[Math.floor(this.random() * others.length)];
        from.queue.push(stadium.shape);
        from.generated++;
        stadium.fans = (stadium.fans ?? 0) + 1;
      }
    } else if (m.phase === 'uscita') {
      while ((stadium.out ?? 0) < Math.ceil(m.done * MATCH.out)) {
        this.enqueue(stadium);
        stadium.out = (stadium.out ?? 0) + 1;
      }
    }
  }

  /**
   * Quanti veicoli in più nascono rispetto all'inizio (0.5 = +50%): fino alla
   * terza stella sale un po' ogni giorno fino al suo tetto; dopo la terza stella
   * sale più in fretta fino a un tetto più alto (la Maratona del platino).
   */
  spawnIncrease() {
    const { growth, growthMax, growthAfter, growthMaxAfter } = this.level.spawn;
    const day = this.elapsed / this.level.dayLength;
    // Anche prima che il costruttore l'abbia impostato (le stazioni iniziali si creano prima).
    if (this.threeStarsAt == null) return Math.min(growth * day, growthMax);
    const startDay = this.threeStarsAt / this.level.dayLength;
    const atThree = Math.min(growth * startDay, growthMax);
    return Math.max(atThree, Math.min(atThree + growthAfter * (day - startDay), growthMaxAfter));
  }
}
