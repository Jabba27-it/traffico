// Dinamica del traffico: ogni veicolo accelera fino alla sua velocità massima,
// rallenta prima delle curve, mantiene la distanza da chi lo precede e agli
// incroci aspetta il suo turno.
//
// Incroci (e stazioni attraversate): per entrare nella curva serve un permesso.
// Lo riceve chi è arrivato prima, purché la sua curva non incroci quella di chi
// è già dentro e purché dall'altra parte ci sia spazio per uscire.

import { currentPiece, upcomingPieces, moveVehicle } from './vehicles.js';

/** @typedef {import('./lanes.js').LaneGeometry} LaneGeometry */
/** @typedef {import('./lanes.js').Piece} Piece */
/** @typedef {import('./vehicles.js').Vehicle} Vehicle */

/** Spazio minimo fra due veicoli fermi in coda. */
const MIN_GAP = 3;
/** Frenata normale, in unità al secondo². */
const BRAKE = 110;
/** Fin dove un veicolo guarda davanti a sé. */
const LOOKAHEAD = 100;
/** A questa distanza dalla curva di un incrocio si chiede il permesso. */
const REQUEST_DISTANCE = 50;
/** Chi si immette aspetta se sulla principale qualcuno è a meno di così dall'incrocio. */
const ARRIVAL_GAP = 18;
/** Velocità in curva, in frazione della massima, per la curva più stretta. */
const SHARPEST_CURVE = 0.3;
/** Accelerazione laterale massima in curva: v² / raggio. */
const MAX_LATERAL = 90;
/** Sulle superstrade si va più veloci della velocità massima normale. */
const SUPER_SPEED = 1.35;
/** Quanto si perde in cima a un colle, in frazione della velocità: automobili e mezzi pesanti. */
const HILL_CAR = 0.3;
const HILL_HEAVY = 0.6;
/** Velocità sul cavalcavia, in frazione della massima: automobili e mezzi pesanti. */
const RAMP_CAR = 0.85;
const RAMP_HEAVY = 0.65;
/** Un veicolo è "fermo nel traffico" sotto questa frazione della sua velocità massima. */
export const SLOW = 0.3;
/**
 * Durata del verde del semaforo: più lungo per la strada principale, che ha
 * più traffico. Fra una fase e l'altra, un momento di tutto rosso.
 */
const GREEN_TIME = 8;
const SIDE_GREEN_TIME = 4;
const ALL_RED_TIME = 1.5;
/** Verde minimo prima che il semaforo possa passare in anticipo a chi aspetta. */
const MIN_GREEN = 2;
/** Tutto rosso quando nell'incrocio non c'è nessuno. */
const ALL_RED_EMPTY = 0.3;
/** Quanto in fretta il colore del traffico di una strada segue la realtà. */
const CONGESTION_RATE = 0.8;

/**
 * @typedef {Object} Request
 * @property {Vehicle} v
 * @property {Piece} turn  la curva in cui vuole entrare
 */

/**
 * @typedef {Object} Junction
 * @property {Map<number, Piece>} inside  veicoli con il permesso, e la loro curva
 * @property {Request[]} queue            richieste in attesa, dalla più vecchia
 */

export class Traffic {
  /** @param {LaneGeometry} lanes */
  constructor(lanes) {
    this.lanes = lanes;
    /** @type {Map<number, Junction>} */
    this.junctions = new Map();
    /** @type {Map<string, {v: Vehicle, s: number}[]>} veicoli su ogni pezzo */
    this.occupancy = new Map();
    /** @type {Map<string, {v: Vehicle, key: string, remain: number}[]>} veicoli in curva, per nodo e corsia d'arrivo */
    this.merging = new Map();
    /** @type {Map<string, boolean>} */
    this.conflictCache = new Map();
    /** @type {Map<string, number>} traffico lento su ogni strada, 0..1, per coppia di nodi */
    this.congestion = new Map();
    /**
     * Semafori: fase 0 = verde alla strada principale, 1 = alle laterali.
     * @type {Map<number, {phase: 0 | 1, allRed: boolean, t: number}>}
     */
    this.signals = new Map();
    this.signalVersion = -1;
  }

