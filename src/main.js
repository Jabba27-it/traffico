import { RoadGraph } from './sim/graph.js';
import { parseLevel } from './sim/level.js';
import { Simulation } from './sim/simulation.js';
import { setupCanvas, useScreenSpace, useWorldSpace, screenToWorld } from './render/canvas.js';
import { drawRoads, drawPreview, drawRemoval } from './render/roads.js';
import { drawStations, drawSelectable } from './render/stations.js';
import { STATION_RADIUS } from './sim/stations.js';
import { drawVehicles } from './render/vehicles.js';
import { drawCongestion } from './render/congestion.js';
import { attachRoadDrawing } from './input/drawRoad.js';
import { createHud } from './ui/hud.js';
import { showGameOver } from './ui/gameOver.js';
import { createSpeedControls } from './ui/speed.js';
import { showRewardChoice, showStationPrompt } from './ui/reward.js';

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
  const sim = new Simulation(graph, level, Date.now());
  const drawing = attachRoadDrawing(
    canvas,
    graph,
    (x, y) => screenToWorld(view, x, y),
    {
      build: (points, snapRadius) => sim.buildRoad(points, snapRadius),
      findPiece: (x, y) => sim.findRoadPiece(x, y),
      remove: (piece) => sim.removeRoad(piece),
      active: () => !choosingStation,
    },
  );
  const hud = createHud(document.body);
  const speed = createSpeedControls(document.body);

  let lastTime = performance.now();
  let pending = 0;
  let gameOverShown = false;
  let rewardShown = false;
  /** Dopo aver scelto "migliora una stazione", finché non se ne tocca una. */
  let choosingStation = false;
  /** @type {() => void} */
  let hidePrompt = () => {};

  canvas.addEventListener('pointerdown', (e) => {
    if (!choosingStation) return;
    const r = canvas.getBoundingClientRect();
    const p = screenToWorld(view, e.clientX - r.left, e.clientY - r.top);
    const station = sim.stations.find((s) => Math.hypot(s.x - p.x, s.y - p.y) <= STATION_RADIUS + 12);
    if (!station) return;
    sim.chooseUpgradeReward(station.id);
    choosingStation = false;
    rewardShown = false;
    hidePrompt();
  });

  /** @param {number} now */
  function frame(now) {
    // A velocità doppia scorre il doppio del tempo di gioco, sempre a passi fissi.
    pending += Math.min((now - lastTime) / 1000, MAX_FRAME_TIME) * speed.speed();
    lastTime = now;
    while (pending >= STEP && sim.running) {
      sim.step(STEP);
      pending -= STEP;
    }
    // A gioco fermo il tempo non si accumula, così alla ripresa non c'è un balzo in avanti.
    if (!sim.running) pending = 0;

    if (sim.rewardPending && !rewardShown) {
      rewardShown = true;
      showRewardChoice(document.body, sim.rewardedWeeks, level.rewards, {
        onRoads: () => {
          sim.chooseRoadsReward();
          rewardShown = false;
        },
        onUpgrade: () => {
          choosingStation = true;
          hidePrompt = showStationPrompt(document.body);
        },
      });
    }
    const results = {
      score: sim.score,
      seconds: sim.seconds,
      trips: sim.trips,
      day: sim.day,
      dayProgress: sim.dayProgress,
      roads: sim.roadBudget,
    };
    hud.update(results);
    if (sim.failed && !gameOverShown) {
      gameOverShown = true;
      showGameOver(document.body, results, () => location.reload());
    }

    const { ctx } = view;
    useScreenSpace(view);
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(0, 0, view.width, view.height);
    useWorldSpace(view);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, level.world.width, level.world.height);
    drawRoads(ctx, graph);
    const preview = drawing.preview();
    if (preview.length >= 2) {
      const plan = sim.planRoad(preview);
      drawPreview(ctx, preview, plan.cut, sim.roadCost(plan), level.world.width);
    }
    const removal = drawing.removal();
    const finger = drawing.finger();
    if (removal && finger) drawRemoval(ctx, graph, removal, sim.refundOf(removal), finger, level.world.width);
    drawVehicles(ctx, graph, sim.vehicles);
    drawCongestion(ctx, sim.stations, level.congestion.tolerance, now / 1000);
    drawStations(ctx, sim.stations, sim.transitShapes(), sim.elapsed);
    if (choosingStation) drawSelectable(ctx, sim.stations, now / 1000);
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
