import { RoadGraph } from './sim/graph.js';
import { parseLevel } from './sim/level.js';
import { createStations } from './sim/stations.js';
import { setupCanvas, useScreenSpace, useWorldSpace, screenToWorld } from './render/canvas.js';
import { drawRoads, drawPreview } from './render/roads.js';
import { drawStations } from './render/stations.js';
import { attachRoadDrawing } from './input/drawRoad.js';

const LEVEL_URL = 'levels/prova.json';
const OUTSIDE = '#e3dfd5';
const BACKGROUND = '#f2efe8';

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

  function frame() {
    const { ctx } = view;
    useScreenSpace(view);
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(0, 0, view.width, view.height);
    useWorldSpace(view);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, level.world.width, level.world.height);
    drawRoads(ctx, graph);
    drawPreview(ctx, drawing.preview());
    drawStations(ctx, stations);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

/** @param {string} message */
function showError(message) {
  const box = document.createElement('div');
  box.textContent = message;
  box.style.cssText = 'position:fixed;inset:auto 16px 50% 16px;padding:16px;background:#fff;color:#a12;font:16px sans-serif;border-radius:8px';
  document.body.appendChild(box);
}

start();
