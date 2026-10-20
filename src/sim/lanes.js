// Geometria del traffico: corsie e curve.
// Ogni strada ha due corsie, una per senso di marcia, a destra del centro.
// Vicino a ogni nodo la corsia si accorcia e il veicolo passa nella corsia
// successiva seguendo una curva: così agli incroci svolta davvero.

import { ROAD_WIDTH } from './graph.js';
import { STATION_RADIUS } from './stations.js';

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {{x: number, y: number}} Point */

/** Distanza del centro della corsia dal centro della strada. */
export const LANE_OFFSET = ROAD_WIDTH / 4;
/** Raggio dell'area di un incrocio (3 o più strade). */
const JUNCTION_RADIUS = 14;
/** Raggio della curva dove una strada piega senza incroci. */
const BEND_RADIUS = 8;
/** Dentro una stazione i veicoli girano sotto la forma, quasi al bordo. */
const STATION_TURN_RADIUS = STATION_RADIUS * 0.8;
/** Punti con cui si misura una curva. */
const CURVE_SAMPLES = 20;

/**
 * Un pezzo di percorso: un tratto dritto di corsia o una curva in un nodo.
 * @typedef {Object} Piece
 * @property {string} key       uguale per tutti i veicoli che fanno lo stesso pezzo
 * @property {'lane' | 'turn'} kind
 * @property {Point[]} points   la linea del pezzo (2 punti se dritto)
 * @property {number[]} lengths lunghezza percorsa fino a ciascun punto
 * @property {number} length
 * @property {number} node      per le curve: il nodo dove si svolta
 * @property {number} angle     per le curve: quanto si gira, in radianti (0..π)
 * @property {boolean} guarded  per le curve: serve il permesso per entrarci (incroci e stazioni)
 * @property {boolean} elevated sale o scende dal cavalcavia: lì si va più piano
 * @property {boolean} fast     corsia di superstrada: lì si va più veloci
 * @property {number} from      per le curve: il nodo da cui si arriva
 * @property {number} to        per le curve: il nodo verso cui si va
 */

export class LaneGeometry {
  /** @param {RoadGraph} graph */
  constructor(graph) {
    this.graph = graph;
    this.version = -1;
    /** @type {Map<string, Piece>} */
    this.cache = new Map();
    /** @type {Map<number, number>} */
    this.degree = new Map();
    /** @type {Map<number, Set<number>>} strada principale di ogni incrocio */
    this.mains = new Map();
  }

  /** Svuota le misure se le strade sono cambiate. */
  refresh() {
    if (this.version === this.graph.version) return;
    this.version = this.graph.version;
    this.cache.clear();
    this.degree.clear();
    this.mains.clear();
    for (const e of this.graph.edges.values()) {
      this.degree.set(e.a, (this.degree.get(e.a) ?? 0) + 1);
      this.degree.set(e.b, (this.degree.get(e.b) ?? 0) + 1);
    }
  }

  /**
   * true se il nodo è un incrocio o una stazione: lì serve la precedenza.
   * @param {number} id
   */
  isJunction(id) {
    this.refresh();
    return this.graph.nodes.get(id)?.stationId !== undefined || (this.degree.get(id) ?? 0) >= 3;
  }