  /**
   * Fa avanzare tutti i veicoli di dt secondi.
   * @param {Vehicle[]} vehicles
   * @param {number} dt
   * @returns {Vehicle[]} i veicoli arrivati a destinazione
   */
  step(vehicles, dt) {
    this.indexVehicles(vehicles);
    this.updateSignals(dt);
    this.grantPermissions();

    for (const v of vehicles) v.speed = this.safeSpeed(v, dt);

    /** @type {Vehicle[]} */
    const arrived = [];
    for (const v of vehicles) {
      let distance = v.speed * dt;
      // Mai entrare in un incrocio senza permesso, anche per arrotondamento.
      const piece = currentPiece(this.lanes, v);
      if (v.phase === 'lane' && v.leg + 2 < v.path.length) {
        const turn = this.lanes.turn(v.path[v.leg], v.path[v.leg + 1], v.path[v.leg + 2]);
        if (turn.guarded && !this.hasPermission(v, turn)) distance = Math.min(distance, Math.max(0, piece.length - v.s - 0.01));
      }
      const done = moveVehicle(this.lanes, v, distance, (left) => {
        if (left.kind === 'turn' && left.guarded) this.junctionAt(left.node).inside.delete(v.id);
      });
      if (done) {
        arrived.push(v);
        this.forget(v);
      }
    }

    this.updateCongestion(vehicles, dt);
    return arrived;
  }

  /**
   * Quanto spazio libero c'è davanti a un veicolo che partirebbe ora dall'inizio
   * del suo percorso: serve a decidere se una stazione può farlo partire.
   * @param {Vehicle} v
   */
  roomToDepart(v) {
    return this.freeAhead(v, Infinity) >= v.type.length + MIN_GAP;
  }

  /**
   * Dopo un cambio delle strade: permessi e richieste si rifanno da capo,
   * tranne per chi è già dentro una curva d'incrocio.
   * @param {Vehicle[]} vehicles
   */
  reset(vehicles) {
    this.junctions.clear();
    this.conflictCache.clear();
    for (const v of vehicles) {
      if (v.phase !== 'turn') continue;
      const turn = currentPiece(this.lanes, v);
      if (turn.guarded) this.junctionAt(turn.node).inside.set(v.id, turn);
    }
  }

  /**
   * Un veicolo che lascia la strada (arrivato o tornato in coda).
   * @param {Vehicle} v
   */
  forget(v) {
    for (const j of this.junctions.values()) {
      j.inside.delete(v.id);
      j.queue = j.queue.filter((r) => r.v !== v);
    }
  }

  /** @param {Vehicle[]} vehicles */
  indexVehicles(vehicles) {
    this.occupancy.clear();
    this.merging.clear();
    for (const v of vehicles) {
      const piece = currentPiece(this.lanes, v);
      const list = this.occupancy.get(piece.key);
      if (list) list.push({ v, s: v.s });
      else this.occupancy.set(piece.key, [{ v, s: v.s }]);
      // Chi è in una curva verso una corsia, per chi arriva da un'altra curva verso la stessa.
      if (piece.kind === 'turn') {
        const k = `${piece.node}>${piece.to}`;
        const m = this.merging.get(k) ?? [];
        m.push({ v, key: piece.key, remain: piece.length - v.s });
        this.merging.set(k, m);
      }
    }
  }

