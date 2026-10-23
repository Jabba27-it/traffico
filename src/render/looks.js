// Ponti, cavalcavia e rotonde con i tratti tipici di ogni città (voce "stile" del
// livello). Solo disegno: costi e regole sono gli stessi per tutti gli stili.

import { ROAD_WIDTH } from '../sim/graph.js';
import { STYLE } from './style.js';

/** @typedef {{x: number, y: number}} Point */
/** @typedef {import('../sim/level.js').Look} Look */

/** Metà larghezza di un ponte, parapetti compresi. */
const BRIDGE_HALF = (ROAD_WIDTH + 6) / 2;

/**
 * Colori di parapetti e impalcato dei ponti.
 * @type {Record<string, {rail: string, deck: string}>}
 */
const BRIDGE_COLORS = {
  semplice: { rail: STYLE.bridgeRail, deck: STYLE.bridgeDeck },
  pietra: { rail: STYLE.travertineDark, deck: STYLE.bridgeDeck },
  brooklyn: { rail: STYLE.brooklynCable, deck: STYLE.bridgeDeck },
  arco: { rail: STYLE.harbourSteel, deck: STYLE.bridgeDeck },
  strallato: { rail: STYLE.white, deck: STYLE.bridgeDeck },
  bosforo: { rail: STYLE.bosphorusRail, deck: STYLE.bridgeDeck },
};

/** @type {Record<string, string>} colore dei parapetti dei cavalcavia */
const OVERPASS_RAILS = {
  semplice: STYLE.bridgeRail,
  terracotta: STYLE.terracotta,
  ferrovia: STYLE.nySteel,
  arenaria: STYLE.sandstone,
  tropicale: STYLE.white,
  maiolica: STYLE.turquoise,
};

/** @param {Look} [look] */
export function bridgeColors(look) {
  return BRIDGE_COLORS[look?.bridge ?? ''] ?? BRIDGE_COLORS.semplice;
}

/** @param {Look} [look] */
export function overpassRail(look) {
  return OVERPASS_RAILS[look?.overpass ?? ''] ?? OVERPASS_RAILS.semplice;
}

/**
 * Un punto lungo una spezzata, con la direzione di marcia e la normale.
 * @param {Point[]} points
 */
function walker(points) {
  /** @type {number[]} */
  const at = [0];
  for (let i = 1; i < points.length; i++) {
    at.push(at[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const length = at[at.length - 1];
  /** @param {number} t  0..1 lungo la spezzata */
  const pointAt = (t) => {
    const d = Math.max(0, Math.min(length, t * length));
    let i = 1;
    while (i < points.length - 1 && at[i] < d) i++;
    const a = points[i - 1];
    const b = points[i];
    const seg = at[i] - at[i - 1] || 1;
    const k = (d - at[i - 1]) / seg;
    const dx = (b.x - a.x) / seg;
    const dy = (b.y - a.y) / seg;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx, dy, nx: -dy, ny: dx };
  };
  return { length, pointAt };
}

/**
 * Un rettangolo ruotato secondo la strada: lungo `along`, largo `across`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, dx: number, dy: number}} p
 * @param {number} along
 * @param {number} across
 * @param {number} [shift]  spostamento di lato
 */
function block(ctx, p, along, across, shift = 0) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.dy, p.dx));
  ctx.fillRect(-along / 2, shift - across / 2, along, across);
  ctx.restore();
}

/**
 * I dettagli di ogni ponte (piloni, torri, archi, stralli), sopra l'impalcato.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[][]} bridges  punti di ogni ponte
 * @param {Look} [look]
 */
export function drawBridgeDetails(ctx, bridges, look) {
  const kind = look?.bridge ?? 'semplice';
  for (const points of bridges) {
    if (points.length < 2) continue;
    const { length, pointAt } = walker(points);
    if (length < 10) continue;
    if (kind === 'pietra') stoneBridge(ctx, length, pointAt);
    else if (kind === 'brooklyn') suspensionBridge(ctx, length, pointAt, STYLE.brooklynStone, 12, true);
    else if (kind === 'bosforo') suspensionBridge(ctx, length, pointAt, STYLE.bosphorusTower, 6, false);
    else if (kind === 'arco') archBridge(ctx, length, pointAt);
    else if (kind === 'strallato') cableStayedBridge(ctx, length, pointAt);
  }
}

/**
 * Roma: parapetti in travertino con i rostri tondi dei piloni, come sui ponti antichi.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} length
 * @param {(t: number) => ReturnType<ReturnType<typeof walker>['pointAt']>} pointAt
 */
