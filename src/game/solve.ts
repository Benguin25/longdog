// Long Dog — pure BFS search over game states.
//
// This module contains NO rule logic: it consumes only the pure functions in
// rules.ts. It is shared by:
//   - scripts/solver.ts   (headless CLI, node/tsx)
//   - scripts/generator.ts (level generation filters)
//   - the in-app hint feature (solve from the CURRENT state at runtime)
//
// BFS over full game state (dog bodies, snacks left, statues, active dog)
// with state hashing for dedupe. Reports: solvable?, optimal move count
// (par), one optimal solution, and (on demand) the number of distinct
// solutions of length <= par + 2.

import {
  applyAction,
  availableActions,
  hashState,
  parseLevel,
  type Action,
  type GameState,
  type LevelData,
} from './rules';

export const DEFAULT_MAX_STATES = 2_000_000;
export const SOLUTION_COUNT_CAP = 1000;

export interface SolveOptions {
  /** Abort (exhausted=true) after visiting this many distinct states. */
  readonly maxStates?: number;
  /**
   * Prune any path that triggers more than this many freezes. 0 = search
   * only freeze-free play (used by the generator's load-bearing check).
   */
  readonly maxFreezes?: number;
  /**
   * Forbid moving the dog with this id while snacks remain (it may still be
   * swapped past, and may move once the exit is open). Used by the
   * generator's no-idle-dog check: if the level is solvable under this
   * restriction, that dog can idle the whole game.
   */
  readonly idleDogId?: number;
}

export interface SolveReport {
  solvable: boolean;
  /** Hit the state cap before exhausting the search space. */
  exhausted: boolean;
  par?: number;
  solution?: Action[];
  statesExplored: number;
  ms: number;
}

interface Node {
  state: GameState;
  parent: number; // index into nodes, -1 for root
  action: Action | null;
  freezes: number; // freezes triggered along this path
}

/** BFS from an arbitrary (already settled) state. Optimal in move count. */
export function solveState(start: GameState, opts: SolveOptions = {}): SolveReport {
  const t0 = Date.now();
  const maxStates = opts.maxStates ?? DEFAULT_MAX_STATES;

  const nodes: Node[] = [{ state: start, parent: -1, action: null, freezes: 0 }];
  const visited = new Set<string>([hashState(start)]);
  let head = 0;

  while (head < nodes.length) {
    if (visited.size > maxStates) {
      return { solvable: false, exhausted: true, statesExplored: visited.size, ms: Date.now() - t0 };
    }
    const idx = head++;
    const node = nodes[idx];

    for (const action of availableActions(node.state)) {
      if (
        opts.idleDogId !== undefined &&
        action !== 'swap' &&
        node.state.snacks.length > 0 &&
        node.state.dogs[node.state.activeDog]?.id === opts.idleDogId
      ) {
        continue;
      }

      const result = applyAction(node.state, action);
      if (result.status === 'blocked' || result.status === 'dead') continue;

      const froze = result.events.includes('froze');
      const freezes = node.freezes + (froze ? 1 : 0);
      if (opts.maxFreezes !== undefined && freezes > opts.maxFreezes) continue;

      if (result.status === 'won') {
        const solution: Action[] = [action];
        for (let i = idx; nodes[i].parent !== -1; i = nodes[i].parent) {
          solution.push(nodes[i].action as Action);
        }
        solution.reverse();
        return {
          solvable: true,
          exhausted: false,
          par: solution.length,
          solution,
          statesExplored: visited.size,
          ms: Date.now() - t0,
        };
      }

      const h = hashState(result.state);
      if (visited.has(h)) continue;
      visited.add(h);
      nodes.push({ state: result.state, parent: idx, action, freezes });
    }
  }

  return { solvable: false, exhausted: false, statesExplored: visited.size, ms: Date.now() - t0 };
}

/** Parse a level and solve from its initial state. */
export function solveLevel(level: LevelData, opts: SolveOptions = {}): SolveReport {
  return solveState(parseLevel(level), opts);
}

/**
 * Count distinct winning action sequences of length <= maxDepth, capped at
 * SOLUTION_COUNT_CAP. Memoized on (state hash, remaining depth).
 */
export function countSolutions(start: GameState, maxDepth: number): number {
  const memo = new Map<string, number>();

  function count(state: GameState, depthLeft: number): number {
    if (depthLeft === 0) return 0;
    const key = `${hashState(state)}~${depthLeft}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let total = 0;
    for (const action of availableActions(state)) {
      const result = applyAction(state, action);
      if (result.status === 'won') total += 1;
      else if (result.status === 'moved') total += count(result.state, depthLeft - 1);
      if (total >= SOLUTION_COUNT_CAP) break;
    }
    memo.set(key, Math.min(total, SOLUTION_COUNT_CAP));
    return Math.min(total, SOLUTION_COUNT_CAP);
  }

  return count(start, maxDepth);
}