  /**
   * La velocità più alta a cui il veicolo può andare senza urtare chi ha davanti,
   * prendere una curva troppo forte o entrare in un incrocio senza permesso.
   * @param {Vehicle} v
   * @param {number} dt
   */
  safeSpeed(v, dt) {
    let limit = Infinity;
    let toStart = -v.s; // distanza dal veicolo all'inizio del pezzo esaminato
    let leaderFound = false;
    for (const piece of upcomingPieces(this.lanes, v)) {
      if (toStart > LOOKAHEAD) break;
      const ahead = Math.max(0, toStart);

      // Velocità della strada: sulle superstrade più alta. Prima di lasciarle si frena.
      const roadSpeed = v.type.maxSpeed * (piece.fast ? SUPER_SPEED : 1);
      limit = Math.min(limit, Math.sqrt(roadSpeed * roadSpeed + 2 * BRAKE * ahead));

      // Colli: in salita le auto rallentano un po', i mezzi pesanti molto di più.
      if (piece.hill > 0) {
        const slope = v.type.maxSpeed * (1 - piece.hill * (v.type.name === 'auto' ? HILL_CAR : HILL_HEAVY));
        limit = Math.min(limit, Math.sqrt(slope * slope + 2 * BRAKE * ahead));
      }

      // Salita e discesa del cavalcavia: le auto rallentano poco, i mezzi pesanti di più.
      if (piece.elevated) {
        const ramp = v.type.maxSpeed * (v.type.name === 'auto' ? RAMP_CAR : RAMP_HEAVY);
        limit = Math.min(limit, Math.sqrt(ramp * ramp + 2 * BRAKE * ahead));
      }

      if (piece.kind === 'turn') {
        // Più la curva gira e più è stretta, più bisogna rallentare.
        const byAngle = v.type.maxSpeed * (1 - (1 - SHARPEST_CURVE) * (piece.angle / Math.PI));
        const radius = piece.angle > 0.05 ? piece.length / piece.angle : Infinity;
        const curve = Math.min(byAngle, Math.sqrt(MAX_LATERAL * radius));
        limit = Math.min(limit, Math.sqrt(curve * curve + 2 * BRAKE * ahead));
        if (piece.guarded && toStart >= 0 && !this.hasPermission(v, piece)) {
          if (toStart < REQUEST_DISTANCE) this.request(v, piece);
          limit = Math.min(limit, stopSpeed(toStart - v.type.length / 2 - 0.5));
          break; // oltre l'incrocio non serve guardare
        }
      }

      if (!leaderFound) {
        let best = Infinity;
        /** @type {Vehicle | null} */
        let leader = null;
        for (const o of this.occupancy.get(piece.key) ?? []) {
          if (o.v === v) continue;
          const d = toStart + o.s;
          if (d > 0 && d < best) {
            best = d;
            leader = o.v;
          }
        }
        // Immissione: chi in un'altra curva è più vicino al punto in cui le due
        // corsie si uniscono, conta come veicolo davanti.
        if (piece.kind === 'turn') {
          const mine = toStart + piece.length; // distanza dalla fine della curva
          for (const o of this.merging.get(`${piece.node}>${piece.to}`) ?? []) {
            if (o.v === v || o.key === piece.key || o.remain >= mine) continue;
            const d = mine - o.remain;
            if (d < best) {
              best = d;
              leader = o.v;
            }
          }
        }
        if (leader) {
          leaderFound = true;
          const gap = best - (v.type.length + leader.type.length) / 2 - MIN_GAP;
          limit = Math.min(limit, Math.sqrt(leader.speed * leader.speed + 2 * BRAKE * Math.max(0, gap)));
          if (gap <= 0) limit = 0;
        }
      }
      toStart += piece.length;
    }
    // Si accelera con calma; si frena quanto serve.
    return limit > v.speed ? Math.min(limit, v.speed + v.type.accel * dt) : limit;
  }

  /**
   * @param {Vehicle} v
   * @param {Piece} turn
   */
  hasPermission(v, turn) {
    return this.junctions.get(turn.node)?.inside.get(v.id)?.key === turn.key;
  }

  /**
   * @param {Vehicle} v
   * @param {Piece} turn
   */
  request(v, turn) {
    const j = this.junctionAt(turn.node);
    const mine = j.queue.find((r) => r.v === v);
    if (mine) mine.turn = turn;
    else j.queue.push({ v, turn });
  }

  /**
   * Dà il permesso alle richieste che possono passare.
   * - Chi arriva dalla strada principale viene prima; chi arriva da una laterale
   *   passa solo se nessuno della principale con una traiettoria in conflitto
   *   sta arrivando (è l'immissione: se il varco c'è, non serve fermarsi).
   * - Con il semaforo passa solo chi ha il verde.
   * - Fra pari, passa chi è arrivato prima.
   */
  grantPermissions() {
    for (const [node, j] of this.junctions) {
      const signal = this.signals.get(node);
      const main = this.lanes.mainRoad(node);
      const fromMain = (/** @type {Request} */ r) => main.has(r.turn.from);
      // Le richieste della principale prima, ognuna nel suo ordine d'arrivo.
      const ordered = signal ? j.queue : [...j.queue.filter(fromMain), ...j.queue.filter((r) => !fromMain(r))];
      /** @type {Request[]} */
      const waiting = [];
      // Chi arriva da una laterale aspetta anche se sulla principale sta arrivando qualcuno.
      const mainBusy = !signal && j.queue.some((r) => !fromMain(r)) && this.priorityApproaching(node, main);
      j.queue = ordered.filter((r) => {
        const red = signal !== undefined && (signal.allRed || (signal.phase === 0) !== fromMain(r));
        const blocked =
          red ||
          (!signal && !fromMain(r) && mainBusy) ||
          [...j.inside.values()].some((t) => this.conflicts(t, r.turn)) ||
          waiting.some((w) => this.conflicts(w.turn, r.turn)) ||
          !this.exitIsFree(r.v, r.turn);
        if (blocked) {
          if (!red) waiting.push(r);
          return true;
        }
        j.inside.set(r.v.id, r.turn);
        return false;
      });
    }
  }

