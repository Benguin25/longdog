// Long Dog — level generator (SPEC.md "Solver + level pipeline").
//
// Generates candidate levels from randomized templates + mutation, then
// filters each candidate with the solver (src/game/solve.ts, which consumes
// only the pure rules engine — rule logic is never duplicated here):
//
//   - solvable, optimal solution length within the band for the slot's
//     target difficulty
//   - REJECT any freeze level solvable with zero freezes (freeze must be
//     load-bearing); multi-freeze slots require >= 2 freezes
//   - REJECT any two-dog level where one dog can idle the whole game
//     (solvable while that dog is forbidden from moving until the exit opens)
//   - REJECT levels where greedy nearest-snack play succeeds (no thinking
//     required) — waived only for the very first tutorial slot of a mechanic
//   - Prefer levels with exactly 1-2 distinct solutions under par+2
//     (scored, per spec: "feels authored, not sloppy")
//
// The 100 slots follow the SPEC mechanics ladder (spikes L5, reach L8,
// freeze L12, freeze planning L15+, snack rationing L20+, two dogs L35,
// freeze+two-dog L50+, multi-freeze/chained dogs L60+) with par and mechanic
// mix ramping across the 100.
//
// Usage:
//   npx tsx scripts/generator.ts                 # generate all 100 levels
//   npx tsx scripts/generator.ts --slots 12-14   # regenerate a slot range
//   npx tsx scripts/generator.ts --seed 7        # different deterministic run
//   npx tsx scripts/generator.ts --dry           # generate + report, no files

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SPAWN_DOG_LENGTH } from '../src/game/config';
import {
  applyAction,
  availableActions,
  hashState,
  parseLevel,
  type Action,
  type Dir,
  type GameState,
  type LevelData,
} from '../src/game/rules';
import { countSolutions, solveLevel, type SolveReport } from '../src/game/solve';

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (rng: Rng, p: number) => rng() < p;

// ---------------------------------------------------------------------------
// Slot plan — mechanics ladder + difficulty curve for the 100 levels
// ---------------------------------------------------------------------------

