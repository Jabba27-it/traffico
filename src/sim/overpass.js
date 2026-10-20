// Cavalcavia: un incrocio a croce diventa due strade che si scavalcano.
// Il nodo dell'incrocio si divide in due nodi nello stesso punto, uno per
// ciascuna strada: i veicoli passano dritti, senza precedenze e senza svoltare.

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./graph.js').RoadNode} RoadNode */
/** @typedef {import('./graph.js').RoadEdge} RoadEdge */

/** Quanto due strade possono piegare all'incrocio ed essere ancora "dritte" (radianti). */
const STRAIGHT_TOLERANCE = 0.7;

/**
 * Le due coppie di strade che attraversano dritte l'incrocio, oppure null se
 * l'incrocio non può diventare cavalcavia (non è una croce, è una stazione...).
 * @param {RoadGraph} graph
 * @param {RoadNode} node
 * @returns {{ pairs: [RoadEdge, RoadEdge][] } | null}
 */
export function overpassPairs(graph, node) {
  if (node.stationId !== undefined || node.overpass) return null;
  const edges = [...graph.edges.values()].filter((e) => e.a === node.id || e.b === node.id);
  if (edges.length !== 4) return null;
  const dir = (/** @type {RoadEdge} */ e) => {
    const other = /** @type {RoadNode} */ (graph.nodes.get(e.a === node.id ? e.b : e.a));
    return Math.atan2(other.y - node.y, other.x - node.x);
  };
  // Si cercano due coppie di strade opposte: ognuna attraversa l'incrocio dritta.
  for (const [i, j, k, l] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
    if (opposite(dir(edges[i]), dir(edges[j])) && opposite(dir(edges[k]), dir(edges[l]))) {
      return { pairs: [[edges[i], edges[j]], [edges[k], edges[l]]] };
    }
  }
  return null;
}

/**
 * Trasforma l'incrocio in cavalcavia: la seconda strada passa sopra.
 * @param {RoadGraph} graph
 * @param {RoadNode} node
 * @returns {boolean} false se l'incrocio non è adatto
 */
export function buildOverpass(graph, node) {
  const found = overpassPairs(graph, node);
  if (!found) return false;
  const upper = graph.addNode(node.x, node.y);
  upper.overpass = { partner: node.id, upper: true };
  node.overpass = { partner: upper.id, upper: false };
  delete node.signal;
  for (const e of found.pairs[1]) moveEdgeEnd(graph, e, node.id, upper.id);
  return true;
}

/**
 * Riporta il cavalcavia a incrocio normale.
 * @param {RoadGraph} graph
 * @param {RoadNode} node  una delle due metà
 */
export function removeOverpass(graph, node) {
  if (!node.overpass) return;
  const partner = graph.nodes.get(node.overpass.partner);
  const lower = node.overpass.upper ? partner : node;
  const upper = node.overpass.upper ? node : partner;
  if (lower && upper) {
    for (const e of [...graph.edges.values()]) {
      if (e.a === upper.id || e.b === upper.id) moveEdgeEnd(graph, e, upper.id, lower.id);
    }
    graph.nodes.delete(upper.id);
  }
  if (lower) delete lower.overpass;
  if (upper) delete upper.overpass;
}

/**
 * Sposta un'estremità dell'arco da un nodo a un altro, tenendo costo e ponte.
 * @param {RoadGraph} graph
 * @param {RoadEdge} e
 * @param {number} from
 * @param {number} to
 */
function moveEdgeEnd(graph, e, from, to) {
  graph.removeEdge(e.id);
  // Stesso verso di prima: conta per i sensi unici.
  const moved = graph.addEdge(e.a === from ? to : e.a, e.b === from ? to : e.b);
  if (moved) {
    if (e.cost) moved.cost = e.cost;
    if (e.bridgeId !== undefined) moved.bridgeId = e.bridgeId;
    graph.copyRoadKind(e, moved);
  }
}

/**
 * @param {number} a  angolo in radianti
 * @param {number} b
 */
function opposite(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return Math.abs(d - Math.PI) < STRAIGHT_TOLERANCE;
}