function stoneBridge(ctx, length, pointAt) {
  const piers = Math.max(1, Math.round(length / 22));
  for (let i = 0; i <= piers; i++) {
    const p = pointAt(i / piers);
    for (const side of [-1, 1]) {
      const x = p.x + p.nx * side * BRIDGE_HALF;
      const y = p.y + p.ny * side * BRIDGE_HALF;
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = STYLE.travertine;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = STYLE.travertineDark;
      ctx.stroke();
    }
  }
}

/**
 * New York e Istanbul: ponte sospeso con due torri e i cavi lungo i lati.
 * A New York torri massicce in pietra con gli archi; sul Bosforo torri snelle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} length
 * @param {(t: number) => ReturnType<ReturnType<typeof walker>['pointAt']>} pointAt
 * @param {string} towerColor
 * @param {number} towerDepth  spessore delle torri lungo la strada
 * @param {boolean} arches     archi aperti nelle torri (Brooklyn)
 */
function suspensionBridge(ctx, length, pointAt, towerColor, towerDepth, arches) {
  const towers = length > 70 ? [0.22, 0.78] : [0.5];
  // Cavi: scendono fra le torri e risalgono verso le rive.
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = arches ? STYLE.brooklynCable : STYLE.cable;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const p = pointAt(t);
      const off = side * (BRIDGE_HALF - 1.5);
      if (i === 0) ctx.moveTo(p.x + p.nx * off, p.y + p.ny * off);
      else ctx.lineTo(p.x + p.nx * off, p.y + p.ny * off);
    }
    ctx.stroke();
  }
  // Tiranti verticali: visti dall'alto, trattini sui cavi.
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let d = 6; d < length - 6; d += 6) {
    const p = pointAt(d / length);
    for (const side of [-1, 1]) {
      const a = side * (BRIDGE_HALF - 3);
      const b = side * (BRIDGE_HALF + 0.5);
      ctx.moveTo(p.x + p.nx * a, p.y + p.ny * a);
      ctx.lineTo(p.x + p.nx * b, p.y + p.ny * b);
    }
  }
  ctx.stroke();
  for (const t of towers) {
    const p = pointAt(t);
    ctx.fillStyle = STYLE.shadow;
    block(ctx, { ...p, x: p.x + 2.5, y: p.y + 3.5 }, towerDepth, BRIDGE_HALF * 2 + 8);
    ctx.fillStyle = towerColor;
    block(ctx, p, towerDepth, BRIDGE_HALF * 2 + 8);
    if (arches) {
      // Le due arcate gotiche, una per corsia.
      ctx.fillStyle = STYLE.brooklynArch;
      block(ctx, p, towerDepth - 5, ROAD_WIDTH / 2 - 4, -ROAD_WIDTH / 4);
      block(ctx, p, towerDepth - 5, ROAD_WIDTH / 2 - 4, ROAD_WIDTH / 4);
    }
  }
}

/**
 * Sydney: l'arco d'acciaio che sporge ai lati, con i tiranti, e i piloni in granito alle rive.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} length
 * @param {(t: number) => ReturnType<ReturnType<typeof walker>['pointAt']>} pointAt
 */
function archBridge(ctx, length, pointAt) {
  const bulge = Math.min(10, length / 10);
  const archAt = (/** @type {number} */ t, /** @type {number} */ side) => {
    const p = pointAt(t);
    const off = side * (BRIDGE_HALF + 1 + bulge * Math.sin(Math.PI * t));
    return { x: p.x + p.nx * off, y: p.y + p.ny * off, p };
  };
  ctx.strokeStyle = STYLE.harbourSteel;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = 5; d < length - 5; d += 5) {
    const t = d / length;
    for (const side of [-1, 1]) {
      const a = archAt(t, side);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.p.x + a.p.nx * side * BRIDGE_HALF, a.p.y + a.p.ny * side * BRIDGE_HALF);
    }
  }
  ctx.stroke();
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = archAt(i / 24, side);
      if (i === 0) ctx.moveTo(a.x, a.y);
      else ctx.lineTo(a.x, a.y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = STYLE.harbourPylon;
  for (const t of [0, 1]) {
    const p = pointAt(t);
    for (const side of [-1, 1]) block(ctx, p, 7, 7, side * (BRIDGE_HALF + 3));
  }
}

/**
 * Rio: un pilone bianco al centro e gli stralli a ventaglio verso i due lati.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} length
 * @param {(t: number) => ReturnType<ReturnType<typeof walker>['pointAt']>} pointAt
 */
