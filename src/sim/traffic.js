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
/** Sotto questa velocità un veicolo sulla principale non sta "arrivando": è fermo. */
const ARRIVING_SPEED = 2;
/** Sopra questa velocità chi è appena oltre l'incrocio si sta allontanando: si può entrare. */
const MOVING_SPEED = 4;
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
/** Quanto in fretta il colore del traffico di una strada segue la realtà. */
const CONGESTION_RATE = 0.8;

/**
 * @typedef {Object} Request
 * @property {Vehicle} v
 * @property {Piece} turn  la curva in cui vuole entrare
 * @property {number} dist  quanto manca all'inizio della curva
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
  }

  /**
   * Fa avanzare tutti i veicoli di dt secondi.
   * @param {Vehicle[]} vehicles
   * @param {number} dt
   * @returns {Vehicle[]} i veicoli arrivati a destinazione
   */
  step(vehicles, dt) {
    this.indexVehicles(vehicles);
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
          if (toStart < REQUEST_DISTANCE) this.request(v, piece, toStart);
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
   * @param {number} dist  quanto manca all'inizio della curva
   */
  request(v, turn, dist) {
    const j = this.junctionAt(turn.node);
    const mine = j.queue.find((r) => r.v === v);
    if (mine) {
      mine.turn = turn;
      mine.dist = dist;
    } else j.queue.push({ v, turn, dist });
  }

  /**
   * Dà il permesso alle richieste che possono passare.
   * - Chi arriva dalla strada principale viene prima; chi arriva da una laterale
   *   passa solo se nessuno della principale con una traiettoria in conflitto
   *   sta arrivando (è l'immissione: se il varco c'è, non serve fermarsi).
   * - Fra pari, passa chi è arrivato prima.
   * - Il permesso va solo al primo della fila su ogni strada d'arrivo: se lo
   *   prendesse uno più indietro, chi gli sta davanti e deve fare una curva che
   *   incrocia la sua aspetterebbe lui, e lui chi gli sta davanti, per sempre.
   */
  grantPermissions() {
    for (const [node, j] of this.junctions) {
      const main = this.lanes.mainRoad(node);
      const fromMain = (/** @type {Request} */ r) => main.has(r.turn.from);
      // Le richieste della principale prima, ognuna nel suo ordine d'arrivo.
      const ordered = [...j.queue.filter(fromMain), ...j.queue.filter((r) => !fromMain(r))];
      /** @type {Request[]} */
      const waiting = [];
      // Chi arriva da una laterale aspetta anche chi sta arrivando sulla principale,
      // ma solo se le loro curve si incrociano.
      const arrivals = j.queue.some((r) => !fromMain(r)) ? this.mainArrivals(node, main) : [];
      /** @type {Map<number, number>} per ogni strada d'arrivo, quanto è vicino all'incrocio il primo della fila */
      const front = new Map();
      for (const r of j.queue) front.set(r.turn.from, Math.min(front.get(r.turn.from) ?? Infinity, r.dist));
      j.queue = ordered.filter((r) => {
        // Non è il primo della sua fila: aspetta senza bloccare nessuno.
        if (r.dist > /** @type {number} */ (front.get(r.turn.from))) return true;
        const blocked =
          (!fromMain(r) && arrivals.some((t) => this.conflicts(t, r.turn))) ||
          [...j.inside.values()].some((t) => this.conflicts(t, r.turn)) ||
          waiting.some((w) => this.conflicts(w.turn, r.turn)) ||
          !this.exitIsFree(r.v, r.turn);
        if (blocked) {
          waiting.push(r);
          return true;
        }
        j.inside.set(r.v.id, r.turn);
        return false;
      });
    }
  }

  /**
   * Le curve che faranno in questo incrocio i veicoli che stanno arrivando sulla
   * strada principale (o che lo attraversano senza bisogno di permesso, come
   * sull'anello di una rotatoria). Chi sulla principale è fermo non conta: se
   * aspetta il suo turno è già nella coda dei permessi.
   * @param {number} node
   * @param {Set<number>} main
   * @returns {Piece[]}
   */
  mainArrivals(node, main) {
    /** @type {Piece[]} */
    const turns = [];
    /** @param {Vehicle} v */
    const nextTurnHere = (v) => {
      const i = v.path.indexOf(node, v.leg);
      if (i >= 1 && i + 1 < v.path.length) turns.push(this.lanes.turn(v.path[i - 1], node, v.path[i + 1]));
    };
    for (const m of main) {
      if (!this.lanes.graph.canTravel(m, node)) continue;
      const lane = this.lanes.lane(m, node);
      for (const o of this.occupancy.get(lane.key) ?? []) {
        if (o.v.speed > ARRIVING_SPEED && lane.length - o.s < ARRIVAL_GAP + o.v.speed * 0.5) nextTurnHere(o.v);
      }
    }
    for (const [key, list] of this.occupancy) {
      if (!key.startsWith('T')) continue;
      for (const o of list) {
        const turn = currentPiece(this.lanes, o.v);
        // Già nella curva dell'incrocio arrivando dalla principale, senza permesso (anello).
        if (turn.node === node && main.has(turn.from) && !turn.guarded) turns.push(turn);
        // Oppure nella curva subito prima, che porta sulla principale verso l'incrocio.
        else if (turn.to === node && main.has(turn.node) && o.v.speed > ARRIVING_SPEED) nextTurnHere(o.v);
      }
    }
    return turns;
  }

  /**
   * "Non bloccare l'incrocio": dopo la curva deve esserci posto per tutto il veicolo,
   * oppure chi c'è davanti si sta allontanando (non serve aspettare che il posto sia
   * già libero: le code a fisarmonica agli incroci nascevano da qui).
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
      let firstSpeed = 0;
      for (const o of this.occupancy.get(piece.key) ?? []) {
        const back = o.s - o.v.type.length / 2;
        if (back < first) {
          first = back;
          firstSpeed = o.v.speed;
        }
      }
      if (first < Infinity) return free + first >= need || (firstSpeed > MOVING_SPEED && free + first > 0);
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
