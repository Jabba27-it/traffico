// Disegno delle strade e dell'anteprima del tratto in corso.
// Le strade si disegnano come catene continue da un incrocio all'altro, con
// curve morbide che passano per gli stessi punti della simulazione.

import { ROAD_WIDTH } from '../sim/graph.js';
import { STYLE } from './style.js';

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */
/** @typedef {import('../sim/graph.js').RoadEdge} RoadEdge */
/** @typedef {{x: number, y: number}} Point */

/** Opacità massima della velatura rossa del traffico: tenue, come richiesto. */
const TRAFFIC_TINT = 0.32;
/** Il numero del costo sta sopra il dito, per non restare coperto. */
const LABEL_OFFSET = 34;
/** Larghezza di vista a cui le scritte hanno la loro grandezza normale. */
const BASE_VIEW_WIDTH = 520;

/**
 * @typedef {Object} Chain  una fila di archi dello stesso tipo, fra due incroci
 * @property {Point[]} points
 * @property {RoadEdge[]} edges
 * @property {boolean} super
 * @property {boolean} bridge
 * @property {boolean} oneWay
 */

/** @type {{version: number, chains: Chain[]}} */
let chainCache = { version: -1, chains: [] };

/**
 * Le catene di strada, ricalcolate solo quando le strade cambiano.
 * @param {RoadGraph} graph
 * @returns {Chain[]}
 */
function roadChains(graph) {
  if (chainCache.version === graph.version) return chainCache.chains;
  /** @type {Map<number, RoadEdge[]>} */
  const byNode = new Map();
  for (const e of graph.edges.values()) {
    for (const id of [e.a, e.b]) {
      if (!byNode.has(id)) byNode.set(id, []);
      /** @type {RoadEdge[]} */ (byNode.get(id)).push(e);
    }
  }
  const kindOf = (/** @type {RoadEdge} */ e) => `${e.kind ?? ''}|${e.bridgeId !== undefined}|${Boolean(e.oneWay)}`;
  const passThrough = (/** @type {number} */ id, /** @type {string} */ kind) => {
    const n = graph.nodes.get(id);
    const around = byNode.get(id) ?? [];
    return n !== undefined && n.stationId === undefined && around.length === 2 && around.every((e) => kindOf(e) === kind);
  };

  /** @type {Set<RoadEdge>} */
  const seen = new Set();
  /** @type {Chain[]} */
  const chains = [];
  for (const start of graph.edges.values()) {
    if (seen.has(start)) continue;
    const kind = kindOf(start);
    seen.add(start);
    /** @type {number[]} */
    let ids = [start.a, start.b];
    const edges = [start];
    // Si allunga la fila in avanti e indietro finché i nodi sono semplici passaggi.
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? ids[ids.length - 1] : ids[0];
        if (!passThrough(end, kind)) break;
        const next = /** @type {RoadEdge[]} */ (byNode.get(end)).find((e) => !seen.has(e));
        if (!next) break;
        seen.add(next);
        edges.push(next);
        const other = next.a === end ? next.b : next.a;
        ids = forward ? [...ids, other] : [other, ...ids];
      }
    }
    const points = ids.map((id) => graph.nodes.get(id)).filter((n) => n !== undefined);
    chains.push({ points, edges, super: start.kind === 'super', bridge: start.bridgeId !== undefined, oneWay: Boolean(start.oneWay) });
  }
  chainCache = { version: graph.version, chains };
  return chains;
}

/**
 * Traccia una linea morbida che passa per i punti (curve a metà fra un punto e l'altro).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} points
 */
export function traceSmooth(ctx, points) {
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

/**
 * Come traceSmooth, ma per un contorno chiuso.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} points
 */
export function traceSmoothClosed(ctx, points) {
  const n = points.length;
  if (n < 3) return;
  const mid = (/** @type {number} */ i) => ({
    x: (points[i % n].x + points[(i + 1) % n].x) / 2,
    y: (points[i % n].y + points[(i + 1) % n].y) / 2,
  });
  const start = mid(0);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i <= n; i++) {
    const p = points[i % n];
    const m = mid(i);
    ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
  }
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Chain[]} chains
 * @param {number} width
 * @param {string} color
 */
function strokeChains(ctx, chains, width, color) {
  if (chains.length === 0) return;
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const c of chains) traceSmooth(ctx, c.points);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {Map<string, number>} [congestion]  traffico lento per coppia di nodi "a_b", 0..1
 */