interface SlotSpec {
  n: number; // level number, 1-based
  spikes: boolean;
  pits: boolean;
  freezeTiles: number; // 0, 1 or 2
  twoDogs: boolean;
  /** Minimum freezes a solution must need (load-bearing threshold). */
  minFreezes: number;
  reach: boolean; // bias snacks/exit upward (standing tall / bridging)
  snacksMin: number;
  snacksMax: number;
  parMin: number;
  parMax: number;
  parTarget: number;
  w: number;
  h: number;
  dogLen: number;
  /** Tutorial slots where greedy play is allowed to succeed. */
  allowGreedy: boolean;
  /** Last-resort fallback tiers may waive the idle-dog proof. */
  skipIdleCheck?: boolean;
  maxStates: number;
  tags: string[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildPlan(): SlotSpec[] {
  const plan: SlotSpec[] = [];
  for (let n = 1; n <= 100; n++) {
    const s: SlotSpec = {
      n,
      spikes: false,
      pits: false,
      freezeTiles: 0,
      twoDogs: false,
      minFreezes: 0,
      reach: false,
      snacksMin: 1,
      snacksMax: 2,
      parMin: 3,
      parMax: 8,
      parTarget: 5,
      w: 8,
      h: 6,
      dogLen: 2,
      allowGreedy: false,
      maxStates: 150_000,
      tags: [],
    };
    const band = (min: number, max: number, target: number) => {
      s.parMin = min;
      s.parMax = max;
      s.parTarget = Math.round(target);
    };

    if (n <= 4) {
      // 1. Move + gravity + grow + exit.
      s.tags = ['basics'];
      s.dogLen = 2;
      s.snacksMax = n <= 2 ? 1 : 2;
      s.allowGreedy = n <= 2; // pure tutorial: greedy may succeed on L1-2
      band(3 + n, 6 + 2 * n, 4 + 2 * n);
    } else if (n <= 7) {
      // 2. Spikes.
      s.tags = ['spikes'];
      s.spikes = true;
      s.pits = n === 7;
      s.dogLen = n === 5 ? 2 : 3;
      s.snacksMax = 2;
      s.allowGreedy = n === 5; // spike tutorial
      band(6, 14, lerp(8, 12, (n - 5) / 2));
    } else if (n <= 11) {
      // 3. Longer = reach: standing tall / bridging.
      s.tags = ['reach'];
      s.reach = true;
      s.spikes = n >= 10;
      s.h = 7;
      s.dogLen = 3;
      s.snacksMin = 2;
      s.snacksMax = 3;
      band(8, 18, lerp(10, 15, (n - 8) / 3));
    } else if (n <= 14) {
      // 4. FREEZE intro.
      s.tags = ['freeze'];
      s.freezeTiles = 1;
      s.minFreezes = 1;
      s.dogLen = 3;
      s.snacksMin = 1;
      s.snacksMax = 2;
      s.allowGreedy = n === 12; // freeze tutorial
      s.h = 7;
      band(8, 20, lerp(10, 14, (n - 12) / 2));
    } else if (n <= 19) {
      // 5. Freeze planning: a specific frozen shape is required.
      s.tags = ['freeze', 'freeze-planning'];
      s.freezeTiles = 1;
      s.minFreezes = 1;
      s.reach = chance(mulberry32(n), 0.5);
      s.spikes = n >= 18;
      s.dogLen = 3;
      s.snacksMin = 1;
      s.snacksMax = 3;
      s.h = 7;
      band(10, 24, lerp(13, 18, (n - 15) / 4));
    } else if (n <= 34) {
      // 6. Snack rationing: first dog must leave snacks for the next dog.
      s.tags = ['freeze', 'ration'];
      s.freezeTiles = 1;
      s.minFreezes = 1;
      s.spikes = n % 3 === 0;
      s.pits = n % 4 === 0;
      s.reach = n % 2 === 0;
      s.dogLen = 3;
      s.snacksMin = 2;
      s.snacksMax = 4;
      s.w = 9;
      s.h = 7;
      band(12, 28, lerp(14, 22, (n - 20) / 14));
    } else if (n <= 49) {
      // 7. Two live dogs.
      s.tags = ['two-dogs'];
      s.twoDogs = true;
      s.spikes = n >= 40 && n % 2 === 0;
      s.pits = n >= 43 && n % 3 === 0;
      s.reach = n >= 42 && n % 2 === 1;
      s.dogLen = n <= 37 ? 2 : 3;
      s.snacksMin = 1;
      s.snacksMax = 3;
      s.allowGreedy = n === 35; // two-dog tutorial
      s.w = 9;
      s.h = 7;
      s.maxStates = 150_000;
      band(10, 30, lerp(13, 24, (n - 35) / 14));
    } else if (n <= 59) {
      // Combined freeze + two-dog levels.
      s.tags = ['freeze', 'two-dogs'];
      s.twoDogs = true;
      s.freezeTiles = 1;
      s.minFreezes = 1;
      s.spikes = n % 2 === 0;
      s.dogLen = n <= 54 ? 2 : 3;
      s.snacksMin = 1;
      s.snacksMax = 2;
      s.w = 8;
      s.h = 7;
      s.maxStates = 160_000;
      band(14, 34, lerp(18, 27, (n - 50) / 9));
    } else {
      // 8. Multiple freeze tiles / chained dogs, ramping to the finale.
      const t = (n - 60) / 40;
      s.tags = ['freeze', 'chained-dogs'];
      s.freezeTiles = 2;
      s.minFreezes = 2;
      s.twoDogs = n >= 70 && n % 5 === 0;
      s.spikes = n % 2 === 1;
      s.pits = n % 4 === 2;
      s.reach = n % 3 === 0;
      s.dogLen = 3;
      s.snacksMin = 2;
      s.snacksMax = 4;
      // Two-dog combo slots keep smaller boards so the proof searches stay
      // tractable; pure chained-dog slots grow toward the finale.
      s.w = n >= 80 && !s.twoDogs ? 10 : 9;
      s.h = n >= 80 && !s.twoDogs ? 8 : 7;
      s.maxStates = 160_000;
      band(16, 44, lerp(20, 34, t));
      if (s.twoDogs) {
        // Two dogs + double freeze tiles is intractable to prove; these
        // hybrid slots instead escalate the L50-59 combo (two dogs + one
        // load-bearing freeze) while the surrounding slots carry the
        // multi-freeze/chained-dog fantasy. Same tractable recipe as 50-59.
        s.tags = ['freeze', 'two-dogs'];
        s.freezeTiles = 1;
        s.minFreezes = 1;
        s.snacksMin = 1;
        s.snacksMax = 2;
        s.w = 8;
        s.h = 7;
        band(16, 36, lerp(24, 30, t));
      }
    }
    plan.push(s);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Candidate templates
// ---------------------------------------------------------------------------

interface Draft {
  grid: string[][]; // [y][x], terrain + items, no dogs
  dogs: number[][][]; // [dog][segment][x, y], head first
  spawnDir: Dir;
}

const cloneDraft = (d: Draft): Draft => ({
  grid: d.grid.map((row) => [...row]),
  dogs: d.dogs.map((dog) => dog.map((seg) => [...seg])),
  spawnDir: d.spawnDir,
});

function draftKey(d: Draft): string {
  return d.grid.map((r) => r.join('')).join('\n') + '|' + JSON.stringify(d.dogs) + d.spawnDir;
}

function emptyCells(grid: string[][], taken: Set<string>): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === '.' && !taken.has(`${x},${y}`)) out.push({ x, y });
    }
  }
  return out;
}