function cableStayedBridge(ctx, length, pointAt) {
  const pylons = length > 120 ? [0.3, 0.7] : [0.5];
  const reach = Math.min(0.3, 55 / length);
  ctx.strokeStyle = STYLE.cable;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const c of pylons) {
    const top = pointAt(c);
    for (let k = 1; k <= 5; k++) {
      for (const dir of [-1, 1]) {
        const p = pointAt(c + (dir * k * reach) / 5);
        for (const side of [-1, 1]) {
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(p.x + p.nx * side * (BRIDGE_HALF - 1.5), p.y + p.ny * side * (BRIDGE_HALF - 1.5));
        }
      }
    }
  }
  ctx.stroke();
  for (const c of pylons) {
    const p = pointAt(c);
    ctx.fillStyle = STYLE.shadow;
    block(ctx, { ...p, x: p.x + 3, y: p.y + 4 }, 6, 6);
    ctx.fillStyle = STYLE.white;
    block(ctx, p, 6, 6);
  }
}

/**
 * Dettagli dei cavalcavia, prima dell'impalcato (travi che sporgono) o dopo (alberi).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[][]} decks  per ogni cavalcavia: [inizio, centro, fine]
 * @param {Look | undefined} look
 * @param {'under' | 'over'} layer
 */
export function drawOverpassDetails(ctx, decks, look, layer) {
  const kind = look?.overpass;
  for (const points of decks) {
    const { pointAt } = walker(points);
    if (kind === 'ferrovia' && layer === 'under') {
      // Le travi d'acciaio della sopraelevata, che sporgono ai lati.
      ctx.fillStyle = STYLE.nySteel;
      for (const t of [0.15, 0.85]) block(ctx, pointAt(t), 3.5, ROAD_WIDTH + 12);
    }
    if (kind === 'arenaria' && layer === 'under') {
      ctx.fillStyle = STYLE.travertineDark;
      for (const t of [0.12, 0.88]) for (const side of [-1, 1]) block(ctx, pointAt(t), 5, 5, side * (ROAD_WIDTH / 2 + 5));
    }
    if (kind === 'tropicale' && layer === 'over') {
      // Palme e cespugli ai piedi delle rampe.
      for (const t of [0.08, 0.92]) {
        const p = pointAt(t);
        for (const side of [-1, 1]) {
          const x = p.x + p.nx * side * (ROAD_WIDTH / 2 + 9);
          const y = p.y + p.ny * side * (ROAD_WIDTH / 2 + 9);
          palm(ctx, x, y, 6);
        }
      }
    }
    if (kind === 'maiolica' && layer === 'over') {
      // Piastrelle bianche sui parapetti turchesi.
      ctx.fillStyle = STYLE.white;
      for (let t = 0.1; t < 0.95; t += 0.1) {
        const p = pointAt(t);
        for (const side of [-1, 1]) block(ctx, p, 1.6, 1.6, side * (ROAD_WIDTH / 2 + 0.5));
      }
    }
  }
}

/**
 * Una palma vista dall'alto: foglie a stella intorno al tronco.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
function palm(ctx, x, y, size) {
  ctx.strokeStyle = STYLE.pine;
  ctx.lineWidth = Math.max(1.2, size * 0.3);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, size * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = STYLE.monumentIcon;
  ctx.fill();
}

/**
 * Il tipo di una rotonda: a turno la tipica della città, una classica, di nuovo la
 * tipica, l'altra classica (di base aiuola e fontana, il livello può sceglierne altre). Dipende solo dal numero della rotonda, quindi non
 * cambia da un fotogramma all'altro e la prima è sempre quella della città.
 * @param {number} id
 * @param {Look} [look]
 */
export function roundaboutKind(id, look) {
  const own = look?.roundabout ?? 'semplice';
  if (own === 'semplice') return own;
  const turn = (((id - 1) % 4) + 4) % 4;
  const classics = look?.classics ?? ['aiuola', 'fontanaClassica'];
  return turn % 2 === 0 ? own : classics[(turn - 1) / 2];
}

/**
 * L'isola al centro di una rotonda, nello stile scelto.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{id: number, x: number, y: number, radius: number}} r
 * @param {Look} [look]
 */
