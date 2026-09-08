// Session game store. All rule outcomes come from src/game/rules.ts — this
// store only sequences states and UI feedback events.

import { create } from 'zustand';

import { DEATH_FX_MS } from '../game/config';
import { buildActionTimelines } from '../render/scene';

import {
  applyAction,
  parseLevel,
  type Action,
  type DeathCause,
  type Dog,
  type FallEats,
  type FallRows,
  type GameEvent,
  type GameState,
  type LevelData,
} from '../game/rules';
import { levelById } from '../game/levels';

export type Feedback =
  | { kind: 'none' }
  | { kind: 'blocked' }
  | { kind: 'dead'; cause: DeathCause }
  | { kind: 'events'; events: readonly GameEvent[] };

let deathTimers: ReturnType<typeof setTimeout>[] = [];
function cancelDeathTimers() {
  deathTimers.forEach(clearTimeout);
  deathTimers = [];
}

interface GameStore {
  level: LevelData | null;
  state: GameState | null;
  /** State before the latest applied action — the renderer tweens prev -> state. */
  prevState: GameState | null;
  /** Rows each dog fell in the latest action (drives the fall tween). */
  fallRows: FallRows;
  fallEats: FallEats;
  moveCount: number;
  won: boolean;
  resolvingDeath: boolean;
  /** Feedback for the latest input, with a tick so repeats retrigger effects. */
  feedback: Feedback;
  feedbackTick: number;
  /** The dog that just walked out the exit in the latest action, if any. */
  exited: Dog | null;

  loadLevel: (id: string) => void;
  loadLevelData: (level: LevelData) => void;
  dispatch: (action: Action) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  level: null,
  state: null,
  prevState: null,
  fallRows: {},
  fallEats: {},
  moveCount: 0,
  won: false,
  resolvingDeath: false,
  feedback: { kind: 'none' },
  feedbackTick: 0,
  exited: null,

  loadLevel: (id) => {
    const level = levelById(id);
    if (!level) return;
    get().loadLevelData(level);
  },

  loadLevelData: (level) => {
    cancelDeathTimers();
    set({
      level,
      state: parseLevel(level),
      prevState: null,
      fallRows: {},
      fallEats: {},
      moveCount: 0,
      won: false,
      resolvingDeath: false,
      feedback: { kind: 'none' },
      feedbackTick: 0,
      exited: null,
    });
  },

  dispatch: (action) => {
    const { state, won, resolvingDeath, moveCount, feedbackTick } = get();
    if (!state || won || resolvingDeath) return;

    const result = applyAction(state, action);
    switch (result.status) {
      case 'blocked':
        set({ feedback: { kind: 'blocked' }, feedbackTick: feedbackTick + 1 });
        return;
      case 'dead': {
        if (result.state && result.fallRows && result.fallEats) {
          const terminalState = result.state;
          const duration = Math.max(
            0,
            ...[...buildActionTimelines(terminalState, state, result.fallRows, result.fallEats).values()]
              .map((timeline) => timeline.totalMs),
          );
          cancelDeathTimers();
          set({
            prevState: state,
            state: terminalState,
            fallRows: result.fallRows,
            fallEats: result.fallEats,
            resolvingDeath: true,
            feedback: { kind: 'events', events: ['fell'] },
            feedbackTick: feedbackTick + 1,
            exited: null,
          });
          deathTimers = [setTimeout(() => {
            if (get().state !== terminalState) return;
            set({ feedback: { kind: 'dead', cause: result.cause }, feedbackTick: get().feedbackTick + 1 });
            deathTimers = [];
          }, duration)];
          return;
        }
        // Spec: death is an auto-undo — the pre-move state is kept.
        set({
          resolvingDeath: true,
          feedback: { kind: 'dead', cause: result.cause },
          feedbackTick: feedbackTick + 1,
        });
        return;
      }
      case 'moved':
      case 'won':
        set({
          prevState: state,
          state: result.state,
          fallRows: result.fallRows,
          fallEats: result.fallEats,
          moveCount: moveCount + 1,
          won: result.status === 'won',
          feedback: { kind: 'events', events: result.events },
          feedbackTick: feedbackTick + 1,
          exited: result.exited ?? null,
        });
        return;
    }
  },

  reset: () => {
    const { level, feedbackTick } = get();
    if (!level) return;
    cancelDeathTimers();
    set({
      state: parseLevel(level),
      prevState: null,
      fallRows: {},
      fallEats: {},
      moveCount: 0,
      won: false,
      resolvingDeath: false,
      feedback: { kind: 'none' },
      feedbackTick: feedbackTick + 1,
      exited: null,
    });
  },
}));