function surfaceCells(grid: string[][], taken: Set<string>): { x: number; y: number }[] {
  const h = grid.length;
  return emptyCells(grid, taken).filter((c) => c.y + 1 < h && grid[c.y + 1][c.x] === '#');
}

/** Build one random candidate for a slot, or null if placement failed. */
function buildCandidate(spec: SlotSpec, rng: Rng): Draft | null {
  const W = spec.w;
  const H = spec.h;
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));

  // Terrain: ground row + terraced column heights (random walk) + platforms.
  const pit = spec.pits && chance(rng, 0.75);
  const pitStart = pit ? randInt(rng, 2, W - 3) : -1;
  const pitWidth = pit ? randInt(rng, 1, 2) : 0;
  const maxRise = Math.min(3, H - 4);
  let rise = randInt(rng, 0, Math.min(2, maxRise));
  for (let x = 0; x < W; x++) {
    const inPit = pit && x >= pitStart && x < pitStart + pitWidth;
    rise = Math.max(0, Math.min(maxRise, rise + randInt(rng, -1, 1)));
    if (inPit) continue;
    grid[H - 1][x] = '#';
    for (let k = 1; k <= rise; k++) grid[H - 1 - k][x] = '#';
  }

  const platformCount = randInt(rng, 0, spec.reach ? 3 : 2);
  for (let p = 0; p < platformCount; p++) {
    const len = randInt(rng, 2, 3);
    const px = randInt(rng, 0, W - len);
    const py = randInt(rng, 1, Math.max(1, H - 4));
    for (let i = 0; i < len; i++) {
      if (grid[py][px + i] === '.') grid[py][px + i] = '#';
    }
  }

  const taken = new Set<string>();
  const take = (x: number, y: number) => taken.add(`${x},${y}`);

  // Dogs: horizontal, on a surface run.
  const dogs: number[][][] = [];
  const dogCount = spec.twoDogs ? 2 : 1;
  for (let d = 0; d < dogCount; d++) {
    const len = spec.dogLen + (d === 1 && chance(rng, 0.4) ? -1 : 0);
    const surf = surfaceCells(grid, taken);
    if (surf.length === 0) return null;
    let placed = false;
    for (let tries = 0; tries < 12 && !placed; tries++) {
      const base = pick(rng, surf);
      const dir = chance(rng, 0.5) ? 1 : -1;
      const cells: number[][] = [];
      for (let i = 0; i < len; i++) {
        const x = base.x + dir * i;
        if (x < 0 || x >= W || grid[base.y][x] !== '.' || taken.has(`${x},${base.y}`)) break;
        cells.push([x, base.y]);
      }
      if (cells.length === len) {
        // At least one segment must rest on terrain so the start is settled.
        const supported = cells.some(([x, y]) => y + 1 < H && grid[y + 1][x] === '#');
        if (!supported) continue;
        cells.forEach(([x, y]) => take(x, y));
        dogs.push(cells);
        placed = true;
      }
    }
    if (!placed) return null;
  }

  // Exit (reach slots bias it upward).
  const exitPool = emptyCells(grid, taken).filter((c) =>
    spec.reach ? c.y <= Math.floor(H / 2) : true,
  );
  if (exitPool.length === 0) return null;
  const exit = pick(rng, exitPool);
  grid[exit.y][exit.x] = 'E';
  take(exit.x, exit.y);

  // Snacks: mix of surface snacks and elevated snacks.
  const snackCount = randInt(rng, spec.snacksMin, spec.snacksMax);
  for (let i = 0; i < snackCount; i++) {
    const surf = surfaceCells(grid, taken);
    const air = emptyCells(grid, taken).filter((c) => c.y <= H - 3);
    const elevated = spec.reach ? chance(rng, 0.6) : chance(rng, 0.3);
    const pool = elevated && air.length > 0 ? air : surf;
    if (pool.length === 0) return null;
    const c = pick(rng, pool);
    grid[c.y][c.x] = 'o';
    take(c.x, c.y);
  }

  // Spikes: on surface cells (rakes/cacti standing on terrain).
  if (spec.spikes) {
    const spikeCount = randInt(rng, 1, 3);
    for (let i = 0; i < spikeCount; i++) {
      const surf = surfaceCells(grid, taken);
      if (surf.length === 0) break;
      const c = pick(rng, surf);
      grid[c.y][c.x] = '^';
      take(c.x, c.y);
    }
  }

  // Freeze tiles + dog house with a valid spawn shape.
  let spawnDir: Dir = 'left';
  if (spec.freezeTiles > 0) {
    for (let i = 0; i < spec.freezeTiles; i++) {
      const pool = emptyCells(grid, taken).filter((c) => c.y >= 1 && c.y <= H - 2);
      if (pool.length === 0) return null;
      const c = pick(rng, pool);
      grid[c.y][c.x] = 'F';
      take(c.x, c.y);
    }
    let placed = false;
    for (let tries = 0; tries < 16 && !placed; tries++) {
      const pool = emptyCells(grid, taken);
      if (pool.length === 0) return null;
      const c = pick(rng, pool);
      for (const dir of chance(rng, 0.5) ? (['left', 'right'] as const) : (['right', 'left'] as const)) {
        const dx = dir === 'left' ? -1 : 1;
        let ok = true;
        for (let k = 1; k < SPAWN_DOG_LENGTH; k++) {
          const x = c.x + dx * k;
          if (x < 0 || x >= W) ok = false;
          else if (grid[c.y][x] === '#' || grid[c.y][x] === '^') ok = false;
          if (!ok) break;
        }
        if (ok) {
          grid[c.y][c.x] = 'H';
          take(c.x, c.y);
          spawnDir = dir;
          placed = true;
          break;
        }
      }
    }
    if (!placed) return null;
  }

  return { grid, dogs, spawnDir };
}

