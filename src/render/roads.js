// Disegno delle strade e dell'anteprima del tratto in corso.
// Le strade si disegnano come catene continue da un incrocio all'altro, con
// curve morbide che passano per gli stessi punti della simulazione.

import { ROAD_WIDTH } from '../sim/graph.js';
import { STYLE } from './style.js';
import { bridgeColors, drawBridgeDetails, overpassRail, drawOverpassDetails } from './looks.js';
import { distanceToWater } from '../sim/water.js';

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */
/** @typedef {import('../sim/graph.js').RoadEdge} RoadEdge */
/** @typedef {import('../sim/graph.js').RoadNode} RoadNode */
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
  const kindOf = (/** @type {RoadEdge} */ e) => `${e.bridgeId !== undefined}|${Boolean(e.oneWay)}`;
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
    chains.push({ points, edges, bridge: start.bridgeId !== undefined, oneWay: Boolean(start.oneWay) });
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
 * @param {import('../sim/level.js').Look} [look]  stile dei ponti della città
 */
export function drawRoads(ctx, graph, congestion, look) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const chains = roadChains(graph);
  const bridges = chains.filter((c) => c.bridge);
  strokeChains(ctx, chains, ROAD_WIDTH, STYLE.road);
  // Ponti: impalcato più chiaro fra due parapetti. Torri, archi e cavi vanno
  // disegnati dopo i veicoli, con drawBridgeTops, perché i veicoli ci passano sotto.
  const colors = bridgeColors(look);
  ctx.lineCap = 'butt';
  strokeChains(ctx, bridges, ROAD_WIDTH + 6, colors.rail);
  strokeChains(ctx, bridges, ROAD_WIDTH - 2, colors.deck);
  ctx.lineCap = 'round';
  drawOneWayArrows(ctx, graph);

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
 * Quello che sta sopra i ponti (torri, archi, piloni, cavi), nello stile della
 * città: va disegnato dopo i veicoli, che ci passano sotto e spariscono.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {import('../sim/level.js').Look} [look]
 */
export function drawBridgeTops(ctx, graph, look) {
  const bridges = roadChains(graph).filter((c) => c.bridge);
  if (bridges.length === 0) return;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  drawBridgeDetails(ctx, bridges.map((c) => c.points), look);
  ctx.lineCap = 'round';
}

/**
 * La strada di sopra dei cavalcavia: ombra sulla strada di sotto, parapetti e
 * impalcato. Va disegnata dopo i veicoli che passano sotto e prima di quelli sopra.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 * @param {import('../sim/level.js').Look} [look]  stile dei cavalcavia della città
 */
