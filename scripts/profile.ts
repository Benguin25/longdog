// Long Dog — headless render/logic profiler.
//
// The renderer's per-frame work during interactions is (a) the rules engine
// producing the next state and (b) rebuilding the memoized scene geometry
// (batched SVG path strings in src/render/scene.ts). The Skia draw itself is
// a fixed, small node count (~40 paths/groups on the heaviest level), so
// keeping (a) + (b) far under the 16.7ms frame budget is what keeps
// interactions at 60fps. This script measures both on the heaviest and the
// largest generated levels, using the real optimal solutions as the move
// workload.
//
// Usage: npx tsx scripts/profile.ts

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { applyAction, parseLevel, type GameState, type LevelData } from '../src/game/rules';
import { solveLevel } from '../src/game/solve';
import {
  buildFreezePaths,
  buildRakePaths,
  buildSkyPaths,
  buildSnackPaths,
  buildStatuePaths,
  buildWallPaths,
  newStatueCells,
  segmentGrounded,
  type Layout,
} from '../src/render/scene';

const LEVEL_DIR = resolve(__dirname, '..', 'src', 'game', 'levels');

function loadLevel(n: number): LevelData {
  const id = `level${String(n).padStart(3, '0')}`;
  return JSON.parse(readFileSync(join(LEVEL_DIR, `${id}.json`), 'utf8')) as LevelData;
}

/** Pick the heaviest levels: most drawn tiles, largest grid, longest par. */
function pickTargets(): { label: string; level: LevelData }[] {
  let heaviest: LevelData | null = null;
  let heavyScore = -1;
  let largest: LevelData | null = null;
  let largeScore = -1;
  let longest: LevelData | null = null;
  let longScore = -1;
  for (let n = 1; n <= 100; n++) {
    const l = loadLevel(n);
    const g = l.grid.join('');
    const tiles = [...g].filter((c) => c !== '.').length + l.dogs.reduce((s, d) => s + d.length, 0);
    const area = l.grid[0].length * l.grid.length;
    if (tiles > heavyScore) { heavyScore = tiles; heaviest = l; }
    if (area > largeScore) { largeScore = area; largest = l; }
    if ((l.par ?? 0) > longScore) { longScore = l.par ?? 0; longest = l; }
  }
  const out: { label: string; level: LevelData }[] = [];
  const seen = new Set<string>();
  for (const [label, l] of [
    ['most tiles', heaviest],
    ['largest grid', largest],
    ['longest par', longest],
  ] as const) {
    if (l && !seen.has(l.id)) {
      seen.add(l.id);
      out.push({ label, level: l });
    }
  }
  return out;
}

function buildScene(state: GameState, layout: Layout): number {
  const walls = buildWallPaths(state.walls, layout);
  const rakes = buildRakePaths(state.spikes, layout);
  const mats = buildFreezePaths(state.freezeTiles, layout);
  const statues = buildStatuePaths(state.statues, layout);
  const snacks = buildSnackPaths(state.snacks, layout);
  const sky = buildSkyPaths(1080, 1600, 'clouds');
  const grounded = state.dogs.flatMap((d) => d.cells.map((c) => segmentGrounded(state, c)));
  return (
    walls.dirt.length + walls.outline.length + walls.grass.length + walls.speckles.length +
    walls.blades.length + rakes.outline.length + mats.outline.length + statues.outline.length +
    snacks.bone.length + snacks.shine.length + sky.main.length + grounded.length
  );
}

const now = () => performance.now();

console.log('Long Dog headless profile (frame budget at 60fps: 16.67ms)\n');

let sink = 0;
for (const { label, level } of pickTargets()) {
  const start = parseLevel(level);
  const layout: Layout = { tile: 96, ox: 20, oy: 20 }; // phone-sized tiles

  const report = solveLevel(level);
  const solution = report.solution ?? [];

  // (a) Rules: replay the optimal solution many times.
  const RULE_ROUNDS = 200;
  const t0 = now();
  for (let r = 0; r < RULE_ROUNDS; r++) {
    let s = start;
    for (const a of solution) {
      const res = applyAction(s, a);
      if (res.status === 'moved' || res.status === 'won') s = res.state;
    }
  }
  const ruleMs = (now() - t0) / (RULE_ROUNDS * Math.max(1, solution.length));

  // (b) Scene geometry: full rebuild per iteration. In the app only the
  // parts whose backing set changed are rebuilt (memoized), so this is the
  // worst case (freeze move: statues + walls + snacks all change).
  const SCENE_ROUNDS = 500;
  const t1 = now();
  for (let r = 0; r < SCENE_ROUNDS; r++) sink += buildScene(start, layout);
  const sceneMs = (now() - t1) / SCENE_ROUNDS;

  // (c) The per-move JS prep the canvas does outside memos: statue diff +
  // grounded flags per dog segment.
  const afterOne = solution.length > 0 ? applyAction(start, solution[0]) : null;
  const next = afterOne && (afterOne.status === 'moved' || afterOne.status === 'won') ? afterOne.state : start;
  const PREP_ROUNDS = 20000;
  const t2 = now();
  for (let r = 0; r < PREP_ROUNDS; r++) {
    sink += newStatueCells(next, start).length;
    for (const d of next.dogs) for (const c of d.cells) sink += segmentGrounded(next, c) ? 1 : 0;
  }
  const prepMs = (now() - t2) / PREP_ROUNDS;

  const total = ruleMs + sceneMs + prepMs;
  console.log(
    `${level.id} (${label}: ${level.grid[0].length}x${level.grid.length}, par ${level.par}, ` +
      `${[...level.grid.join('')].filter((c) => c === '#').length} walls)`,
  );
  console.log(`  rules per move:        ${ruleMs.toFixed(3)} ms`);
  console.log(`  full scene rebuild:    ${sceneMs.toFixed(3)} ms  (worst case; usually memo-hit)`);
  console.log(`  per-move canvas prep:  ${prepMs.toFixed(4)} ms`);
  console.log(`  worst-case move total: ${total.toFixed(3)} ms  (${(100 * total / 16.67).toFixed(1)}% of a 60fps frame)\n`);
}

void sink;
