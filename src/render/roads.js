// Disegno delle strade e dell'anteprima del tratto in corso.

import { ROAD_WIDTH } from '../sim/graph.js';

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */

const ROAD_COLOR = '#5d6169';
const PREVIEW_COLOR = 'rgba(93, 97, 105, 0.4)';
const BLOCKED_COLOR = 'rgba(224, 69, 58, 0.45)';
const REMOVAL_COLOR = 'rgba(224, 69, 58, 0.85)';
/** Opacità massima della velatura rossa del traffico: tenue, come richiesto. */
const TRAFFIC_TINT = 0.32;
const LANE_MARK = 'rgba(255, 255, 255, 0.35)';
const BRIDGE_RAIL = '#44474e';
const OVERPASS_DECK = '#6c7078';
const OVERPASS_SHADOW = 'rgba(0, 0, 0, 0.22)';
const BRIDGE_DECK = '#8b8f97';
const WATER_COLOR = '#a7d0ea';
const WATER_BANK = '#86b7d6';
const LABEL_COLOR = '#3d4047';
const BLOCKED_TEXT = '#c0392b';
/** @type {Record<import('../sim/roadBuilder.js').CutReason, string>} */
const CUT_LABELS = {
  roads: 'Strade finite',
  bridges: 'Servono ponti',
  long: 'Ponte troppo lungo',
  water: 'Non si finisce in acqua',
  sea: 'Non si costruisce sul mare',
  outside: 'Fuori città',
};
/** Il numero del costo sta sopra il dito, per non restare coperto. */
const LABEL_OFFSET = 34;
/** Larghezza di vista a cui le scritte hanno la loro grandezza normale. */
const BASE_VIEW_WIDTH = 520;
const OUTSIDE_VEIL = 'rgba(242, 239, 232, 0.6)';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {Map<string, number>} [congestion]  traffico lento per coppia di nodi "a_b", 0..1
 */
