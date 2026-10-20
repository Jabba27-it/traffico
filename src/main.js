import { RoadGraph } from './sim/graph.js';
import { parseLevel } from './sim/level.js';
import { createStations } from './sim/stations.js';
import { Simulation } from './sim/simulation.js';
import { setupCanvas, useScreenSpace, useWorldSpace, screenToWorld } from './render/canvas.js';
import { drawRoads, drawPreview } from './render/roads.js';
import { drawStations } from './render/stations.js';
import { drawVehicles } from './render/vehicles.js';
import { attachRoadDrawing } from './input/drawRoad.js';
import { createHud } from './ui/hud.js';

const LEVEL_URL = 'levels/prova.json';
const OUTSIDE = '#e3dfd5';
const BACKGROUND = '#f2efe8';
/** Passo fisso della simulazione, in secondi. */
const STEP = 1 / 60;
/** Oltre questo ritardo (es. scheda in background) il tempo perso non si recupera. */
const MAX_FRAME_TIME = 0.25;

async function start() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));

  let level;
  try {
    const res = await fetch(LEVEL_URL);
    if (!res.ok) throw new Error(`Impossibile caricare ${LEVEL_URL} (${res.status})`);
    level = parseLevel(await res.json());
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
    return;
  }

  const view = setupCanvas(canvas, level.world);
  const graph = new RoadGraph();
  const stations = createStations(graph, level.stations);
  const drawing = attachRoadDrawing(canvas, graph, (x, y) => screenToWorld(view, x, y));
  const sim = new Simulation(graph, stations, Date.now());
  const hud = createHud(document.body);

  let lastTime = performance.now();
  let pending = 0;

  /** @param {number} now */
  function frame(now) {
    pending += Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = now;
    while (pending >= STEP) {
      sim.step(STEP);
      pending -= STEP;
    }
    hud.update({ score: sim.score, seconds: sim.seconds, trips: sim.trips });

    const { ctx } = view;
    useScreenSpace(view);
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(0, 0, view.width, view.height);
    useWorldSpace(view);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, level.world.width, level.world.height);
    drawRoads(ctx, graph);
    drawPreview(ctx, drawing.preview());
    drawVehicles(ctx, graph, sim.vehicles);
    drawStations(ctx, stations, sim.transitShapes());
    requestAnimationFrame(frame);
  }

  requestAnimationFrame((now) => {
    lastTime = now;
    frame(now);
  });
}

/** @param {string} message */
function showError(message) {
  const box = document.createElement('div');
  box.textContent = message;
  box.style.cssText = 'position:fixed;inset:auto 16px 50% 16px;padding:16px;background:#fff;color:#a12;font:16px sans-serif;border-radius:8px';
  document.body.appendChild(box);
}

start();