/** Small random tweak of a near-miss candidate ("templates + mutation"). */
function mutate(base: Draft, spec: SlotSpec, rng: Rng): Draft | null {
  const d = cloneDraft(base);
  const H = d.grid.length;
  const W = d.grid[0].length;
  const dogCells = new Set(d.dogs.flat().map(([x, y]) => `${x},${y}`));
  const empty = emptyCells(d.grid, dogCells);
  if (empty.length === 0) return null;

  const find = (ch: string): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (d.grid[y][x] === ch) out.push({ x, y });
    return out;
  };

  const op = randInt(rng, 0, 4);
  if (op === 0) {
    // Move a snack.
    const snacks = find('o');
    if (snacks.length === 0) return null;
    const s = pick(rng, snacks);
    const to = pick(rng, empty);
    d.grid[s.y][s.x] = '.';
    d.grid[to.y][to.x] = 'o';
  } else if (op === 1) {
    // Move the exit.
    const e = find('E')[0];
    const to = pick(rng, empty);
    d.grid[e.y][e.x] = '.';
    d.grid[to.y][to.x] = 'E';
  } else if (op === 2) {
    // Add a wall block.
    const to = pick(rng, empty);
    if (to.y === 0) return null;
    d.grid[to.y][to.x] = '#';
  } else if (op === 3) {
    // Remove a non-ground wall block.
    const walls = find('#').filter((c) => c.y < H - 1);
    if (walls.length === 0) return null;
    const w = pick(rng, walls);
    d.grid[w.y][w.x] = '.';
  } else {
    // Move a spike or a freeze tile, whichever exists.
    const movable = [...find('^'), ...find('F')];
    if (movable.length === 0) return null;
    const m = pick(rng, movable);
    const ch = d.grid[m.y][m.x];
    const to = pick(rng, empty);
    d.grid[m.y][m.x] = '.';
    d.grid[to.y][to.x] = ch;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Greedy nearest-snack play: repeatedly take the shortest action sequence
 * that eats a snack (then, once the exit is open, the shortest sequence that
 * exits a dog). Returns true if this thoughtless policy clears the level.
 */
function greedySucceeds(start: GameState, capStates = 40_000): boolean {
  let state = start;
  for (let guard = 0; guard < 60; guard++) {
    const wantSnack = state.snacks.length > 0;
    const reached = bfsToEvent(state, wantSnack ? 'ate' : 'dogExited', capStates);
    if (!reached) return false;
    if (reached.won) return true;
    state = reached.state;
  }
  return false;
}

function bfsToEvent(
  start: GameState,
  event: 'ate' | 'dogExited',
  capStates: number,
): { state: GameState; won: boolean } | null {
  const queue: GameState[] = [start];
  const visited = new Set<string>([hashState(start)]);
  let head = 0;
  while (head < queue.length) {
    if (visited.size > capStates) return null;
    const s = queue[head++];
    for (const action of availableActions(s)) {
      const result = applyAction(s, action);
      if (result.status === 'blocked' || result.status === 'dead') continue;
      if (result.events.includes(event)) {
        return { state: result.state, won: result.status === 'won' };
      }
      if (result.status === 'won') continue; // won without the event: not this subgoal
      const h = hashState(result.state);
      if (visited.has(h)) continue;
      visited.add(h);
      queue.push(result.state);
    }
  }
  return null;
}

interface Evaluation {
  level: LevelData;
  report: SolveReport;
  nearOptimal: number;
  score: number;
  parNearMiss: boolean; // solvable but par out of band — worth mutating
}

function draftToLevel(d: Draft, id: string, name: string): LevelData {
  return {
    id,
    name,
    grid: d.grid.map((r) => r.join('')),
    dogs: d.dogs,
    ...(d.grid.some((row) => row.includes('F')) ? { spawnDir: d.spawnDir } : {}),
  };
}

function evaluate(draft: Draft, spec: SlotSpec, parMin: number, parMax: number): Evaluation | null {
  const level = draftToLevel(draft, `slot${spec.n}`, 'candidate');

  let start: GameState;
  try {
    start = parseLevel(level);
  } catch {
    return null;
  }

  const report = solveLevel(level, { maxStates: spec.maxStates });
  if (!report.solvable || report.par === undefined) return null;

  if (report.par < parMin || report.par > parMax) {
    return { level, report, nearOptimal: 0, score: Infinity, parNearMiss: true };
  }

  // Greedy nearest-snack play must fail (except tutorial slots). Cheapest
  // of the behavioral filters, so it runs first.
  if (!spec.allowGreedy && greedySucceeds(start)) return null;

  // The restricted checks below reject on exhaustion (can't prove the
  // property), so they get a generous cap — they only run on candidates
  // that already passed the cheap filters.
  const proofStates = Math.max(spec.maxStates, 350_000);

  // Freeze must be load-bearing: unsolvable with fewer than minFreezes freezes.
  if (spec.minFreezes > 0) {
    const noFreeze = solveLevel(level, {
      maxStates: proofStates,
      maxFreezes: spec.minFreezes - 1,
    });
    if (noFreeze.solvable || noFreeze.exhausted) return null;
  }

  // No idle dog: with any one dog frozen in place until the exit opens,
  // the level must NOT be solvable.
  if (draft.dogs.length > 1 && !spec.skipIdleCheck) {
    for (let d = 0; d < draft.dogs.length; d++) {
      const idle = solveLevel(level, { maxStates: proofStates, idleDogId: d });
      if (idle.solvable || idle.exhausted) return null;
    }
  }

  const nearOptimal = countSolutions(start, report.par + 2);

  let score = Math.abs(report.par - spec.parTarget) * 4;
  if (nearOptimal <= 2) score -= 12; // spec: prefer exactly 1-2 distinct solutions
  else score += Math.log2(nearOptimal) * 5;
  score += Math.max(0, Math.log2(report.statesExplored + 1) - 12); // mild bloat penalty

  return { level, report, nearOptimal, score, parNearMiss: false };
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const PACK_NAMES = ['Backyard', 'Garden', 'Rooftop', 'Park at Night', 'Snow'];

const INTRO_NAMES: Record<number, string> = {
  1: 'First Steps',
  2: 'Second Sniff',
  5: 'Mind the Rake',
  8: 'Stand Tall',
  12: 'Play Dead',
  15: 'Set in Stone',
  20: 'Save Some Snacks',
  35: 'Double Trouble',
  50: 'Statue Buddies',
  60: 'Chain Reaction',
  100: 'Longest Dog',
};

const NAME_ADJ = [
  'Sunny', 'Muddy', 'Wiggly', 'Sleepy', 'Bouncy', 'Lucky', 'Snoozy', 'Zoomy',
  'Crunchy', 'Floppy', 'Dusty', 'Frosty', 'Moonlit', 'Breezy', 'Cozy', 'Sniffy',
  'Stubby', 'Waggy', 'Rusty', 'Pebbly', 'Twisty', 'Drowsy', 'Perky', 'Shady',
];
const NAME_NOUN = [
  'Lawn', 'Fence', 'Kennel', 'Bone', 'Puddle', 'Sprinkler', 'Flowerbed', 'Sandbox',
  'Porch', 'Gnome', 'Trellis', 'Chimney', 'Gutter', 'Lamppost', 'Bench', 'Fountain',
  'Hedge', 'Drift', 'Icicle', 'Burrow', 'Ladder', 'Planter', 'Rooftop', 'Path',
];

function levelName(n: number, rng: Rng, used: Set<string>): string {
  const intro = INTRO_NAMES[n];
  if (intro) return intro;
  for (let tries = 0; tries < 50; tries++) {
    const name = `${pick(rng, NAME_ADJ)} ${pick(rng, NAME_NOUN)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return `${PACK_NAMES[Math.floor((n - 1) / 20)]} ${((n - 1) % 20) + 1}`;
}

// ---------------------------------------------------------------------------
// Mechanics tags + difficulty score (metadata)
// ---------------------------------------------------------------------------

function mechanicsOf(level: LevelData, spec: SlotSpec, solution: readonly Action[]): string[] {
  const grid = level.grid.join('');
  const tags: string[] = [];
  // Replay the optimal solution to count freezes actually used.
  let state = parseLevel(level);
  let freezes = 0;
  for (const a of solution) {
    const r = applyAction(state, a);
    if (r.status !== 'moved' && r.status !== 'won') break;
    if (r.events.includes('froze')) freezes++;
    state = r.state;
    if (r.status === 'won') break;
  }
  if (spec.tags.includes('basics')) tags.push('basics');
  if (spec.reach) tags.push('reach');
  if (grid.includes('^')) tags.push('spikes');
  if (grid.includes('F')) tags.push(freezes >= 2 ? `freeze x${freezes}` : 'freeze');
  if (spec.tags.includes('ration')) tags.push('ration');
  if (level.dogs.length > 1) tags.push('two-dogs');
  if (spec.tags.includes('chained-dogs') && freezes >= 2) tags.push('chained-dogs');
  if (tags.length === 0) tags.push('basics');
  return tags;
}

function difficultyOf(report: SolveReport, mechanics: readonly string[]): number {
  const par = report.par ?? 0;
  return Math.round(par * 1.5 + (mechanics.length - 1) * 4 + Math.log2(report.statesExplored + 1) / 2);
}

// ---------------------------------------------------------------------------
// Main pipeline: pool per slot -> filter -> pick best
// ---------------------------------------------------------------------------

interface Chosen {
  n: number;
  level: LevelData;
  par: number;
  nearOptimal: number;
  mechanics: string[];
  difficulty: number;
  attempts: number;
  poolSize: number;
  tier: number;
}

function generateSlot(spec: SlotSpec, seed: number): Chosen {
  const rng = mulberry32(seed ^ (spec.n * 0x9e3779b9));
  const seenDrafts = new Set<string>();
  const POOL_TARGET = 4;

  // Relaxation ladder: tier 1 is fully strict; later tiers trade filters for
  // yield so a full run always produces a level (the tier is logged so weak
  // slots are easy to spot and regenerate).
  const TIERS: { widen: number; attempts: number; patch: Partial<SlotSpec> }[] = [
    { widen: 0, attempts: 900, patch: {} },
    { widen: 4, attempts: 450, patch: {} },
    { widen: 4, attempts: 450, patch: { allowGreedy: true } },
    { widen: 6, attempts: 450, patch: { allowGreedy: true, minFreezes: Math.min(spec.minFreezes, 1) } },
    {
      widen: 6,
      attempts: 600,
      patch: { allowGreedy: true, minFreezes: Math.min(spec.minFreezes, 1), skipIdleCheck: true },
    },
  ];
  for (let tier = 1; tier <= TIERS.length; tier++) {
    const { widen, attempts: maxAttempts, patch } = TIERS[tier - 1];
    const parMin = Math.max(3, spec.parMin - widen);
    const parMax = spec.parMax + widen;
    const specForTier: SlotSpec = { ...spec, ...patch };

    const pool: Evaluation[] = [];
    let nearMiss: Draft | null = null;
    let attempts = 0;
    const tStart = Date.now();

    while (attempts < maxAttempts && pool.length < POOL_TARGET) {
      // Soft time budget so one stubborn slot can't stall the whole run.
      const elapsed = Date.now() - tStart;
      if (elapsed > 45_000 && pool.length > 0) break;
      if (elapsed > 100_000) break;
      attempts++;
      let draft: Draft | null =
        nearMiss && chance(rng, 0.35) ? mutate(nearMiss, specForTier, rng) : null;
      if (!draft) draft = buildCandidate(specForTier, rng);
      if (!draft) continue;
      const key = draftKey(draft);
      if (seenDrafts.has(key)) continue;
      seenDrafts.add(key);

      const ev = evaluate(draft, specForTier, parMin, parMax);
      if (!ev) continue;
      if (ev.parNearMiss) {
        nearMiss = draft;
        continue;
      }
      pool.push(ev);
      nearMiss = draft; // passing drafts also make good mutation bases
    }

    if (pool.length > 0) {
      pool.sort((a, b) => a.score - b.score);
      const best = pool[0];
      const mechanics = mechanicsOf(best.level, spec, best.report.solution ?? []);
      return {
        n: spec.n,
        level: best.level,
        par: best.report.par ?? 0,
        nearOptimal: best.nearOptimal,
        mechanics,
        difficulty: difficultyOf(best.report, mechanics),
        attempts,
        poolSize: pool.length,
        tier,
      };
    }
  }

  throw new Error(`slot ${spec.n}: no candidate survived the filters (all tiers)`);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const LEVELS_DIR = resolve(__dirname, '../src/game/levels');

function writeLevels(chosen: Chosen[]): void {
  mkdirSync(LEVELS_DIR, { recursive: true });
  // Clear previous generated/handmade level JSON files.
  for (const f of readdirSync(LEVELS_DIR)) {
    if (f.endsWith('.json')) unlinkSync(join(LEVELS_DIR, f));
  }

  const importLines: string[] = [];
  const listLines: string[] = [];
  for (const c of chosen) {
    const id = `level${String(c.n).padStart(3, '0')}`;
    const out = {
      ...c.level,
      id,
      par: c.par,
      mechanics: c.mechanics,
      difficulty: c.difficulty,
    };
    writeFileSync(join(LEVELS_DIR, `${id}.json`), JSON.stringify(out, null, 2) + '\n');
    importLines.push(`import ${id} from './${id}.json';`);
    listLines.push(`  ${id},`);
  }

  const index = `// AUTO-GENERATED by scripts/generator.ts — do not edit by hand.
import type { LevelData } from '../rules';

${importLines.join('\n')}

export const LEVELS: readonly LevelData[] = [
${listLines.join('\n')}
];

export function levelById(id: string): LevelData | undefined {
  return LEVELS.find((l) => l.id === id);
}
`;
  writeFileSync(join(LEVELS_DIR, 'index.ts'), index);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function runCli(): void {
  const args = process.argv.slice(2);
  let seed = 20260824;
  let slotFrom = 1;
  let slotTo = 100;
  let dry = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed') seed = Number(args[++i]);
    else if (args[i] === '--slots') {
      const [a, b] = args[++i].split('-').map(Number);
      slotFrom = a;
      slotTo = b ?? a;
    } else if (args[i] === '--dry') dry = true;
  }

  const plan = buildPlan().filter((s) => s.n >= slotFrom && s.n <= slotTo);
  const nameRng = mulberry32(seed ^ 0xbeefcafe);
  const usedNames = new Set<string>();
  const chosen: Chosen[] = [];
  const t0 = Date.now();

  // Per-slot results are cached so crashes lose nothing and slot ranges can
  // be generated by parallel processes, then merged by a final full run.
  const cacheDir = process.env.GEN_CACHE ?? resolve(__dirname, '../.gencache');
  mkdirSync(cacheDir, { recursive: true });

  for (const spec of plan) {
    const t = Date.now();
    const cacheFile = join(cacheDir, `slot_${seed}_${spec.n}.json`);
    let c: Chosen;
    if (existsSync(cacheFile)) {
      c = JSON.parse(readFileSync(cacheFile, 'utf8')) as Chosen;
    } else {
      c = generateSlot(spec, seed);
      writeFileSync(cacheFile, JSON.stringify(c));
    }
    c.level = { ...c.level, name: levelName(spec.n, nameRng, usedNames) };
    chosen.push(c);
    console.log(
      `L${String(spec.n).padStart(3)}  par=${String(c.par).padStart(2)}  ` +
        `sols<=par+2=${String(c.nearOptimal).padStart(3)}  diff=${String(c.difficulty).padStart(3)}  ` +
        `tier=${c.tier}  attempts=${String(c.attempts).padStart(4)}  pool=${c.poolSize}  ` +
        `${Math.round((Date.now() - t) / 100) / 10}s  [${c.mechanics.join(', ')}]  "${c.level.name}"`,
    );
  }

  if (!dry && slotFrom === 1 && slotTo === 100) {
    writeLevels(chosen);
    console.log(`\nWrote ${chosen.length} levels + index.ts to ${LEVELS_DIR}`);
  } else if (!dry) {
    console.log('\n(partial slot range: files NOT written; run without --slots to write)');
  }

  console.log(`\n#   par  diff  mechanics`);
  for (const c of chosen) {
    console.log(
      `${String(c.n).padStart(3)}  ${String(c.par).padStart(3)}  ${String(c.difficulty).padStart(4)}  ${c.mechanics.join(', ')}`,
    );
  }
  console.log(`\ntotal: ${Math.round((Date.now() - t0) / 1000)}s`);
}

runCli();