  /**
   * true se sulla strada principale un veicolo sta per arrivare all'incrocio
   * (o lo sta attraversando senza bisogno di permesso, come sull'anello di una rotatoria).
   * @param {number} node
   * @param {Set<number>} main
   */
  priorityApproaching(node, main) {
    for (const m of main) {
      if (!this.lanes.graph.canTravel(m, node)) continue;
      const lane = this.lanes.lane(m, node);
      for (const o of this.occupancy.get(lane.key) ?? []) {
        if (lane.length - o.s < ARRIVAL_GAP + o.v.speed * 0.5) return true;
      }
    }
    // Chi è già nella curva dell'incrocio arrivando dalla principale.
    for (const [key, list] of this.occupancy) {
      if (!key.startsWith('T') || list.length === 0) continue;
      const turn = currentPiece(this.lanes, list[0].v);
      if (turn.node === node && main.has(turn.from)) return true;
      // Oppure nella curva subito prima, che porta sulla principale verso l'incrocio.
      if (turn.to === node && main.has(turn.node)) return true;
    }
    return false;
  }

  /**
   * Chi usa o aspetta un semaforo: c'è qualcuno dalla parte col verde (in
   * attesa, già nell'incrocio o in arrivo) e qualcuno in attesa col rosso?
   * @param {number} node
   * @param {0 | 1} phase  0 = verde alla principale
   */
  signalDemand(node, phase) {
    const j = this.junctions.get(node);
    const main = this.lanes.mainRoad(node);
    const green = (/** @type {number} */ from) => (phase === 0) === main.has(from);
    let greenSide = (j?.inside.size ?? 0) > 0;
    let redSide = false;
    for (const r of j?.queue ?? []) {
      if (green(r.turn.from)) greenSide = true;
      else redSide = true;
    }
    // Chi sta arrivando col verde, anche se non ha ancora chiesto di passare.
    if (!greenSide) {
      for (const e of this.lanes.graph.edges.values()) {
        if (e.a !== node && e.b !== node) continue;
        const m = e.a === node ? e.b : e.a;
        if (!green(m) || !this.lanes.graph.canTravel(m, node)) continue;
        const lane = this.lanes.lane(m, node);
        if ((this.occupancy.get(lane.key) ?? []).some((o) => lane.length - o.s < REQUEST_DISTANCE * 2)) greenSide = true;
      }
    }
    return { greenSide, redSide };
  }

  /**
   * Fa avanzare i semafori: verde alla strada principale, poi tutto rosso,
   * verde alle laterali, tutto rosso, e così via. Sono semafori "con i
   * sensori": se dall'altra parte non aspetta nessuno il verde resta, e se
   * col verde non passa nessuno mentre dall'altra parte si aspetta, il verde
   * passa subito (dopo un minimo). Così nessuno si ferma a un rosso inutile.
   * @param {number} dt
   */
  updateSignals(dt) {
    if (this.signalVersion !== this.lanes.graph.version) {
      this.signalVersion = this.lanes.graph.version;
      for (const n of this.lanes.graph.nodes.values()) {
        if (n.signal && !this.signals.has(n.id)) this.signals.set(n.id, { phase: 0, allRed: false, t: GREEN_TIME });
      }
      for (const id of this.signals.keys()) if (!this.lanes.graph.nodes.get(id)?.signal) this.signals.delete(id);
    }
    for (const [node, s] of this.signals) {
      s.t -= dt;
      if (!s.allRed) {
        s.green = (s.green ?? 0) + dt;
        const { greenSide, redSide } = this.signalDemand(node, s.phase);
        // Nessuno col verde e qualcuno col rosso: si cambia subito.
        if (redSide && !greenSide && s.green >= MIN_GREEN) s.t = 0;
        // Verde finito ma col rosso non aspetta nessuno: il verde continua.
        if (s.t <= 0 && !redSide) s.t = s.phase === 0 ? GREEN_TIME : SIDE_GREEN_TIME;
      } else if ((this.junctions.get(node)?.inside.size ?? 0) === 0) {
        // Il tutto rosso serve a far liberare l'incrocio: se è già vuoto, dura un attimo.
        s.t = Math.min(s.t, ALL_RED_EMPTY);
      }
      if (s.t > 0) continue;
      if (s.allRed) {
        s.allRed = false;
        s.phase = s.phase === 0 ? 1 : 0;
        s.t = s.phase === 0 ? GREEN_TIME : SIDE_GREEN_TIME;
        s.green = 0;
      } else {
        s.allRed = true;
        s.t = ALL_RED_TIME;
      }
    }
  }

