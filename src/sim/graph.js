// Grafo stradale: nodi (punti) e archi (tratti di strada fra due nodi).
// Le coordinate sono in unità di mondo; il modulo non sa nulla del disegno.

import { closestPointOnSegment } from './geometry.js';

/** Larghezza di una strada in unità di mondo (due corsie). */
export const ROAD_WIDTH = 24;

/**
 * @typedef {Object} RoadNode
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} [stationId]  presente se il nodo è una stazione
 * @property {{partner: number, upper: boolean}} [overpass]
 *   presente se il nodo è metà di un cavalcavia: due nodi nello stesso punto,
 *   uno per la strada di sotto e uno per quella di sopra, che non si toccano
 */

/**
 * @typedef {Object} RoadEdge
 * @property {number} id
 * @property {number} a  id del nodo di partenza
 * @property {number} b  id del nodo di arrivo
 * @property {number} [cost]  tratti di strada pagati per questo arco (anche frazioni)
 * @property {number} [bridgeId]  presente se l'arco fa parte di un ponte
 * @property {boolean} [oneWay]  senso unico: si percorre solo da `a` verso `b`
 * @property {'super'} [kind]    superstrada: più veloce, con la precedenza
 * @property {number} [superPaid]  tratti pagati in più per farne una superstrada
 */

export class RoadGraph {
  constructor() {
    /** @type {Map<number, RoadNode>} */
    this.nodes = new Map();
    /** @type {Map<number, RoadEdge>} */
    this.edges = new Map();
    this.nextId = 1;
    /** Cresce a ogni modifica delle strade: chi usa il grafo capisce se è cambiato. */
    this.version = 0;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {RoadNode}
   */
  addNode(x, y) {
    const node = { id: this.nextId++, x, y };
    this.nodes.set(node.id, node);
    return node;
  }

  /**
   * Collega due nodi. Non crea archi doppi né archi da un nodo a sé stesso.
   * @param {number} a
   * @param {number} b
   * @returns {RoadEdge | null}
   */
  addEdge(a, b) {
    if (a === b || this.hasEdge(a, b)) return null;
    const edge = { id: this.nextId++, a, b };
    this.edges.set(edge.id, edge);
    this.version++;
    return edge;
  }

  /**
   * @param {number} a
   * @param {number} b
   * @returns {boolean}
   */
  hasEdge(a, b) {
    for (const e of this.edges.values()) {
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return true;
    }
    return false;
  }

  /**
   * L'arco fra due nodi, in qualsiasi verso, oppure null.
   * @param {number} a
   * @param {number} b
   * @returns {RoadEdge | null}
   */
  getEdge(a, b) {
    for (const e of this.edges.values()) {
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
    }
    return null;
  }

  /**
   * true se si può andare da a verso b (c'è la strada e non è contromano).
   * @param {number} a
   * @param {number} b
   */
  canTravel(a, b) {
    const e = this.getEdge(a, b);
    return e !== null && (!e.oneWay || e.a === a);
  }

  /**
   * Copia sensi unici e tipo di strada da un arco a uno nuovo con lo stesso verso.
   * @param {RoadEdge} from
   * @param {RoadEdge | null} to
   */
  copyRoadKind(from, to) {
    if (!to) return;
    if (from.oneWay) to.oneWay = true;
    if (from.kind) to.kind = from.kind;
  }

  /** @param {number} edgeId */
  removeEdge(edgeId) {
    if (this.edges.delete(edgeId)) this.version++;
  }

  /**
   * Spezza un arco in due inserendo un nuovo nodo in (x, y).
   * @param {number} edgeId
   * @param {number} x
   * @param {number} y
   * @returns {RoadNode}
   */
  splitEdge(edgeId, x, y) {
    const edge = this.edges.get(edgeId);
    if (!edge) throw new Error(`Arco ${edgeId} inesistente`);
    this.edges.delete(edgeId);
    const node = this.addNode(x, y);
    const first = this.addEdge(edge.a, node.id);
    const second = this.addEdge(node.id, edge.b);
    // Quanto pagato si divide fra le due metà in proporzione alla lunghezza.
    if (first && second) {
      const a = /** @type {RoadNode} */ (this.nodes.get(edge.a));
      const b = /** @type {RoadNode} */ (this.nodes.get(edge.b));
      const share = Math.hypot(x - a.x, y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
      if (edge.cost) {
        first.cost = edge.cost * share;
        second.cost = edge.cost - first.cost;
      }
      if (edge.superPaid) {
        first.superPaid = edge.superPaid * share;
        second.superPaid = edge.superPaid - first.superPaid;
      }
    }
    if (edge.bridgeId !== undefined && first && second) first.bridgeId = second.bridgeId = edge.bridgeId;
    this.copyRoadKind(edge, first);
    this.copyRoadKind(edge, second);
    return node;
  }

  /**
   * Il punto più vicino a (x, y) su un arco, entro `radius`, oppure null.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {{edge: RoadEdge, x: number, y: number} | null}
   */
  findEdgeNear(x, y, radius) {
    let best = null;
    let bestDist = radius;
    for (const e of this.edges.values()) {
      const a = this.nodes.get(e.a);
      const b = this.nodes.get(e.b);
      if (!a || !b) continue;
      const c = closestPointOnSegment({ x, y }, a, b);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= bestDist) {
        best = { edge: e, x: c.x, y: c.y };
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Il nodo più vicino a (x, y) entro `radius`, oppure null.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {boolean} [stationsOnly]  considera solo i nodi delle stazioni
   * @returns {RoadNode | null}
   */
  findNodeNear(x, y, radius, stationsOnly = false) {
    let best = null;
    let bestDist = radius * radius;
    for (const n of this.nodes.values()) {
      if (stationsOnly && n.stationId === undefined) continue;
      // Ai cavalcavia non ci si aggancia: non sono incroci.
      if (n.overpass) continue;
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d <= bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }
}
