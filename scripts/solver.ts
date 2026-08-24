// Long Dog — headless BFS solver.
//
// Imports the pure rules engine directly (never duplicates rule logic).
// BFS over full game state (dog bodies, snacks left, statues, active dog)
// with state hashing for dedupe. Reports: solvable?, optimal move count
// (par), one optimal solution, and the number of distinct solutions of
// length <= par + 2.
//
// Usage:
//   npx tsx scripts/solver.ts <level.json> [<level.json> ...]
//   npx tsx scripts/solver.ts --all            # solve every level in src/game/levels
//   npx tsx scripts/solver.ts --max-states N <level.json>

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  applyAction,
  availableActions,
  hashState,
  parseLevel,
  type Action,
  type GameState,
  type LevelData,
} from '../src/game/rules';

const DEFAULT_MAX_STATES = 2_000_000;
const SOLUTION_COUNT_CAP = 1000;

interface SolveReport {
  solvable: boolean;
  exhausted: boolean; // hit the state cap before exhausting the space
  par?: number;
  solution?: Action[];
  solutionsNearOptimal?: number; // distinct solutions with length <= par + 2
  statesExplored: number;
  ms: number;
}

interface Node {
  state: GameState;
  parent: number; // index into nodes, -1 for root
  action: Action | null;
}

export function solve(level: LevelData, maxStates = DEFAULT_MAX_STATES): SolveReport {
  const t0 = Date.now();
  const start = parseLevel(level);

  const nodes: Node[] = [{ state: start, parent: -1, action: null }];
  const visited = new Set<string>([hashState(start)]);
  let head = 0;

  while (head < nodes.length) {
    if (visited.size > maxStates) {
      return { solvable: false, exhausted: true, statesExplored: visited.size, ms: Date.now() - t0 };
    }
    const idx = head++;
    const node = nodes[idx];

    for (const action of availableActions(node.state)) {
      const result = applyAction(node.state, action);
      if (result.status === 'blocked' || result.status === 'dead') continue;

      if (result.status === 'won') {
        const solution: Action[] = [action];
        for (let i = idx; nodes[i].parent !== -1; i = nodes[i].parent) {
          solution.push(nodes[i].action as Action);
        }
        solution.reverse();
        const par = solution.length;
        const solutionsNearOptimal = countSolutions(start, par + 2);
        return {
          solvable: true,
          exhausted: false,
          par,
          solution,
          solutionsNearOptimal,
          statesExplored: visited.size,
          ms: Date.now() - t0,
        };
      }

      const h = hashState(result.state);
      if (visited.has(h)) continue;
      visited.add(h);
      nodes.push({ state: result.state, parent: idx, action });
    }
  }

  return { solvable: false, exhausted: false, statesExplored: visited.size, ms: Date.now() - t0 };
}

/**
 * Count distinct winning action sequences of length <= maxDepth, capped at
 * SOLUTION_COUNT_CAP. Memoized on (state hash, remaining depth).
 */
function countSolutions(start: GameState, maxDepth: number): number {
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

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const ACTION_LABEL: Record<Action, string> = {
  up: 'U',
  down: 'D',
  left: 'L',
  right: 'R',
  swap: 'SWAP',
};

function formatSolution(solution: Action[]): string {
  return solution.map((a) => ACTION_LABEL[a]).join(' ');
}

function runCli(): void {
  const args = process.argv.slice(2);
  let maxStates = DEFAULT_MAX_STATES;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--max-states') {
      maxStates = Number(args[++i]);
    } else if (a === '--all') {
      const dir = resolve(__dirname, '../src/game/levels');
      for (const f of readdirSync(dir).sort()) {
        if (f.endsWith('.json')) files.push(join(dir, f));
      }
    } else {
      files.push(a);
    }
  }

  if (files.length === 0) {
    console.error('usage: tsx scripts/solver.ts [--all] [--max-states N] <level.json> ...');
    process.exit(2);
  }

  let anyUnsolvable = false;
  for (const file of files) {
    const level = JSON.parse(readFileSync(file, 'utf8')) as LevelData;
    const report = solve(level, maxStates);

    console.log(`=== ${level.id} — ${level.name} ===`);
    if (report.solvable && report.solution) {
      console.log(`solvable: YES`);
      console.log(`par (optimal moves): ${report.par}`);
      console.log(`solution: ${formatSolution(report.solution)}`);
      const cap = report.solutionsNearOptimal === SOLUTION_COUNT_CAP ? '+' : '';
      console.log(`distinct solutions <= par+2: ${report.solutionsNearOptimal}${cap}`);
    } else if (report.exhausted) {
      anyUnsolvable = true;
      console.log(`solvable: UNKNOWN (state cap ${maxStates} hit)`);
    } else {
      anyUnsolvable = true;
      console.log(`solvable: NO (search space exhausted)`);
    }
    console.log(`states explored: ${report.statesExplored} (${report.ms}ms)`);
    console.log('');
  }

  process.exit(anyUnsolvable ? 1 : 0);
}

runCli();