  /**
   * La corsia dritta da a verso b, accorciata alle due estremità.
   * @param {number} a
   * @param {number} b
   * @returns {Piece}
   */
  lane(a, b) {
    this.refresh();
    const key = `L${a}_${b}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const pa = node(this.graph, a);
    const pb = node(this.graph, b);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    const dx = (pb.x - pa.x) / len;
    const dy = (pb.y - pa.y) / len;
    // Con l'asse y verso il basso, la destra del senso di marcia è (-dy, dx).
    // I sensi unici hanno una corsia sola, al centro della strada.
    const offset = this.graph.getEdge(a, b)?.oneWay ? 0 : LANE_OFFSET;
    const nx = -dy * offset;
    const ny = dx * offset;
    let ra = this.nodeRadius(a);
    let rb = this.nodeRadius(b);
    // Sulle strade cortissime le due curve non devono sovrapporsi.
    const room = len * 0.9;
    if (ra + rb > room) {
      const k = room / (ra + rb);
      ra *= k;
      rb *= k;
    }
    const start = { x: pa.x + nx + dx * ra, y: pa.y + ny + dy * ra };
    const end = { x: pb.x + nx - dx * rb, y: pb.y + ny - dy * rb };
    const piece = makePiece(key, 'lane', [start, end], -1, 0, false);
    piece.elevated = Boolean(pa.overpass?.upper || pb.overpass?.upper);
    piece.fast = this.graph.getEdge(a, b)?.kind === 'super';
    this.cache.set(key, piece);
    return piece;
  }

  /**
   * La curva nel nodo b, dalla corsia a→b alla corsia b→c.
   * @param {number} a
   * @param {number} b
   * @param {number} c
   * @returns {Piece}
   */
  turn(a, b, c) {
    this.refresh();
    const key = `T${a}_${b}_${c}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const inLane = this.lane(a, b);
    const outLane = this.lane(b, c);
    const p0 = inLane.points[1];
    const p2 = outLane.points[0];
    const d0 = direction(inLane.points[0], p0);
    const d2 = direction(p2, outLane.points[1]);
    const cross = d0.x * d2.y - d0.y * d2.x;
    const dot = d0.x * d2.x + d0.y * d2.y;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    let p1;
    if (dot < -0.95) {
      // Inversione a U: la curva passa oltre il nodo.
      const center = node(this.graph, b);
      p1 = { x: center.x + d0.x * this.nodeRadius(b) * 1.6, y: center.y + d0.y * this.nodeRadius(b) * 1.6 };
    } else if (Math.abs(cross) < 1e-3) {
      p1 = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    } else {
      // Punto d'incontro delle due corsie prolungate.
      const t = ((p2.x - p0.x) * d2.y - (p2.y - p0.y) * d2.x) / cross;
      p1 = { x: p0.x + d0.x * t, y: p0.y + d0.y * t };
    }
    /** @type {Point[]} */
    const points = [];
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES;
      const u = 1 - t;
      points.push({
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      });
    }
    const piece = makePiece(key, 'turn', points, b, angle, this.isJunction(b));
    piece.elevated = Boolean(node(this.graph, b).overpass?.upper);
    // Una curva fra due tratti di superstrada fa parte della superstrada.
    piece.fast = inLane.fast && outLane.fast;
    piece.from = a;
    piece.to = c;
    this.cache.set(key, piece);
    return piece;
  }

  /**
   * La strada principale di un incrocio: i due nodi vicini da cui la strada
   * attraversa più dritta (preferendo le superstrade e gli anelli delle
   * rotatorie). Chi arriva da lì ha la precedenza.
   * @param {number} id
   * @returns {Set<number>}
   */
  mainRoad(id) {
    this.refresh();
    const cached = this.mains.get(id);
    if (cached) return cached;
    const center = node(this.graph, id);
    const around = [...this.graph.edges.values()].filter((e) => e.a === id || e.b === id);
    let best = new Set();
    let bestScore = -Infinity;
    for (let i = 0; i < around.length; i++) {
      for (let j = i + 1; j < around.length; j++) {
        const p = node(this.graph, around[i].a === id ? around[i].b : around[i].a);
        const q = node(this.graph, around[j].a === id ? around[j].b : around[j].a);
        const da = Math.atan2(p.y - center.y, p.x - center.x);
        const db = Math.atan2(q.y - center.y, q.x - center.x);
        let diff = Math.abs(da - db) % (2 * Math.PI);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        // 1 se le due strade sono una il proseguimento dell'altra, 0 se ad angolo retto o meno.
        let score = Math.max(0, (diff - Math.PI / 2) / (Math.PI / 2));
        for (const e of [around[i], around[j]]) {
          if (e.kind === 'super') score += 0.6;
          if (e.ring) score += 2;
        }
        if (score > bestScore) {
          bestScore = score;
          best = new Set([p.id, q.id]);
        }
      }
    }
    this.mains.set(id, best);
    return best;
  }

  /**
   * Quanto la corsia si ferma prima del centro del nodo.
   * @param {number} id
   */
  nodeRadius(id) {
    const n = node(this.graph, id);
    if (n.stationId !== undefined) return STATION_TURN_RADIUS;
    const d = this.degree.get(id) ?? 0;
    if (d >= 3) return JUNCTION_RADIUS;
    if (d === 2) return BEND_RADIUS;
    return 0;
  }
}

/**
 * Posizione e direzione a distanza s dall'inizio del pezzo.
 * @param {Piece} piece
 * @param {number} s
 * @returns {{x: number, y: number, dx: number, dy: number}}
 */
export function pointOnPiece(piece, s) {
  const { points, lengths } = piece;
  let i = 1;
  while (i < points.length - 1 && lengths[i] < s) i++;
  const a = points[i - 1];
  const b = points[i];
  const span = lengths[i] - lengths[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - lengths[i - 1]) / span));
  const d = direction(a, b);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: d.x, dy: d.y };
}

/**
 * La distanza dall'inizio del pezzo del punto più vicino a p (pezzi dritti).
 * @param {Piece} piece
 * @param {Point} p
 */
export function projectOnLane(piece, p) {
  const [a, b] = piece.points;
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2;
  return Math.max(0, Math.min(1, t)) * piece.length;
}

/**
 * @param {string} key
 * @param {'lane' | 'turn'} kind
 * @param {Point[]} points
 * @param {number} nodeId
 * @param {number} angle
 * @param {boolean} guarded
 * @returns {Piece}
 */
function makePiece(key, kind, points, nodeId, angle, guarded) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { key, kind, points, lengths, length: lengths[lengths.length - 1], node: nodeId, angle, guarded, elevated: false, fast: false, from: -1, to: -1 };
}

/**
 * @param {Point} a
 * @param {Point} b
 */
function direction(a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

/**
 * @param {RoadGraph} graph
 * @param {number} id
 */
function node(graph, id) {
  const n = graph.nodes.get(id);
  if (!n) throw new Error(`Nodo ${id} inesistente`);
  return n;
}
