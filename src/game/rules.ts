// Long Dog — complete pure rules engine.
//
// Every game rule lives in this file. The renderer, the store, and the
// headless solver consume ONLY these functions. State is immutable: every
// function returns new objects and never mutates its input.
//
// Rules implemented (full SPEC.md ruleset):
// - 4-direction movement of the active dog's head, body follows.
// - Blocking: grid bounds, walls, statues, own body, other dogs.
// - Snacks: the HEAD entering a snack cell eats it and grows the dog by one
//   segment (tail stays put). This applies both to a deliberate move and to
//   gravity: a falling dog whose head lands on a snack eats it. Snacks
//   never block and never support; body segments fall through/over snack
//   cells without eating them (only the head eats).
// - Gravity: after every action, any dog with no segment resting on a wall
//   or statue falls. Dogs support each other (transitively). Unsupported
//   dogs fall together, one row at a time. A falling head with a snack
//   directly beneath it eats it on that row exactly like an eating move:
//   the head advances onto the snack and the rest of the body stays put
//   (so it keeps supporting anything resting on it that row); the fall then
//   continues as normal. A fall can eat several snacks in a row.
// - Death: any segment overlapping a spike cell, or falling below the grid.
//   Death never returns a state — the caller keeps the pre-move state
//   (auto-undo per spec).
// - Exit: opens once all snacks are eaten. Moving the head onto the open
//   exit clears that dog (whole body removed). The exit tile is a passable,
//   non-supporting marker while closed. Win when no live dogs remain.
// - Freeze ("play dead") tiles: the moment the head enters a freeze tile —
//   before gravity — the whole dog petrifies in its exact shape and its
//   segments become permanent statue terrain (floating statues are allowed
//   and are a feature). A new dog of SPAWN_DOG_LENGTH immediately spawns at
//   the dog house and becomes the active dog. If the spawn cells are not
//   free, the freezing move is illegal (blocked).
// - Multiple live dogs: swap cycles control. Dogs block each other (no
//   pushing) and support each other. Every live dog must exit; statues
//   don't need to.
// - Freeze/exit/dog-house tiles are passable markers: they never block and
//   never support.

import { SPAWN_DOG_LENGTH } from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Action = Dir | 'swap';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Dog {
  /** Stable identity across states (used by the renderer for tweening). */
  readonly id: number;
  /** Segment cells, head first. Always at least 1 cell. */
  readonly cells: readonly Cell[];
}

export interface GameState {
  readonly width: number;
  readonly height: number;
  // Static terrain (never changes during play).
  readonly walls: ReadonlySet<string>;
  readonly spikes: ReadonlySet<string>;
  readonly freezeTiles: ReadonlySet<string>;
  readonly exit: Cell;
  readonly doghouse: Cell | null;
  /** Direction the spawned dog's body extends from its head at the dog house. */
  readonly spawnDir: Dir;
  // Dynamic state.
  readonly snacks: readonly Cell[];
  readonly statues: ReadonlySet<string>;
  readonly dogs: readonly Dog[];
  readonly activeDog: number;
  readonly nextDogId: number;
}

export type GameEvent =
  | 'ate'
  | 'exitOpened'
  | 'dogExited'
  | 'froze'
  | 'spawned'
  | 'fell';

export type DeathCause = 'spikes' | 'fell';

/** Rows each dog's head fell while settling, keyed by dog id (absent = didn't fall). */
export type FallRows = Readonly<Record<number, number>>;

/**
 * Snacks eaten mid-fall, keyed by dog id: for each snack, how many rows the
 * head had fallen when it landed on it (1 = the first row of the fall).
 * Ascending. Absent = the dog ate nothing while falling. Presentational
 * hint only (lets the renderer time the munch); state already reflects it.
 */
export type FallEats = Readonly<Record<number, readonly number[]>>;

export type MoveResult =
  | {
      readonly status: 'moved';
      readonly state: GameState;
      readonly events: readonly GameEvent[];
      readonly fallRows: FallRows;
      readonly fallEats: FallEats;
    }
  | {
      readonly status: 'won';
      readonly state: GameState;
      readonly events: readonly GameEvent[];
      readonly fallRows: FallRows;
      readonly fallEats: FallEats;
    }
  | { readonly status: 'blocked' }
  | { readonly status: 'dead'; readonly cause: DeathCause };