export function drawRoads(ctx, graph, congestion) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const edges = [...graph.edges.values()];
  const bridges = edges.filter((e) => e.bridgeId !== undefined);
  strokeEdges(ctx, graph, edges, ROAD_WIDTH, ROAD_COLOR);
  // Ponti: impalcato più chiaro fra due parapetti scuri.
  ctx.lineCap = 'butt';
  strokeEdges(ctx, graph, bridges, ROAD_WIDTH + 6, BRIDGE_RAIL);
  strokeEdges(ctx, graph, bridges, ROAD_WIDTH - 2, BRIDGE_DECK);
  ctx.lineCap = 'round';

  // Traffico: una velatura rossa leggera dove i veicoli vanno piano.
  if (!congestion || congestion.size === 0) return;
  ctx.lineWidth = ROAD_WIDTH;
  for (const e of edges) {
    const c = congestion.get(e.a < e.b ? `${e.a}_${e.b}` : `${e.b}_${e.a}`);
    if (!c || c < 0.05) continue;
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    ctx.strokeStyle = `rgba(214, 84, 70, ${(TRAFFIC_TINT * Math.min(1, c)).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/**
 * La strada di sopra dei cavalcavia: ombra sulla strada di sotto, parapetti e
 * impalcato. Va disegnata dopo i veicoli che passano sotto e prima di quelli sopra.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 */
export function drawOverpasses(ctx, graph) {
  const upper = [...graph.edges.values()].filter((e) => graph.nodes.get(e.a)?.overpass?.upper || graph.nodes.get(e.b)?.overpass?.upper);
  if (upper.length === 0) return;
  ctx.lineCap = 'butt';
  ctx.save();
  ctx.translate(2.5, 3.5);
  strokeEdges(ctx, graph, upper, ROAD_WIDTH + 6, OVERPASS_SHADOW);
  ctx.restore();
  strokeEdges(ctx, graph, upper, ROAD_WIDTH + 5, BRIDGE_RAIL);
  strokeEdges(ctx, graph, upper, ROAD_WIDTH - 1, OVERPASS_DECK);
  ctx.lineCap = 'round';
  ctx.strokeStyle = LANE_MARK;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  for (const e of upper) {
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Le linee bianche tratteggiate fra le due corsie.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 */
export function drawLaneMarks(ctx, graph) {
  ctx.strokeStyle = LANE_MARK;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  for (const e of graph.edges.values()) {
    if (e.bridgeId !== undefined) continue;
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Fiumi: fascia azzurra con le rive un po' più scure.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../sim/water.js').Water[]} waters
 */
export function drawWater(ctx, waters) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Prima le rive di tutto (fiumi e mare), poi l'acqua sopra: dove il fiume
  // sfocia nel mare non resta una riva in mezzo.
  for (const [extra, color] of /** @type {[number, string][]} */ ([[6, WATER_BANK], [0, WATER_COLOR]])) {
    for (const w of waters) {
      ctx.beginPath();
      ctx.moveTo(w.points[0].x, w.points[0].y);
      for (const p of w.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = color;
      if (w.kind === 'river') {
        ctx.lineWidth = w.width + extra;
        ctx.stroke();
      } else {
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        if (extra) {
          ctx.lineWidth = extra;
          ctx.stroke();
        }
      }
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {import('../sim/graph.js').RoadEdge[]} edges
 * @param {number} width
 * @param {string} color
 */
function strokeEdges(ctx, graph, edges, width, color) {
  if (edges.length === 0) return;
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const e of edges) {
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

/**
 * Anteprima del tratto in corso: grigia fin dove bastano le strade, rossa
 * oltre. Vicino al dito mostra quanti tratti costerà.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} points
 * @param {import('../sim/roadBuilder.js').RoadPlan['cut']} cut
 * @param {number} cost  tratti di strada che verranno consumati
 * @param {number} bridges  ponti che verranno consumati
 * @param {import('../sim/view.js').Rect} bounds  la vista attuale, per la scritta
 */
export function drawPreview(ctx, points, cut, cost, bridges, bounds) {
  if (points.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ROAD_WIDTH;

  const affordable = cut ? [...points.slice(0, cut.index), cut] : points;
  strokeLine(ctx, affordable, PREVIEW_COLOR);
  if (cut) strokeLine(ctx, [cut, ...points.slice(cut.index)], BLOCKED_COLOR);

  const tip = points[points.length - 1];
  const spent = [cost > 0 ? `−${cost}` : '', bridges > 0 ? `${bridges} ${bridges === 1 ? 'ponte' : 'ponti'}` : '']
    .filter(Boolean)
    .join(' · ');
  const label = cut ? CUT_LABELS[cut.reason] : spent;
  if (label) drawFingerLabel(ctx, label, tip, bounds, cut ? BLOCKED_TEXT : LABEL_COLOR);
}

/**
 * Scritta sopra il dito, sempre della stessa grandezza sullo schermo anche
 * quando la vista si allarga, e tenuta dentro la vista.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {{x: number, y: number}} finger
 * @param {import('../sim/view.js').Rect} bounds  la vista attuale
 * @param {string} color
 */
function drawFingerLabel(ctx, text, finger, bounds, color) {
  const k = bounds.width / BASE_VIEW_WIDTH;
  ctx.font = `bold ${15 * k}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  const half = ctx.measureText(text).width / 2 + 6 * k;
  const x = Math.max(bounds.x + half, Math.min(bounds.x + bounds.width - half, finger.x));
  const y = finger.y - LABEL_OFFSET * k;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * Schiarisce tutto ciò che sta fuori dalla parte visibile della città.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width: number, height: number}} world
 * @param {import('../sim/view.js').Rect} visible
 */
export function drawOutsideVeil(ctx, world, visible) {
  const pad = Math.max(world.width, world.height);
  ctx.fillStyle = OUTSIDE_VEIL;
  ctx.beginPath();
  ctx.rect(-pad, -pad, world.width + 2 * pad, world.height + 2 * pad);
  ctx.rect(visible.x, visible.y, visible.width, visible.height);
  ctx.fill('evenodd');
}

/**
 * Il pezzo di strada che sta per essere rimosso, in rosso, con i tratti
 * che verranno restituiti.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {import('../sim/roadEditing.js').RoadPiece} piece
 * @param {number} refund
 * @param {{x: number, y: number}} finger
 * @param {import('../sim/view.js').Rect} bounds  la vista attuale, per la scritta
 */
export function drawRemoval(ctx, graph, piece, refund, finger, bounds) {
  ctx.lineCap = 'round';
  ctx.lineWidth = ROAD_WIDTH;
  ctx.strokeStyle = REMOVAL_COLOR;
  ctx.beginPath();
  for (const id of piece.edgeIds) {
    const e = graph.edges.get(id);
    const a = e && graph.nodes.get(e.a);
    const b = e && graph.nodes.get(e.b);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  drawFingerLabel(ctx, `Rimuovi +${refund}`, finger, bounds, BLOCKED_TEXT);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} points
 * @param {string} color
 */
function strokeLine(ctx, points, color) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}