export function drawOverpasses(ctx, graph, look) {
  /** @type {Chain[]} */
  const decks = [];
  for (const n of graph.nodes.values()) {
    if (!n.overpass?.upper) continue;
    const around = [...graph.edges.values()].filter((e) => e.a === n.id || e.b === n.id);
    if (around.length !== 2) continue;
    const ends = around.map((e) => graph.nodes.get(e.a === n.id ? e.b : e.a));
    if (!ends[0] || !ends[1]) continue;
    decks.push({ points: [ends[0], n, ends[1]], edges: around, bridge: false, oneWay: false });
  }
  if (decks.length === 0) return;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(2.5, 3.5);
  strokeChains(ctx, decks, ROAD_WIDTH + 6, STYLE.overpassShadow);
  ctx.restore();
  const points = decks.map((d) => d.points);
  drawOverpassDetails(ctx, points, look, 'under');
  strokeChains(ctx, decks, ROAD_WIDTH + 5, overpassRail(look));
  strokeChains(ctx, decks, ROAD_WIDTH - 1, STYLE.overpassDeck);
  drawOverpassDetails(ctx, points, look, 'over');
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
 * La soluzione di un rompicapo, tratteggiata sopra la mappa: le strade da
 * ricalcare, i punti da toccare (pulsano, col numero di tocchi) e le rotonde col
 * verso in cui disegnarle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../sim/level.js').SolutionStep[]} steps
 * @param {number} time  secondi, per la pulsazione
 */
export function drawSolution(ctx, steps, time) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = STYLE.solution;
  ctx.fillStyle = STYLE.solution;
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -time * 20; // il tratteggio scorre nel verso in cui disegnare
  for (const st of steps) {
    if ('road' in st && st.road.length >= 2) {
      ctx.beginPath();
      st.road.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    } else if ('circle' in st) {
      const { x, y, r, ccw } = st.circle;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      // Una freccia sul cerchio: il verso in cui disegnarlo.
      const a = -Math.PI / 2;
      const tx = Math.cos(a) * r + x, ty = Math.sin(a) * r + y;
      const dir = ccw ? -1 : 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tx - dir * 7, ty - 6);
      ctx.lineTo(tx + dir * 3, ty);
      ctx.lineTo(tx - dir * 7, ty + 6);
      ctx.stroke();
      ctx.setLineDash([10, 8]);
    }
  }
  ctx.setLineDash([]);
  for (const st of steps) {
    if ('oneWay' in st) {
      // Il verso giusto: una freccia lungo la strada. Si tocca la strada finché
      // le sue frecce vanno come questa.
      const { from, to } = st.oneWay;
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len;
      const shift = ((time * 30) % 20) - 10; // la freccia scivola nel verso giusto
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(from.x + ux * 6, from.y + uy * 6);
      ctx.lineTo(to.x - ux * 6, to.y - uy * 6);
      ctx.stroke();
      const hx = (from.x + to.x) / 2 + ux * shift, hy = (from.y + to.y) / 2 + uy * shift;
      ctx.beginPath();
      ctx.moveTo(hx + ux * 9, hy + uy * 9);
      ctx.lineTo(hx - ux * 5 - uy * 8, hy - uy * 5 + ux * 8);
      ctx.lineTo(hx - ux * 5 + uy * 8, hy - uy * 5 - ux * 8);
      ctx.closePath();
      ctx.fill();
    } else if ('remove' in st) {
      // Da togliere: una croce che pulsa, con un cerchio come per i tocchi.
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      const { x, y } = st.remove;
      ctx.globalAlpha = 0.5 + 0.5 * pulse;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 9);
      ctx.lineTo(x + 9, y + 9);
      ctx.moveTo(x + 9, y - 9);
      ctx.lineTo(x - 9, y + 9);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 16 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  for (const st of steps) {
    if (!('tap' in st)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(st.tap.x, st.tap.y, 14 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (st.times > 1) {
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${st.times}`, st.tap.x + 24, st.tap.y - 16);
    }
  }
  ctx.restore();
}

/**
 * I veicoli da disegnare sopra i cavalcavia: chi sta per salire, è sopra o è
 * appena sceso (fino a due nodi dal nodo alto). Contava solo il pezzo dove sta il
 * centro del veicolo, così il muso entrava sotto l'impalcato e per un attimo
 * spariva. Chi passa sotto non ha il nodo alto nel percorso e resta sotto.
 * @param {RoadGraph} graph
 * @param {import('../sim/vehicles.js').Vehicle[]} vehicles
 */
export function vehiclesOnDecks(graph, vehicles) {
  const uppers = [...graph.nodes.values()].filter((n) => n.overpass?.upper).map((n) => n.id);
  if (uppers.length === 0) return [];
  return vehicles.filter((v) =>
    uppers.some((id) => {
      const i = v.path.indexOf(id);
      return i >= 0 && Math.abs(i - v.leg) <= DECK_REACH;
    }),
  );
}

/** Fin dove (in nodi dal nodo alto) un veicolo si disegna sopra il cavalcavia. */
const DECK_REACH = 2;

/**
 * Frecce sui sensi unici: lungo ogni strada a senso unico, una ogni ARROW_SPACING
 * circa e sempre almeno una (prima andavano su un arco sì e uno no, e una strada
 * corta di un arco solo poteva restare senza freccia).
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadGraph} graph
 */
function drawOneWayArrows(ctx, graph) {
  ctx.fillStyle = STYLE.arrow;
  for (const c of roadChains(graph)) {
    if (!c.oneWay || c.points.length < 2) continue;
    // I pezzi della fila, ognuno nel verso di marcia del suo arco.
    const segments = [];
    let total = 0;
    for (let i = 1; i < c.points.length; i++) {
      const p = /** @type {RoadNode} */ (c.points[i - 1]);
      const q = /** @type {RoadNode} */ (c.points[i]);
      const e = graph.getEdge(p.id, q.id) ?? graph.getEdge(q.id, p.id);
      const forward = !e || e.a === p.id;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      segments.push({ a: forward ? p : q, b: forward ? q : p, from: total, len, flip: !forward });
      total += len;
    }
    const count = Math.max(1, Math.round(total / ARROW_SPACING));
    for (let k = 0; k < count; k++) {
      const at = ((k + 0.5) / count) * total;
      const seg = segments.find((sg) => at <= sg.from + sg.len) ?? segments[segments.length - 1];
      const t = seg.len ? (at - seg.from) / seg.len : 0.5;
      const u = seg.flip ? 1 - t : t;
      const dx = (seg.b.x - seg.a.x) / (seg.len || 1);
      const dy = (seg.b.y - seg.a.y) / (seg.len || 1);
      const mx = seg.a.x + (seg.b.x - seg.a.x) * u;
      const my = seg.a.y + (seg.b.y - seg.a.y) * u;
      ctx.beginPath();
      ctx.moveTo(mx + dx * 5, my + dy * 5);
      ctx.lineTo(mx - dx * 3 - dy * 4.5, my - dy * 3 + dx * 4.5);
      ctx.lineTo(mx - dx * 1, my - dy * 1);
      ctx.lineTo(mx - dx * 3 + dy * 4.5, my - dy * 3 - dx * 4.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Distanza circa fra due frecce di un senso unico. */
const ARROW_SPACING = 55;

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
 * Fiumi, mare e baie, con le rive morbide. Il mare può avere una striscia di spiaggia.
 * Le isole restano terra: mare e baie si riempiono tutto intorno, non sopra.
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
  const islands = waters.filter((w) => w.kind === 'island');
  // Prima le rive di tutto (fiumi, mare e isole), poi l'acqua sopra: dove il
  // fiume sfocia nel mare non resta una riva in mezzo.
  for (const [extra, color] of /** @type {[number, string][]} */ ([[6, STYLE.waterBank], [0, STYLE.water]])) {
    for (const w of waters) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      if (w.kind === 'island') {
        if (!extra) continue;
        traceSmoothClosed(ctx, w.points);
        ctx.lineWidth = extra;
        ctx.stroke();
      } else if (w.kind === 'river') {
        traceSmooth(ctx, w.points);
        ctx.lineWidth = w.width + extra;
        ctx.stroke();
      } else {
        traceSmoothClosed(ctx, w.points);
        ctx.save();
        if (islands.length > 0) {
          // Le isole fuori dall'area da riempire: un rettangolo enorme meno le
          // isole, con la regola "evenodd" che le lascia vuote.
          const hole = new Path2D();
          hole.rect(-1e5, -1e5, 2e5, 2e5);
          for (const isle of islands) {
            const outline = new Path2D();
            traceSmoothClosed(/** @type {any} */ (outline), isle.points);
            hole.addPath(outline);
          }
          ctx.clip(hole, 'evenodd');
        }
        ctx.fillStyle = color;
        ctx.fill();
        if (extra) {
          ctx.lineWidth = extra;
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  drawWaves(ctx, waters);
}

/** Distanza fra un'ondina e l'altra, e dalla riva, in unità di mondo. */
const WAVE_STEP = 46;
const WAVE_MARGIN = 16;
/** @type {WeakMap<object, Point[]>} dove stanno le ondine di ogni elenco d'acque */
const waveCache = new WeakMap();

/**
 * Ondine sparse sull'acqua: su mari, baie e laghi su una griglia un po' mossa,
 * lontano dalle rive; sui fiumi in fila lungo il centro, uguali a quelle del mare.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../sim/water.js').Water[]} waters
 */
function drawWaves(ctx, waters) {
  let spots = waveCache.get(waters);
  if (!spots) {
    spots = [];
    const islands = waters.filter((w) => w.kind === 'island');
    for (const w of waters) {
      if (w.kind === 'island') continue;
      if (w.kind === 'river') {
        // Una ogni WAVE_STEP lungo il centro del fiume.
        let carry = WAVE_STEP / 2;
        for (let i = 1; i < w.points.length; i++) {
          const a = w.points[i - 1];
          const b = w.points[i];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len === 0) continue;
          for (let d = carry; d < len; d += WAVE_STEP) spots.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
          carry = (((carry - len) % WAVE_STEP) + WAVE_STEP) % WAVE_STEP;
        }
        continue;
      }
      const xs = w.points.map((p) => p.x);
      const ys = w.points.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      let row = 0;
      for (let y = y0 + WAVE_STEP / 2; y < y1; y += WAVE_STEP * 0.8, row++) {
        for (let x = x0 + (row % 2 ? WAVE_STEP / 2 : 0); x < x1; x += WAVE_STEP) {
          // Un piccolo spostamento fisso per ogni punto: niente file troppo regolari.
          const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const p = { x: x + ((h - Math.floor(h)) - 0.5) * 16, y: y + ((h * 7 - Math.floor(h * 7)) - 0.5) * 12 };
          if (distanceToWater([w, ...islands], p) < -WAVE_MARGIN) spots.push(p);
        }
      }
    }
    waveCache.set(waters, spots);
  }
  if (spots.length === 0) return;
  ctx.strokeStyle = STYLE.wave;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const { x, y } of spots) {
    ctx.moveTo(x - 7, y);
    ctx.quadraticCurveTo(x - 3.5, y - 3.5, x, y);
    ctx.quadraticCurveTo(x + 3.5, y + 3.5, x + 7, y);
  }
  ctx.stroke();
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