/** Shape of a level JSON file in /src/game/levels/. */
export interface LevelData {
  readonly id: string;
  readonly name: string;
  /** Rows top-to-bottom. Chars: '.' empty, '#' wall, '^' spike, 'o' snack,
   *  'E' exit, 'F' freeze tile, 'H' dog house. */
  readonly grid: readonly string[];
  /** Dogs, each a list of [x, y] segments, head first. */
  readonly dogs: readonly (readonly (readonly number[])[])[];
  readonly spawnDir?: string;
  /** Optimal move count from the solver (informational, for star scoring). */
  readonly par?: number;
  /** Generator metadata: mechanics present in the level (informational). */
  readonly mechanics?: readonly string[];
  /** Generator metadata: difficulty score (informational). */
  readonly difficulty?: number;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

export const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function inBounds(state: GameState, c: Cell): boolean {
  return c.x >= 0 && c.x < state.width && c.y >= 0 && c.y < state.height;
}

function isTerrain(state: GameState, x: number, y: number): boolean {
  const k = cellKey(x, y);
  return state.walls.has(k) || state.statues.has(k);
}

/** Map from occupied cell key to dog index, across all live dogs. */
function dogCellMap(dogs: readonly Dog[]): Map<string, number> {
  const map = new Map<string, number>();
  dogs.forEach((dog, i) => {
    for (const c of dog.cells) map.set(cellKey(c.x, c.y), i);
  });
  return map;
}

export function isExitOpen(state: GameState): boolean {
  return state.snacks.length === 0;
}

export function isWon(state: GameState): boolean {
  return state.dogs.length === 0;
}

// ---------------------------------------------------------------------------
// Gravity
// ---------------------------------------------------------------------------

type GravityResult =
  | {
      readonly status: 'settled';
      readonly dogs: readonly Dog[];
      /** Snacks left after any mid-fall eating. */
      readonly snacks: readonly Cell[];
      readonly anyFell: boolean;
      /** Rows each dog's head fell, indexed like the dogs array. */
      readonly rowsFallen: readonly number[];
      /** Per dog (indexed like the dogs array): head rows at which it ate. */
      readonly eatRows: readonly (readonly number[])[];
    }
  | { readonly status: 'dead'; readonly cause: DeathCause };

/**
 * Which dogs are supported: a dog is supported if any segment sits directly
 * on a wall, a statue, or a segment of a (transitively) supported dog.
 * `preset` dogs count as supported from the start (bodies that stay put
 * this row while their head eats).
 */
function supportedDogs(
  state: GameState,
  dogs: readonly Dog[],
  preset: ReadonlySet<number>,
): Set<number> {
  const cellOwner = dogCellMap(dogs);
  const supported = new Set<number>(preset);
  let changed = true;
  while (changed) {
    changed = false;
    dogs.forEach((dog, i) => {
      if (supported.has(i)) return;
      for (const c of dog.cells) {
        const below = cellKey(c.x, c.y + 1);
        const owner = cellOwner.get(below);
        if (
          isTerrain(state, c.x, c.y + 1) ||
          (owner !== undefined && owner !== i && supported.has(owner))
        ) {
          supported.add(i);
          changed = true;
          return;
        }
      }
    });
  }
  return supported;
}

/**
 * Settle all dogs under gravity. All unsupported dogs fall together one row
 * per step. A falling dog whose head has a snack directly beneath it eats
 * it that row: the head advances onto the snack and the body stays put
 * (growing the dog by one, tail in place, exactly like an eating move).
 * Falling below the grid or into a spike cell is death.
 */
function settle(state: GameState, dogsIn: readonly Dog[]): GravityResult {
  let dogs = dogsIn;
  let snacks = state.snacks;
  let anyFell = false;
  const rowsFallen = dogsIn.map(() => 0);
  const eatRows: number[][] = dogsIn.map(() => []);

  for (;;) {
    let supported = supportedDogs(state, dogs, new Set());
    if (supported.size === dogs.length) {
      return { status: 'settled', dogs, snacks, anyFell, rowsFallen, eatRows };
    }
    anyFell = true;

    // Eating: an unsupported head with a snack right below it eats it. Its
    // body does not move this row, so it keeps supporting whatever rests on
    // it — recompute support with the eaters' bodies treated as resting.
    const eaters = new Set<number>();
    dogs.forEach((dog, i) => {
      if (supported.has(i)) return;
      const head = dog.cells[0];
      const idx = snacks.findIndex((s) => s.x === head.x && s.y === head.y + 1);
      if (idx < 0) return;
      eaters.add(i);
      snacks = snacks.filter((_, j) => j !== idx);
    });
    if (eaters.size > 0) supported = supportedDogs(state, dogs, eaters);

    dogs = dogs.map((dog, i) => {
      if (eaters.has(i)) {
        rowsFallen[i] += 1;
        eatRows[i].push(rowsFallen[i]);
        const head = dog.cells[0];
        return { ...dog, cells: [{ x: head.x, y: head.y + 1 }, ...dog.cells] };
      }
      if (supported.has(i)) return dog;
      rowsFallen[i] += 1;
      return { ...dog, cells: dog.cells.map((c) => ({ x: c.x, y: c.y + 1 })) };
    });

    for (let i = 0; i < dogs.length; i++) {
      if (supported.has(i) && !eaters.has(i)) continue;
      for (const c of dogs[i].cells) {
        if (c.y >= state.height) return { status: 'dead', cause: 'fell' };
        if (state.spikes.has(cellKey(c.x, c.y))) return { status: 'dead', cause: 'spikes' };
      }
    }
  }
}

/** Rebuild state after the dog list changed, then run gravity. */
function finishAction(
  state: GameState,
  dogs: readonly Dog[],
  patch: {
    snacks?: readonly Cell[];
    statues?: ReadonlySet<string>;
    activeDog?: number;
    nextDogId?: number;
  },
  events: GameEvent[],
): MoveResult {
  const midState: GameState = {
    ...state,
    snacks: patch.snacks ?? state.snacks,
    statues: patch.statues ?? state.statues,
    nextDogId: patch.nextDogId ?? state.nextDogId,
    dogs,
    activeDog: 0, // placeholder, fixed below
  };

  const settled = settle(midState, dogs);
  if (settled.status === 'dead') return { status: 'dead', cause: settled.cause };
  if (settled.anyFell) events.push('fell');

  const fallRows: Record<number, number> = {};
  const fallEats: Record<number, readonly number[]> = {};
  settled.rowsFallen.forEach((rows, i) => {
    if (rows > 0) fallRows[dogs[i].id] = rows;
    const eats = settled.eatRows[i];
    if (eats.length > 0) {
      fallEats[dogs[i].id] = eats;
      for (let k = 0; k < eats.length; k++) events.push('ate');
    }
  });
  if (midState.snacks.length > 0 && settled.snacks.length === 0) events.push('exitOpened');

  const active =
    dogs.length === 0 ? 0 : Math.min(patch.activeDog ?? state.activeDog, dogs.length - 1);
  const next: GameState = {
    ...midState,
    snacks: settled.snacks,
    dogs: settled.dogs,
    activeDog: active,
  };

  if (isWon(next)) return { status: 'won', state: next, events, fallRows, fallEats };
  return { status: 'moved', state: next, events, fallRows, fallEats };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Move the active dog's head one tile. Returns the new settled state, or
 * 'blocked' (illegal move, state unchanged), or 'dead' (caller keeps the
 * pre-move state — death is an auto-undo).
 */
export function move(state: GameState, dir: Dir): MoveResult {
  const dog = state.dogs[state.activeDog];
  if (!dog) return { status: 'blocked' };

  const head = dog.cells[0];
  const d = DELTA[dir];
  const target: Cell = { x: head.x + d.x, y: head.y + d.y };

  // Moving off the grid in any direction is simply blocked; death by
  // falling only happens through gravity.
  if (!inBounds(state, target)) return { status: 'blocked' };
  if (isTerrain(state, target.x, target.y)) return { status: 'blocked' };

  const occupied = dogCellMap(state.dogs);
  if (occupied.has(cellKey(target.x, target.y))) return { status: 'blocked' };

  if (state.spikes.has(cellKey(target.x, target.y))) {
    return { status: 'dead', cause: 'spikes' };
  }

  const events: GameEvent[] = [];

  // Snacks: eat and grow (head advances, tail stays).
  const snackIdx = state.snacks.findIndex((s) => sameCell(s, target));
  let snacks = state.snacks;
  let grew = false;
  if (snackIdx >= 0) {
    snacks = state.snacks.filter((_, i) => i !== snackIdx);
    grew = true;
    events.push('ate');
    if (snacks.length === 0) events.push('exitOpened');
  }

  // Open exit: the dog leaves the board whole.
  if (sameCell(target, state.exit) && snacks.length === 0) {
    events.push('dogExited');
    const remaining = state.dogs.filter((_, i) => i !== state.activeDog);
    return finishAction(state, remaining, { snacks, activeDog: state.activeDog }, events);
  }

  const newCells: Cell[] = grew
    ? [target, ...dog.cells]
    : [target, ...dog.cells.slice(0, -1)];

  // Freeze tile: petrify in the exact moved shape, before gravity.
  if (state.freezeTiles.has(cellKey(target.x, target.y))) {
    if (!state.doghouse) return { status: 'blocked' };

    const statues = new Set(state.statues);
    for (const c of newCells) statues.add(cellKey(c.x, c.y));

    const spawnCells = spawnShape(state.doghouse, state.spawnDir);
    const others = state.dogs.filter((_, i) => i !== state.activeDog);
    const otherCells = dogCellMap(others);
    for (const c of spawnCells) {
      if (
        !inBounds(state, c) ||
        state.walls.has(cellKey(c.x, c.y)) ||
        statues.has(cellKey(c.x, c.y)) ||
        state.spikes.has(cellKey(c.x, c.y)) ||
        otherCells.has(cellKey(c.x, c.y))
      ) {
        // Nowhere safe to spawn the next dog: freezing here is illegal.
        return { status: 'blocked' };
      }
    }

    events.push('froze', 'spawned');
    const newDog: Dog = { id: state.nextDogId, cells: spawnCells };
    const dogs = [...others, newDog];
    return finishAction(
      state,
      dogs,
      { snacks, statues, activeDog: dogs.length - 1, nextDogId: state.nextDogId + 1 },
      events,
    );
  }

  const dogs = state.dogs.map((dg, i) =>
    i === state.activeDog ? { ...dg, cells: newCells } : dg,
  );
  return finishAction(state, dogs, { snacks, activeDog: state.activeDog }, events);
}

/** Body extends from the dog-house head cell in spawnDir. */
function spawnShape(doghouse: Cell, spawnDir: Dir): Cell[] {
  const d = DELTA[spawnDir];
  const cells: Cell[] = [];
  for (let i = 0; i < SPAWN_DOG_LENGTH; i++) {
    cells.push({ x: doghouse.x + d.x * i, y: doghouse.y + d.y * i });
  }
  return cells;
}

/** Cycle control to the next live dog. No-op (blocked) with fewer than 2 dogs. */
export function swapDog(state: GameState): MoveResult {
  if (state.dogs.length < 2) return { status: 'blocked' };
  return {
    status: 'moved',
    state: { ...state, activeDog: (state.activeDog + 1) % state.dogs.length },
    events: [],
    fallRows: {},
    fallEats: {},
  };
}

/** Single entry point used by the solver and the store. */
export function applyAction(state: GameState, action: Action): MoveResult {
  if (action === 'swap') return swapDog(state);
  return move(state, action);
}

/** Legal actions worth exploring from a state (used by the solver). */
export function availableActions(state: GameState): readonly Action[] {
  return state.dogs.length > 1 ? [...DIRS, 'swap'] : DIRS;
}

// ---------------------------------------------------------------------------
// Hashing (solver dedupe)
// ---------------------------------------------------------------------------

/** Canonical hash of the dynamic parts of a state. */
export function hashState(state: GameState): string {
  const dogs = state.dogs
    .map((d) => d.cells.map((c) => `${c.x},${c.y}`).join(';'))
    .join('|');
  const snacks = state.snacks
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join(';');
  const statues = [...state.statues].sort().join(';');
  return `${state.activeDog}~${dogs}~${snacks}~${statues}`;
}

// ---------------------------------------------------------------------------
// Level parsing + validation
// ---------------------------------------------------------------------------

const isDir = (v: unknown): v is Dir => DIRS.includes(v as Dir);

/** Parse and validate a level JSON into an initial GameState. Throws on invalid levels. */
export function parseLevel(level: LevelData): GameState {
  const { grid } = level;
  const height = grid.length;
  if (height === 0) throw new Error(`${level.id}: empty grid`);
  const width = grid[0].length;

  const walls = new Set<string>();
  const spikes = new Set<string>();
  const freezeTiles = new Set<string>();
  const snacks: Cell[] = [];
  let exit: Cell | null = null;
  let doghouse: Cell | null = null;

  grid.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${level.id}: row ${y} is not ${width} wide`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const k = cellKey(x, y);
      switch (ch) {
        case '.':
          break;
        case '#':
          walls.add(k);
          break;
        case '^':
          spikes.add(k);
          break;
        case 'o':
          snacks.push({ x, y });
          break;
        case 'E':
          if (exit) throw new Error(`${level.id}: more than one exit`);
          exit = { x, y };
          break;
        case 'F':
          freezeTiles.add(k);
          break;
        case 'H':
          if (doghouse) throw new Error(`${level.id}: more than one dog house`);
          doghouse = { x, y };
          break;
        default:
          throw new Error(`${level.id}: unknown tile '${ch}' at ${x},${y}`);
      }
    }
  });

  if (!exit) throw new Error(`${level.id}: no exit`);
  if (freezeTiles.size > 0 && !doghouse) {
    throw new Error(`${level.id}: freeze tiles require a dog house`);
  }

  const spawnDir = level.spawnDir ?? 'left';
  if (!isDir(spawnDir)) throw new Error(`${level.id}: bad spawnDir '${spawnDir}'`);

  if (level.dogs.length === 0) throw new Error(`${level.id}: no dogs`);
  const seen = new Set<string>();
  const dogs: Dog[] = level.dogs.map((segments, di) => {
    if (segments.length === 0) throw new Error(`${level.id}: dog ${di} has no segments`);
    const cells = segments.map(([x, y]) => ({ x, y }));
    cells.forEach((c, i) => {
      const k = cellKey(c.x, c.y);
      if (c.x < 0 || c.x >= width || c.y < 0 || c.y >= height) {
        throw new Error(`${level.id}: dog ${di} segment ${i} out of bounds`);
      }
      if (walls.has(k) || spikes.has(k) || freezeTiles.has(k)) {
        throw new Error(`${level.id}: dog ${di} segment ${i} on a blocked/lethal tile`);
      }
      if (seen.has(k)) throw new Error(`${level.id}: overlapping dog segments at ${k}`);
      seen.add(k);
      if (i > 0) {
        const prev = cells[i - 1];
        if (Math.abs(prev.x - c.x) + Math.abs(prev.y - c.y) !== 1) {
          throw new Error(`${level.id}: dog ${di} segments ${i - 1}->${i} not adjacent`);
        }
      }
    });
    return { id: di, cells };
  });

  if (doghouse) {
    for (const c of spawnShape(doghouse, spawnDir)) {
      const k = cellKey(c.x, c.y);
      if (c.x < 0 || c.x >= width || c.y < 0 || c.y >= height || walls.has(k) || spikes.has(k)) {
        throw new Error(`${level.id}: dog-house spawn shape hits bounds/walls/spikes`);
      }
    }
  }

  const exitK = cellKey((exit as Cell).x, (exit as Cell).y);
  if (walls.has(exitK)) throw new Error(`${level.id}: exit inside a wall`);

  const state: GameState = {
    width,
    height,
    walls,
    spikes,
    freezeTiles,
    exit,
    doghouse,
    spawnDir,
    snacks,
    statues: new Set<string>(),
    dogs,
    activeDog: 0,
    nextDogId: dogs.length,
  };

  // Levels must start settled: initial dogs may not be floating.
  const settled = settle(state, dogs);
  if (settled.status === 'dead') throw new Error(`${level.id}: initial position dies under gravity`);
  if (settled.anyFell) throw new Error(`${level.id}: initial dogs are not resting on support`);

  return state;
}
