// La foto della città a fine partita: la rete stradale costruita, pulita (senza
// veicoli né code), con il nome della città in alto e i risultati in basso.

import { STYLE } from './style.js';
import { drawRoads, drawBridgeTops, drawLaneMarks, drawOverpasses, drawWater } from './roads.js';
import { drawRoundaboutIslands } from './junctions.js';
import { drawGround, drawMonuments, drawTerrainNames } from './terrain.js';
import { drawStations, stationAreas } from './stations.js';

/** Larghezza della foto in pixel: va bene per i telefoni e per condividerla. */
const PHOTO_WIDTH = 1080;
/** Fasce in alto (titolo) e in basso (risultati), in pixel. */
const HEADER = 150;
const FOOTER = 130;
/** Margine intorno alla parte di città fotografata, in unità di mondo. */
const MARGIN = 12;

/**
 * @typedef {Object} PhotoInfo
 * @property {string} game     nome del gioco
 * @property {string} city     nome della città
 * @property {number} days     giorni giocati
 * @property {number} trips    viaggi completati
 * @property {boolean[]} stars stelle prese
 * @property {boolean} [platinum] stella di platino presa
 */

/**
 * Disegna la foto e la restituisce come immagine PNG.
 * @param {import('../sim/level.js').Level} level
 * @param {import('../sim/simulation.js').Simulation} sim
 * @param {PhotoInfo} info
 * @returns {Promise<Blob>}
 */
export function cityPhoto(level, sim, info) {
  const view = sim.view;
  const area = { x: view.x - MARGIN, y: view.y - MARGIN, width: view.width + 2 * MARGIN, height: view.height + 2 * MARGIN };
  const scale = PHOTO_WIDTH / area.width;
  const mapHeight = Math.round(area.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_WIDTH;
  canvas.height = HEADER + mapHeight + FOOTER;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  ctx.fillStyle = STYLE.land;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // La città, come nel gioco ma senza veicoli, code e colori del traffico.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HEADER, PHOTO_WIDTH, mapHeight);
  ctx.clip();
  ctx.translate(0, HEADER);
  ctx.scale(scale, scale);
  ctx.translate(-area.x, -area.y);
  drawGround(ctx, level.terrain);
  drawWater(ctx, level.waters);
  drawMonuments(ctx, level.terrain);
  drawRoads(ctx, sim.graph, new Map(), level.look);
  drawLaneMarks(ctx, sim.graph);
  drawRoundaboutIslands(ctx, sim.roundabouts.values(), level.look);
  drawOverpasses(ctx, sim.graph, level.look);
  drawBridgeTops(ctx, sim.graph, level.look);
  const stations = sim.stations.map((s) => ({ ...s, queue: [], returned: 0, bornAt: -Infinity }));
  const labels = area.width / level.view[0].width;
  drawTerrainNames(ctx, level.terrain, labels, stationAreas(ctx, stations, labels));
  drawStations(ctx, stations, new Map(), 0, labels);
  ctx.restore();

  // Titolo e risultati.
  ctx.fillStyle = STYLE.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.globalAlpha = 0.6;
  ctx.fillText(info.game, PHOTO_WIDTH / 2, 48);
  ctx.globalAlpha = 1;
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.fillText(info.city, PHOTO_WIDTH / 2, 102);
  const footerY = HEADER + mapHeight + FOOTER / 2;
  ctx.font = '600 40px system-ui, sans-serif';
  const stars = info.stars.map((s) => (s ? '★' : '☆')).join(' ') + (info.platinum ? '  +  platino' : '');
  const days = `${info.days} ${info.days === 1 ? 'giorno' : 'giorni'}`;
  const trips = `${info.trips} ${info.trips === 1 ? 'viaggio' : 'viaggi'}`;
  ctx.fillText(`${days}  ·  ${trips}  ·  ${stars}`, PHOTO_WIDTH / 2, footerY);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('foto non riuscita'))), 'image/png'));
}
