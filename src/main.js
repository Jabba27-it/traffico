import { RoadGraph } from './sim/graph.js';
import { setupCanvas } from './render/canvas.js';
import { drawRoads, drawPreview } from './render/roads.js';
import { attachRoadDrawing } from './input/drawRoad.js';

const BACKGROUND = '#f2efe8';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const view = setupCanvas(canvas);
const graph = new RoadGraph();
const drawing = attachRoadDrawing(canvas, graph);

function frame() {
  const { ctx, width, height } = view;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  drawRoads(ctx, graph);
  drawPreview(ctx, drawing.preview());
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
