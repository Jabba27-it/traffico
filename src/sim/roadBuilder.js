// Trasforma un tratto disegnato (lista di punti) in nodi e archi del grafo,
// creando gli incroci dove il tratto tocca o attraversa strade esistenti
// e facendolo entrare nelle stazioni su cui passa.

import { closestPointOnSegment, distance, segmentIntersection } from './geometry.js';
import { STATION_RADIUS } from './stations.js';
import { ROAD_WIDTH } from './graph.js';
import { isInWater, lengthInWater, touchesSea, riverWidthsAlong } from './water.js';
import { obstacleAt } from './terrain.js';
import { STATION_CLEARANCE } from './growth.js';

/** Margine in più intorno alla stazione in anteprima: il tratto si ferma fra due punti disegnati. */
const UPCOMING_MARGIN = 4;

/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./graph.js').RoadNode} RoadNode */
/** @typedef {{x: number, y: number}} Point */

/** Un incrocio che cade così vicino a un nodo esistente riusa quel nodo. */
const MERGE_RADIUS = 12;
/** Un tratto che passa così vicino all'estremità di una strada (le due si toccano a vista) vi si collega. */
const DEAD_END_RADIUS = ROAD_WIDTH;
/**
 * Quanto l'asse di una strada deve stare lontano da parchi e monumenti: un po'
 * meno di mezza strada, così il bordo della strada può sfiorare il bordo del verde.
 */
const OBSTACLE_MARGIN = ROAD_WIDTH / 2 - 3;
/** Sotto questa distanza fra dove la strada nuova sale su una esistente e dove ne scende, è un attraversamento. */
const CROSSING_GAP = 50;
/** Un nodo che c'è già così vicino al punto d'incrocio fa da croce, senza farne un altro. */
const CROSSING_SNAP = 1;
/** Da quanto lontano dall'incrocio i due bracci della strada nuova si allineano. */
const CROSSING_ARM = 30;
/** Un estremo del tratto che cade così vicino a una stazione vi si aggancia. */
const STATION_SNAP = STATION_RADIUS + 8;

/**
 * Perché il tratto disegnato è stato troncato:
 * 'roads' tratti finiti, 'bridges' ponti finiti, 'long' ponte troppo lungo,
 * 'water' il tratto finisce in acqua, 'sea' il tratto entra nel mare,
 * 'outside' il tratto esce dalla parte visibile della città,
 * 'villa' e 'monument' il tratto entra in una villa o su un monumento.
 * @typedef {'roads' | 'bridges' | 'long' | 'water' | 'sea' | 'outside' | 'villa' | 'monument' | 'upcoming'} CutReason
 */

/**
 * @typedef {Object} RoadPlan
 * @property {Point[][]} runs  i pezzi di strada nuova da costruire
 * @property {number} length   lunghezza totale della strada nuova
 * @property {number} bridges  ponti nuovi che verranno costruiti
 * @property {{index: number, x: number, y: number, reason: CutReason} | null} cut
 *   dove il tratto disegnato è stato troncato: il punto di taglio cade fra
 *   points[index - 1] e points[index]
 */

/**
 * @typedef {Object} RoadLimits
 * @property {number} maxLength  strada nuova costruibile con i tratti disponibili
 * @property {number} bridges    ponti disponibili
 * @property {Water[]} waters
 * @property {{x: number, y: number, width: number, height: number}} bounds  dove si può costruire
 * @property {import('./terrain.js').Terrain} terrain  ville e monumenti, dove non si costruisce
 * @property {Point[]} [upcoming]  le stazioni in anteprima: il loro posto è riservato
 */

/** @typedef {import('./water.js').Water} Water */

/**
 * Divide il tratto disegnato in pezzi di strada nuova, saltando le parti che
 * passano sopra strade o stazioni esistenti (quelle non costano nulla), e lo
 * tronca dove finiscono i tratti o i ponti, o dove un ponte sarebbe troppo lungo.
 * Un ponte non viene mai lasciato a metà: il taglio arretra fino alla riva.
 * @param {RoadGraph} graph
 * @param {Point[]} points
 * @param {RoadLimits} limits
 * @returns {RoadPlan}
 */
