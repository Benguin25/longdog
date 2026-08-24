// Long Dog — headless solver CLI.
//
// The BFS itself lives in src/game/solve.ts (pure, shared with the
// generator and the in-app hint feature) and consumes only the rules
// engine — rule logic is never duplicated.
//
// Usage:
//   npx tsx scripts/solver.ts <level.json> [<level.json> ...]
//   npx tsx scripts/solver.ts --all            # solve every level in src/game/levels
//   npx tsx scripts/solver.ts --max-states N <level.json>

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseLevel, type Action, type LevelData } from '../src/game/rules';
import {
  countSolutions,
  DEFAULT_MAX_STATES,
  SOLUTION_COUNT_CAP,
  solveLevel,
} from '../src/game/solve';

const ACTION_LABEL: Record<Action, string> = {
  up: 'U',
  down: 'D',
  left: 'L',
  right: 'R',
  swap: 'SWAP',
};

export function formatSolution(solution: readonly Action[]): string {
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
    const report = solveLevel(level, { maxStates });

    console.log(`=== ${level.id} — ${level.name} ===`);
    if (report.solvable && report.solution && report.par !== undefined) {
      const near = countSolutions(parseLevel(level), report.par + 2);
      console.log(`solvable: YES`);
      console.log(`par (optimal moves): ${report.par}`);
      console.log(`solution: ${formatSolution(report.solution)}`);
      const cap = near === SOLUTION_COUNT_CAP ? '+' : '';
      console.log(`distinct solutions <= par+2: ${near}${cap}`);
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