export function drawRoads(ctx, graph, congestion) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const chains = roadChains(graph);
  const supers = chains.filter((c) => c.super);
  const bridges = chains.filter((c) => c.bridge);
  // Superstrade: un bordo dorato sotto, così si riconoscono a colpo d'occhio.
  strokeChains(ctx, supers, ROAD_WIDTH + 4, STYLE.superEdge);
  strokeChains(ctx, chains, ROAD_WIDTH, STYLE.road);
  strokeChains(ctx, supers, ROAD_WIDTH - 3, STYLE.superRoad);
  // Ponti: impalcato più chiaro fra due parapetti scuri.
  ctx.lineCap = 'butt';
  strokeChains(ctx, bridges, ROAD_WIDTH + 6, STYLE.bridgeRail);
  strokeChains(ctx, bridges, ROAD_WIDTH - 2, STYLE.bridgeDeck);
  ctx.lineCap = 'round';
  drawOneWayArrows(ctx, graph, [...graph.edges.values()].filter((e) => e.oneWay));

  // Traffico: una velatura rossa leggera dove i veicoli vanno piano.
  if (!congestion || congestion.size === 0) return;
  ctx.lineWidth = ROAD_WIDTH;
  for (const e of graph.edges.values()) {
    const c = congestion.get(e.a < e.b ? `${e.a}_${e.b}` : `${e.b}_${e.a}`);
    if (!c || c < 0.05) continue;
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    ctx.strokeStyle = `rgba(${STYLE.trafficTint}, ${(TRAFFIC_TINT * Math.min(1, c)).toFixed(3)})`;
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
  /** @type {Chain[]} */
  const decks = [];
  for (const n of graph.nodes.values()) {
    if (!n.overpass?.upper) continue;
    const around = [...graph.edges.values()].filter((e) => e.a === n.id || e.b === n.id);
    if (around.length !== 2) continue;
    const ends = around.map((e) => graph.nodes.get(e.a === n.id ? e.b : e.a));
    if (!ends[0] || !ends[1]) continue;
    decks.push({ points: [ends[0], n, ends[1]], edges: around, super: false, bridge: false, oneWay: false });
  }
  if (decks.length === 0) return;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(2.5, 3.5);
  strokeChains(ctx, decks, ROAD_WIDTH + 6, STYLE.overpassShadow);
  ctx.restore();
  strokeChains(ctx, decks, ROAD_WIDTH + 5, STYLE.bridgeRail);
  strokeChains(ctx, decks, ROAD_WIDTH - 1, STYLE.overpassDeck);
  ctx.lineCap = 'round';
  ctx.strokeStyle = STYLE.laneMark;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  for (const d of decks) traceSmooth(ctx, d.points);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Frecce sui sensi unici: una ogni due archi circa, nel verso di marcia.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {RoadEdge[]} edges
 */
function drawOneWayArrows(ctx, graph, edges) {
  ctx.fillStyle = STYLE.arrow;
  for (const e of edges) {
    if (e.id % 2) continue; // non su ogni arco: sarebbero troppe
    const a = graph.nodes.get(e.a);
    const b = graph.nodes.get(e.b);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.beginPath();
    ctx.moveTo(mx + dx * 5, my + dy * 5);
    ctx.lineTo(mx - dx * 3 - dy * 4.5, my - dy * 3 + dx * 4.5);
    ctx.lineTo(mx - dx * 1, my - dy * 1);
    ctx.lineTo(mx - dx * 3 + dy * 4.5, my - dy * 3 - dx * 4.5);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Le linee tratteggiate fra le due corsie.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 */
export function drawLaneMarks(ctx, graph) {
  ctx.strokeStyle = STYLE.laneMark;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  // I sensi unici hanno una corsia sola, i ponti hanno il loro impalcato: niente linea in mezzo.
  for (const c of roadChains(graph)) if (!c.bridge && !c.oneWay) traceSmooth(ctx, c.points);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Fiumi e mare, con le rive morbide. Il mare ha anche una striscia di spiaggia.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../sim/water.js').Water[]} waters
 */
export function drawWater(ctx, waters) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const w of waters) {
    if (w.kind !== 'sea' || !w.beach) continue;
    ctx.beginPath();
    traceSmoothClosed(ctx, w.points);
    ctx.lineWidth = 22;
    ctx.strokeStyle = STYLE.beach;
    ctx.stroke();
  }
  // Prima le rive di tutto (fiumi e mare), poi l'acqua sopra: dove il fiume
  // sfocia nel mare non resta una riva in mezzo.
  for (const [extra, color] of /** @type {[number, string][]} */ ([[6, STYLE.waterBank], [0, STYLE.water]])) {
    for (const w of waters) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      if (w.kind === 'river') {
        traceSmooth(ctx, w.points);
        ctx.lineWidth = w.width + extra;
        ctx.stroke();
      } else {
        traceSmoothClosed(ctx, w.points);
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
 * Anteprima del tratto in corso: grigia fin dove bastano le strade, rossa
 * oltre. Vicino al dito mostra quanti tratti costerà.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} points
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
  strokeLine(ctx, affordable, STYLE.preview);
  if (cut) strokeLine(ctx, [cut, ...points.slice(cut.index)], STYLE.blocked);

  const tip = points[points.length - 1];
  const spent = [cost > 0 ? `−${cost}` : '', bridges > 0 ? `${bridges} ${bridges === 1 ? 'ponte' : 'ponti'}` : '']
    .filter(Boolean)
    .join(' · ');
  // Se il tratto si ferma basta il rosso: il motivo lo spiega un riquadro quando si alza il dito.
  if (!cut && spent) drawFingerLabel(ctx, spent, tip, bounds, STYLE.label);
}

/**
 * Scritta sopra il dito, sempre della stessa grandezza sullo schermo anche
 * quando la vista si allarga, e tenuta dentro la vista.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {Point} finger
 * @param {import('../sim/view.js').Rect} bounds  la vista attuale
 * @param {string} color
 */
function drawFingerLabel(ctx, text, finger, bounds, color) {
  const k = bounds.width / BASE_VIEW_WIDTH;
  ctx.font = `bold ${15 * k}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = 'rgba(255, 252, 245, 0.92)';
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
  ctx.fillStyle = STYLE.outsideVeil;
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
 * @param {Point} finger
 * @param {import('../sim/view.js').Rect} bounds  la vista attuale, per la scritta
 */
export function drawRemoval(ctx, graph, piece, refund, finger, bounds) {
  ctx.lineCap = 'round';
  ctx.lineWidth = ROAD_WIDTH;
  ctx.strokeStyle = STYLE.removal;
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

  drawFingerLabel(ctx, `Rimuovi +${refund}`, finger, bounds, STYLE.blockedText);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} points
 * @param {string} color
 */
function strokeLine(ctx, points, color) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.beginPath();
  traceSmooth(ctx, points);
  ctx.stroke();
}
