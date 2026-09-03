// Tutorial script types + pure helpers. No rule logic lives here: this file
// only reads GameState for highlight targets and interprets the Feedback
// the store already derives from rules.ts — it never re-implements a rule.

import type { Feedback } from '../store/gameStore';
import type { Action, Cell, GameState, LevelData } from './rules';

export type TutorialUntil =
  | 'moved'
  | 'ate'
  | 'exitOpened'
  | 'fell'
  | 'dead'
  | 'froze'
  | 'dogExited'
  | 'undo'
  | 'continue';

export type TutorialAllow = Action | 'undo';

export type TutorialHighlight =
  | 'exit'
  | 'snacks'
  | 'spikes'
  | 'freeze'
  | 'doghouse'
  | 'head'
  | 'otherDog';

export interface TutorialStep {
  readonly say: string;
  /** Inputs accepted this step, in addition to undo (always allowed).
   *  Undefined = any input accepted. */
  readonly allow?: readonly TutorialAllow[];
  readonly until: TutorialUntil;
  readonly highlight?: TutorialHighlight;
}

export type TutorialLevel = LevelData & { readonly script: readonly TutorialStep[] };

const parseKeys = (keys: ReadonlySet<string>): Cell[] =>
  [...keys].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });

/** Cells to draw a highlight ring on for a step's target, read off state. */
export function resolveHighlight(
  kind: TutorialHighlight | undefined,
  state: GameState,
): readonly Cell[] {
  switch (kind) {
    case 'exit':
      return [state.exit];
    case 'snacks':
      return state.snacks;
    case 'spikes':
      return parseKeys(state.spikes);
    case 'freeze':
      return parseKeys(state.freezeTiles);
    case 'doghouse':
      return state.doghouse ? [state.doghouse] : [];
    case 'head': {
      const dog = state.dogs[state.activeDog];
      return dog ? [dog.cells[0]] : [];
    }
    case 'otherDog':
      return state.dogs.filter((_, i) => i !== state.activeDog).map((d) => d.cells[0]);
    default:
      return [];
  }
}

export type TutorialOutcome =
  | { readonly kind: 'action'; readonly feedback: Feedback }
  | { readonly kind: 'undo' }
  | { readonly kind: 'continue' };

/** Whether `outcome` satisfies `step`'s advance condition. */
export function stepSatisfied(step: TutorialStep, outcome: TutorialOutcome): boolean {
  const until = step.until;
  if (until === 'undo') return outcome.kind === 'undo';
  if (until === 'continue') return outcome.kind === 'continue';
  if (outcome.kind !== 'action') return false;
  const { feedback } = outcome;
  if (until === 'dead') return feedback.kind === 'dead';
  if (feedback.kind !== 'events') return false;
  if (until === 'moved') return true;
  return feedback.events.includes(until);
}

/** Whether `input` is an accepted move for `step` (undo always is). */
export function inputAllowed(step: TutorialStep, input: TutorialAllow): boolean {
  if (input === 'undo') return true;
  return step.allow === undefined || step.allow.includes(input);
}
