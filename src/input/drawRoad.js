// Gesto "trascina = strada": raccoglie i punti del dito e, al rilascio,
// li trasforma in una catena di nodi e archi nel grafo.

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */
/** @typedef {{x: number, y: number}} Point */

/** Distanza minima fra due punti campionati del tratto. */
const SAMPLE_SPACING = 24;
/** Entro questa distanza un estremo del tratto si aggancia a un nodo esistente. */
const SNAP_RADIUS = 22;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {RoadGraph} graph
 * @returns {{ preview: () => Point[] }} i punti del tratto in corso, per l'anteprima
 */
export function attachRoadDrawing(canvas, graph) {
  /** @type {number | null} */
  let activePointer = null;
  /** @type {Point[]} */
  let points = [];
  /** @type {Point | null} */
  let cursor = null;

  /** @param {PointerEvent} e */
  const toPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    // Un dito solo: i gesti a più dita arriveranno più avanti.
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    const snap = graph.findNodeNear(p.x, p.y, SNAP_RADIUS);
    points = [snap ? { x: snap.x, y: snap.y } : p];
    cursor = p;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return;
    const p = toPoint(e);
    cursor = p;
    const last = points[points.length - 1];
    if (dist(p, last) >= SAMPLE_SPACING) points.push(p);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointer) return;
    const p = toPoint(e);
    if (dist(p, points[points.length - 1]) >= SAMPLE_SPACING / 2) points.push(p);
    commitStroke(graph, points);
    reset();
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointer) reset();
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function reset() {
    activePointer = null;
    points = [];
    cursor = null;
  }

  return {
    preview: () => (cursor && points.length ? [...points, cursor] : []),
  };
}

/**
 * Aggiunge il tratto al grafo. Se l'inizio o la fine cadono vicino a un nodo
 * esistente, il tratto si collega a quel nodo (incrocio semplice).
 * @param {RoadGraph} graph
 * @param {Point[]} points
 */
function commitStroke(graph, points) {
  if (points.length < 2) return;
  const first = points[0];
  const last = points[points.length - 1];
  const startNode = graph.findNodeNear(first.x, first.y, SNAP_RADIUS);
  const endNode = graph.findNodeNear(last.x, last.y, SNAP_RADIUS);

  // Scarta i punti che cadono dentro il raggio di aggancio degli estremi.
  let from = 1;
  let to = points.length - 1;
  if (startNode) {
    while (from < points.length && dist(points[from], startNode) <= SNAP_RADIUS) from++;
  } else {
    from = 0;
  }
  if (endNode) {
    while (to >= from && dist(points[to], endNode) <= SNAP_RADIUS) to--;
  }

  /** @type {number[]} */
  const ids = [];
  if (startNode) ids.push(startNode.id);
  for (let i = from; i <= to; i++) ids.push(graph.addNode(points[i].x, points[i].y).id);
  if (endNode) ids.push(endNode.id);

  for (let i = 1; i < ids.length; i++) graph.addEdge(ids[i - 1], ids[i]);
}

/**
 * @param {Point} a
 * @param {Point} b
 */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