export function planRoad(graph, points, limits) {
  const onRoad = points.map(
    (p) => graph.findEdgeNear(p.x, p.y, ROAD_WIDTH / 2) !== null || graph.findNodeNear(p.x, p.y, STATION_RADIUS, true) !== null,
  );
  const wet = points.map((p) => isInWater(limits.waters, p));

  // Il tratto si ferma al primo punto fuori dalla parte visibile della città,
  // o dentro una villa o un monumento (controllando anche a metà di ogni pezzo,
  // perché un monumento piccolo potrebbe cadere fra due punti).
  const b = limits.bounds;
  const blockedAt = (/** @type {Point} */ p, /** @type {number} */ i) => {
    if (p.x < b.x || p.y < b.y || p.x > b.x + b.width || p.y > b.y + b.height) return 'outside';
    const mid = i > 0 ? { x: (p.x + points[i - 1].x) / 2, y: (p.y + points[i - 1].y) / 2 } : p;
    for (const up of limits.upcoming ?? []) {
      if (Math.min(Math.hypot(p.x - up.x, p.y - up.y), Math.hypot(mid.x - up.x, mid.y - up.y)) < STATION_CLEARANCE + UPCOMING_MARGIN) return 'upcoming';
    }
    return obstacleAt(limits.terrain, p, OBSTACLE_MARGIN) ?? obstacleAt(limits.terrain, mid, OBSTACLE_MARGIN);
  };
  const firstBlocked = points.findIndex((p, i) => blockedAt(p, i) !== null);
  const usable = firstBlocked === -1 ? points.length : firstBlocked;
  /** @type {{index: number, x: number, y: number, reason: CutReason} | null} */
  let waterCut = null;
  if (firstBlocked !== -1) {
    const last = points[Math.max(0, firstBlocked - 1)];
    const reason = /** @type {CutReason} */ (blockedAt(points[firstBlocked], firstBlocked));
    waterCut = { index: Math.max(1, firstBlocked), x: last.x, y: last.y, reason };
  }

  // Attraversamenti dell'acqua, nell'ordine del tratto.
  /** @type {{start: number, end: number}[]} indici del primo e dell'ultimo punto in acqua */
  const crossings = [];
  for (let i = 0; i < usable; i++) {
    if (!wet[i]) continue;
    let end = i;
    while (end + 1 < usable && wet[end + 1]) end++;
    const bank = i > 0 ? points[i - 1] : points[0];
    let stopped = false;
    const stop = (/** @type {CutReason} */ reason) => {
      waterCut = { index: Math.max(1, i), x: bank.x, y: bank.y, reason };
      stopped = true;
    };
    if (onRoad.slice(i, end + 1).every(Boolean)) {
      // Si ripassa sopra un ponte che c'è già: gratis.
    } else if (i === 0 || end === usable - 1) {
      stop(touchesSea(limits.waters, points.slice(i, end + 1)) ? 'sea' : 'water');
    } else {
      const span = points.slice(i - 1, end + 2);
      if (touchesSea(limits.waters, span)) stop('sea');
      else if (lengthInWater(limits.waters, span) > 2 * riverWidthsAlong(limits.waters, span)) stop('long');
      else if (crossings.length >= limits.bridges) stop('bridges');
      else crossings.push({ start: i, end });
    }
    if (stopped) break;
    i = end;
  }

  const prefix = waterCut ? points.slice(0, waterCut.index) : points;
  let plan = planBudget(points, prefix.length, onRoad, limits.maxLength);
  let cut = plan.cut ? { ...plan.cut, reason: /** @type {CutReason} */ ('roads') } : waterCut;

  // I tratti sono finiti in mezzo a un ponte: si costruisce solo fino alla riva.
  const broken = plan.cut && crossings.find((c) => plan.cut && plan.cut.index >= c.start && plan.cut.index <= c.end + 1);
  if (broken) {
    plan = planBudget(points, broken.start, onRoad, limits.maxLength);
    const bank = points[broken.start - 1];
    cut = { index: broken.start, x: bank.x, y: bank.y, reason: 'roads' };
  }

  const built = cut ? cut.index : points.length;
  const bridges = crossings.filter((c) => c.end + 1 < built).length;
  return { runs: plan.runs, length: plan.length, bridges, cut };
}