export function drawIsland(ctx, r, look) {
  const kind = roundaboutKind(r.id, look);
  const ri = r.radius - ROAD_WIDTH / 2 + 1;
  const { x, y } = r;
  const disc = (/** @type {number} */ rad, /** @type {string} */ fill, dx = 0, dy = 0) => {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const ground = {
    pino: STYLE.grass,
    obelisco: STYLE.travertine,
    aiuola: STYLE.grass,
    jacaranda: STYLE.grass,
    colonna: STYLE.nyPaving,
    onde: STYLE.white,
    fontana: STYLE.travertine,
    fontanaClassica: STYLE.travertine,
  }[kind] ?? STYLE.island;
  disc(ri, ground);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, ri, 0, Math.PI * 2);
  ctx.clip();
  if (kind === 'pino') {
    // Roma: un pino domestico, la chioma larga vista dall'alto con la sua ombra.
    disc(ri * 0.62, STYLE.shadow, ri * 0.12, ri * 0.16);
    disc(ri * 0.62, STYLE.pine);
    disc(ri * 0.34, STYLE.pineLight, -ri * 0.15, -ri * 0.15);
  } else if (kind === 'obelisco') {
    // Roma: piazza in travertino col disegno a raggi e l'obelisco al centro, con la sua ombra lunga.
    ctx.strokeStyle = STYLE.travertineDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, ri * 0.62, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.moveTo(x + Math.cos(a) * ri * 0.25, y + Math.sin(a) * ri * 0.25);
      ctx.lineTo(x + Math.cos(a) * ri * 0.62, y + Math.sin(a) * ri * 0.62);
    }
    ctx.stroke();
    ctx.lineWidth = ri * 0.22;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = STYLE.shadow;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + ri * 0.85, y + ri * 0.85);
    ctx.stroke();
    const s = ri * 0.24;
    ctx.fillStyle = STYLE.monumentEdge;
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    // La punta a piramide: quattro facce, due in luce e due in ombra.
    ctx.fillStyle = STYLE.travertine;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, y - s * 0.7);
    ctx.lineTo(x + s * 0.7, y - s * 0.7);
    ctx.lineTo(x, y);
    ctx.lineTo(x - s * 0.7, y + s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = STYLE.monumentIcon;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.7, y - s * 0.7);
    ctx.lineTo(x + s * 0.7, y + s * 0.7);
    ctx.lineTo(x - s * 0.7, y + s * 0.7);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'aiuola') {
    // Classica: prato con una corona di fiori e tre cespugli.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      disc(ri * 0.11, i % 2 ? STYLE.superEdge : STYLE.hint, Math.cos(a) * ri * 0.78, Math.sin(a) * ri * 0.78);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      disc(ri * 0.22, STYLE.pineLight, Math.cos(a) * ri * 0.32, Math.sin(a) * ri * 0.32);
    }
  } else if (kind === 'fontanaClassica') {
    // Classica: vasca tonda d'acqua con lo zampillo al centro.
    disc(ri * 0.72, STYLE.travertineDark);
    disc(ri * 0.62, STYLE.water);
    ctx.lineWidth = 1;
    ctx.strokeStyle = STYLE.cable;
    ctx.beginPath();
    ctx.arc(x, y, ri * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    disc(ri * 0.14, STYLE.white);
  } else if (kind === 'colonna') {
    // New York: piazza lastricata con alberi in cerchio e la colonna al centro, come Columbus Circle.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      disc(ri * 0.14, STYLE.pineLight, Math.cos(a) * ri * 0.72, Math.sin(a) * ri * 0.72);
    }
    ctx.lineWidth = ri * 0.16;
    ctx.strokeStyle = STYLE.shadow;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + ri * 0.5, y + ri * 0.6);
    ctx.stroke();
    disc(ri * 0.18, STYLE.nyColumn);
  } else if (kind === 'jacaranda') {
    // Sydney: le jacarande in fiore, macchie viola sul prato.
    const spots = [[-0.35, -0.3, 0.38], [0.35, -0.2, 0.33], [0, 0.35, 0.36], [-0.05, -0.02, 0.2]];
    spots.forEach(([dx, dy, s], i) => disc(ri * s, STYLE.jacaranda[i % STYLE.jacaranda.length], dx * ri, dy * ri));
  } else if (kind === 'onde') {
    // Rio: il pavimento a onde bianche e nere del lungomare di Copacabana.
    ctx.strokeStyle = STYLE.waveDark;
    ctx.lineWidth = Math.max(1.2, ri * 0.12);
    const step = ri * 0.42;
    for (let row = -ri; row <= ri + step; row += step) {
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const px = x - ri + (k / 16) * ri * 2;
        const py = y + row + Math.sin((k / 16) * Math.PI * 4) * ri * 0.12;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  } else if (kind === 'fontana') {
    // Istanbul: fontana ottomana ottagonale, acqua turchese e una piccola cupola.
    const octagon = (/** @type {number} */ rad, /** @type {string} */ fill) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
        else ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    octagon(ri * 0.78, STYLE.travertineDark);
    octagon(ri * 0.64, STYLE.turquoise);
    disc(ri * 0.26, STYLE.white);
    disc(ri * 0.1, STYLE.travertineDark);
  }
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = STYLE.islandEdge;
  ctx.beginPath();
  ctx.arc(x, y, ri, 0, Math.PI * 2);
  ctx.stroke();
}
