// Grafo stradale: nodi (punti) e archi (tratti di strada fra due nodi).
// Le coordinate sono in unità di mondo; il modulo non sa nulla del disegno.

/**
 * @typedef {Object} RoadNode
 * @property {number} id
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} RoadEdge
 * @property {number} id
 * @property {number} a  id del nodo di partenza
 * @property {number} b  id del nodo di arrivo
 */

export class RoadGraph {
  constructor() {
    /** @type {Map<number, RoadNode>} */
    this.nodes = new Map();
    /** @type {Map<number, RoadEdge>} */
    this.edges = new Map();
    this.nextId = 1;
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
   * Il nodo più vicino a (x, y) entro `radius`, oppure null.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {RoadNode | null}
   */
  findNodeNear(x, y, radius) {
    let best = null;
    let bestDist = radius * radius;
    for (const n of this.nodes.values()) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d <= bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }
}