/**
 * La parte di `planRoad` che conta i tratti: considera solo i primi `count`
 * punti e tronca quando la strada nuova supera `maxLength`.
 * @param {Point[]} points
 * @param {number} count
 * @param {boolean[]} onRoad
 * @param {number} maxLength
 * @returns {{runs: Point[][], length: number, cut: {index: number, x: number, y: number} | null}}
 */
function planBudget(points, count, onRoad, maxLength) {
  points = points.slice(0, count);
  // Ogni pezzo è una sequenza di punti fuori strada, più il punto su strada
  // subito prima e subito dopo, che lo agganciano alla rete esistente.
  /** @type {number[][]} */
  const runs = [];
  /** @type {number[] | null} */
  let current = null;
  for (let i = 0; i < points.length; i++) {
    if (!onRoad[i]) {
      if (!current) current = i > 0 ? [i - 1] : [];
      current.push(i);
    } else if (current) {
      current.push(i);
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);

  /** @type {Point[][]} */
  const result = [];
  let length = 0;
  let cut = null;
  for (const run of runs) {
    /** @type {Point[]} */
    const pts = [points[run[0]]];
    for (let k = 1; k < run.length; k++) {
      const a = points[run[k - 1]];
      const b = points[run[k]];
      const d = distance(a, b);
      if (length + d <= maxLength) {
        pts.push(b);
        length += d;
        continue;
      }
      const t = (maxLength - length) / d;
      cut = { index: run[k], x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (t > 0) pts.push({ x: cut.x, y: cut.y });
      length = maxLength;
      break;
    }
    if (pts.length >= 2) result.push(pts);
    if (cut) break;
  }
  return { runs: result, length, cut };
}

/**
 * Costruisce un tratto disegnato già diviso da `planRoad`.
 * @param {RoadGraph} graph
 * @param {RoadPlan} plan
 * @param {number} snapRadius
 */
export function buildPlannedRoad(graph, plan, snapRadius) {
  const runs = plan.runs.map((run) => [...run]);
  // Una strada che ne attraversa un'altra un po' di sbieco ci passa sopra per un
  // pezzetto: entrata e uscita si agganciavano in due punti diversi e nascevano
  // due incroci a T attaccati (lì niente cavalcavia, e il traffico si blocca).
  // Se il pezzo sovrapposto è corto, tutte e due si agganciano a metà: una croce.
  for (let i = 0; i + 1 < runs.length; i++) {
    const a = runs[i][runs[i].length - 1];
    const b = runs[i + 1][0];
    if (distance(a, b) >= CROSSING_GAP) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const near = graph.findNodeNear(mid.x, mid.y, ROAD_WIDTH / 2);
    if (near?.stationId !== undefined) continue; // dentro una stazione si entra e basta
    // Il punto vero dove la linea disegnata taglia la strada: lì nasce il nodo della
    // croce. Agganciandosi al nodo più vicino (fino a 28 unità più in là) la strada
    // nuova si piegava all'incrocio.
    // I due bracci si allineano: un punto della linea un po' prima e uno un po' dopo
    // l'incrocio, e l'incrocio sulla retta che li unisce (il dito che ondeggia
    // proprio lì piegava la strada).
    const before = runs[i].findLastIndex((q) => distance(q, mid) >= CROSSING_ARM);
    const after = runs[i + 1].findIndex((q) => distance(q, mid) >= CROSSING_ARM);
    const from = before >= 0 ? runs[i][before] : a;
    const to = after >= 0 ? runs[i + 1][after] : b;
    let cross = null;
    for (const e of graph.edges.values()) {
      const ea = graph.nodes.get(e.a);
      const eb = graph.nodes.get(e.b);
      const hit = ea && eb ? segmentIntersection(from, to, ea, eb) : null;
      if (!hit) continue;
      const close = graph.findNodeNear(hit.x, hit.y, CROSSING_SNAP);
      cross = close ?? graph.nodes.get(graph.splitEdge(e.id, hit.x, hit.y).id);
      break;
    }
    if (cross) {
      // Fra quei due punti e l'incrocio la strada va dritta.
      if (before >= 0) runs[i] = runs[i].slice(0, before + 1);
      if (after >= 0) runs[i + 1] = runs[i + 1].slice(after);
      runs[i].push({ x: cross.x, y: cross.y });
      runs[i + 1].unshift({ x: cross.x, y: cross.y });
      continue;
    }
    if (!cross) {
      const hit = near ?? graph.findEdgeNear(mid.x, mid.y, ROAD_WIDTH / 2);
      if (!hit) continue;
      cross = { x: hit.x, y: hit.y };
    }
    runs[i][runs[i].length - 1] = { x: cross.x, y: cross.y };
    runs[i + 1][0] = { x: cross.x, y: cross.y };
  }
  for (const run of runs) buildRoad(graph, run, snapRadius);
}

/**
 * @param {RoadGraph} graph
 * @param {Point[]} points
 * @param {number} snapRadius  distanza entro cui un estremo si aggancia a una strada
 */
export function buildRoad(graph, points, snapRadius) {
  if (points.length < 2) return;
  const first = points[0];
  const last = points[points.length - 1];

  const startId = attach(graph, first, snapRadius);
  const startNode = /** @type {RoadNode} */ (graph.nodes.get(startId));
  const endNode = graph.findNodeNear(last.x, last.y, stationSnap(snapRadius), true) ?? graph.findNodeNear(last.x, last.y, snapRadius);
  /** @type {Point} */
  const endPos = endNode ?? graph.findEdgeNear(last.x, last.y, snapRadius) ?? last;

  // Scarta i punti intermedi che cadono dentro il raggio di aggancio degli estremi.
  let from = 1;
  let to = points.length - 2;
  const startReach = reach(startNode, snapRadius);
  const endReach = endNode ? reach(endNode, snapRadius) : snapRadius;
  while (from <= to && distance(points[from], startNode) <= startReach) from++;
  while (to >= from && distance(points[to], endPos) <= endReach) to--;

  let prevId = startId;
  for (let i = from; i <= to; i++) {
    prevId = crossTo(graph, prevId, points[i]);
    const prev = /** @type {RoadNode} */ (graph.nodes.get(prevId));
    // Un punto dentro una stazione appena attraversata non diventa un nodo.
    const limit = prev.stationId !== undefined ? STATION_RADIUS : MERGE_RADIUS;
    if (distance(prev, points[i]) > limit) {
      const id = graph.addNode(points[i].x, points[i].y).id;
      graph.addEdge(prevId, id);
      prevId = id;
    }
  }

  prevId = crossTo(graph, prevId, endPos);
  graph.addEdge(prevId, attach(graph, endPos, snapRadius));
}

/**
 * Il nodo su cui poggia p: una stazione vicina, un nodo vicino, un nuovo nodo
 * a metà di una strada vicina, oppure un nodo nuovo isolato.
 * @param {RoadGraph} graph
 * @param {Point} p
 * @param {number} snapRadius
 * @returns {number}
 */
function attach(graph, p, snapRadius) {
  const node = graph.findNodeNear(p.x, p.y, stationSnap(snapRadius), true) ?? graph.findNodeNear(p.x, p.y, snapRadius);
  if (node) return node.id;
  const hit = graph.findEdgeNear(p.x, p.y, snapRadius);
  if (hit) return graph.splitEdge(hit.edge.id, hit.x, hit.y).id;
  return graph.addNode(p.x, p.y).id;
}

/**
 * @param {RoadNode} node
 * @param {number} snapRadius
 */
function reach(node, snapRadius) {
  return node.stationId !== undefined ? stationSnap(snapRadius) : snapRadius;
}

/**
 * Aggancio alle stazioni: un po' più generoso di quello alle strade.
 * @param {number} snapRadius
 */
function stationSnap(snapRadius) {
  return Math.max(STATION_SNAP, snapRadius);
}

/**
 * Prolunga la strada dal nodo `fromId` verso p, creando un incrocio su ogni
 * strada attraversata, collegando le estremità di strada che sfiora ed entrando
 * nelle stazioni su cui passa. Restituisce l'ultimo nodo raggiunto (p escluso).
 * @param {RoadGraph} graph
 * @param {number} fromId
 * @param {Point} p
 * @returns {number}
 */
function crossTo(graph, fromId, p) {
  const a = /** @type {Point} */ (graph.nodes.get(fromId));
  /** @type {Map<number, number>} */
  const degree = new Map();
  /** @type {Set<number>} */
  const neighbors = new Set();
  /** @type {({edgeId: number, x: number, y: number, t: number} | {nodeId: number, t: number})[]} */
  const hits = [];
  for (const e of graph.edges.values()) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    if (e.a === fromId) neighbors.add(e.b);
    if (e.b === fromId) neighbors.add(e.a);
    if (e.a === fromId || e.b === fromId) continue;
    const ea = graph.nodes.get(e.a);
    const eb = graph.nodes.get(e.b);
    if (!ea || !eb) continue;
    const hit = segmentIntersection(a, p, ea, eb);
    if (!hit) continue;
    // Arrivare su una strada non è attraversarla: l'aggancio lo fa chi chiama.
    if (distance(hit, p) < 1) continue;
    // Dentro una stazione non si creano incroci: ci pensa l'ingresso nella stazione.
    if (insideStation(ea, hit) || insideStation(eb, hit)) continue;
    hits.push({ edgeId: e.id, x: hit.x, y: hit.y, t: hit.t });
  }
  for (const n of graph.nodes.values()) {
    if (n.id === fromId || neighbors.has(n.id)) continue;
    const isStation = n.stationId !== undefined;
    if (!isStation && degree.get(n.id) !== 1) continue;
    const c = closestPointOnSegment(n, a, p);
    const radius = isStation ? STATION_RADIUS : DEAD_END_RADIUS;
    if (c.t > 0 && distance(c, n) <= radius) hits.push({ nodeId: n.id, t: c.t });
  }
  hits.sort((h1, h2) => h1.t - h2.t);

  let prevId = fromId;
  for (const h of hits) {
    const id = 'nodeId' in h ? h.nodeId : crossingNode(graph, h);
    graph.addEdge(prevId, id);
    prevId = id;
  }
  return prevId;
}

/**
 * @param {RoadNode} node
 * @param {Point} p
 */
function insideStation(node, p) {
  return node.stationId !== undefined && distance(node, p) <= STATION_RADIUS;
}

/**
 * @param {RoadGraph} graph
 * @param {{edgeId: number, x: number, y: number}} hit
 * @returns {number}
 */
function crossingNode(graph, hit) {
  const edge = graph.edges.get(hit.edgeId);
  if (!edge) {
    // L'arco è già stato spezzato da un incrocio vicinissimo: riusa quel nodo.
    const near = graph.findNodeNear(hit.x, hit.y, MERGE_RADIUS);
    return near ? near.id : graph.addNode(hit.x, hit.y).id;
  }
  const a = /** @type {RoadNode} */ (graph.nodes.get(edge.a));
  const b = /** @type {RoadNode} */ (graph.nodes.get(edge.b));
  // Ai cavalcavia non ci si collega: si crea un incrocio poco più in là.
  if (distance(hit, a) <= MERGE_RADIUS && !a.overpass) return edge.a;
  if (distance(hit, b) <= MERGE_RADIUS && !b.overpass) return edge.b;
  return graph.splitEdge(edge.id, hit.x, hit.y).id;
}