  /**
   * "Non bloccare l'incrocio": dopo la curva deve esserci posto per tutto il veicolo.
   * @param {Vehicle} v
   * @param {Piece} turn
   */
  exitIsFree(v, turn) {
    let afterTurn = false;
    let free = 0;
    const need = v.type.length + 2 * MIN_GAP;
    for (const piece of upcomingPieces(this.lanes, v)) {
      if (!afterTurn) {
        if (piece === turn || piece.key === turn.key) afterTurn = true;
        continue;
      }
      let first = Infinity;
      for (const o of this.occupancy.get(piece.key) ?? []) first = Math.min(first, o.s - o.v.type.length / 2);
      if (first < Infinity) return free + first >= need;
      free += piece.length;
      if (free >= need) return true;
    }
    return true; // dopo la curva c'è l'arrivo
  }

  /**
   * Spazio libero davanti al veicolo lungo il suo percorso, fino a `max`.
   * @param {Vehicle} v
   * @param {number} max
   */
  freeAhead(v, max) {
    let toStart = -v.s;
    for (const piece of upcomingPieces(this.lanes, v)) {
      let first = Infinity;
      for (const o of this.occupancy.get(piece.key) ?? []) {
        if (o.v === v) continue;
        const d = toStart + o.s - o.v.type.length / 2;
        if (d > -o.v.type.length && d < first) first = d;
      }
      if (first < Infinity) return Math.max(0, first);
      toStart += piece.length;
      if (toStart > Math.min(max, LOOKAHEAD)) return toStart;
    }
    return Infinity;
  }

  /**
   * true se due curve nello stesso incrocio non possono essere percorse insieme.
   * @param {Piece} a
   * @param {Piece} b
   */
  conflicts(a, b) {
    if (a.key === b.key) return false; // stessa curva: ci si segue in fila
    const id = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
    const cached = this.conflictCache.get(id);
    if (cached !== undefined) return cached;
    const [, inA, , outA] = a.key.match(/^T(\d+)_(\d+)_(\d+)$/) ?? [];
    const [, inB, , outB] = b.key.match(/^T(\d+)_(\d+)_(\d+)$/) ?? [];
    // Stessa corsia d'ingresso o stessa d'uscita: una alla volta.
    let result = inA === inB || outA === outB;
    if (!result) {
      const clearance = 8; // circa la larghezza di un veicolo più un margine
      result = a.points.some((p) => b.points.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < clearance));
    }
    this.conflictCache.set(id, result);
    return result;
  }

  /** @param {number} node */
  junctionAt(node) {
    let j = this.junctions.get(node);
    if (!j) {
      j = { inside: new Map(), queue: [] };
      this.junctions.set(node, j);
    }
    return j;
  }

  /**
   * Quanto è lento il traffico su ogni strada, ammorbidito nel tempo.
   * @param {Vehicle[]} vehicles
   * @param {number} dt
   */
  updateCongestion(vehicles, dt) {
    /** @type {Map<string, {slow: number, total: number}>} */
    const seen = new Map();
    for (const v of vehicles) {
      if (v.phase !== 'lane') continue;
      const a = v.path[v.leg];
      const b = v.path[v.leg + 1];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const entry = seen.get(key) ?? { slow: 0, total: 0 };
      entry.total++;
      if (v.speed < v.type.maxSpeed * SLOW) entry.slow++;
      seen.set(key, entry);
    }
    const k = Math.min(1, dt * CONGESTION_RATE);
    for (const [key, value] of this.congestion) {
      const target = seen.has(key) ? /** @type {{slow: number, total: number}} */ (seen.get(key)).slow / /** @type {{slow: number, total: number}} */ (seen.get(key)).total : 0;
      const next = value + (target - value) * k;
      if (next < 0.01 && !seen.has(key)) this.congestion.delete(key);
      else this.congestion.set(key, next);
    }
    for (const [key, entry] of seen) {
      if (!this.congestion.has(key)) this.congestion.set(key, (entry.slow / entry.total) * k);
    }
  }
}

/**
 * La velocità da cui si riesce a fermarsi in `distance`.
 * @param {number} distance
 */
function stopSpeed(distance) {
  return Math.sqrt(2 * BRAKE * Math.max(0, distance));
}
