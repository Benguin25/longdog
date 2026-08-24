// Session game store. All rule outcomes come from src/game/rules.ts — this
// store only sequences states, history (undo), and UI feedback events.

import { create } from 'zustand';

import {
  applyAction,
  parseLevel,
  type Action,
  type DeathCause,
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

interface GameStore {
  level: LevelData | null;
  state: GameState | null;
  /** State before the latest applied action — the renderer tweens prev -> state. */
  prevState: GameState | null;
  history: GameState[];
  moveCount: number;
  won: boolean;
  /** Feedback for the latest input, with a tick so repeats retrigger effects. */
  feedback: Feedback;
  feedbackTick: number;

  loadLevel: (id: string) => void;
  dispatch: (action: Action) => void;
  undo: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  level: null,
  state: null,
  prevState: null,
  history: [],
  moveCount: 0,
  won: false,
  feedback: { kind: 'none' },
  feedbackTick: 0,

  loadLevel: (id) => {
    const level = levelById(id);
    if (!level) return;
    set({
      level,
      state: parseLevel(level),
      prevState: null,
      history: [],
      moveCount: 0,
      won: false,
      feedback: { kind: 'none' },
      feedbackTick: 0,
    });
  },

  dispatch: (action) => {
    const { state, won, history, moveCount, feedbackTick } = get();
    if (!state || won) return;

    const result = applyAction(state, action);
    switch (result.status) {
      case 'blocked':
        set({ feedback: { kind: 'blocked' }, feedbackTick: feedbackTick + 1 });
        return;
      case 'dead':
        // Spec: death is an auto-undo — the pre-move state is kept.
        set({
          feedback: { kind: 'dead', cause: result.cause },
          feedbackTick: feedbackTick + 1,
        });
        return;
      case 'moved':
      case 'won':
        set({
          prevState: state,
          state: result.state,
          history: [...history, state],
          moveCount: moveCount + 1,
          won: result.status === 'won',
          feedback: { kind: 'events', events: result.events },
          feedbackTick: feedbackTick + 1,
        });
        return;
    }
  },

  undo: () => {
    const { history, state, moveCount, feedbackTick } = get();
    const prev = history[history.length - 1];
    if (!prev || !state) return;
    set({
      prevState: state,
      state: prev,
      history: history.slice(0, -1),
      moveCount: moveCount - 1,
      won: false,
      feedback: { kind: 'none' },
      feedbackTick: feedbackTick + 1,
    });
  },

  reset: () => {
    const { level, feedbackTick } = get();
    if (!level) return;
    set({
      state: parseLevel(level),
      prevState: null,
      history: [],
      moveCount: 0,
      won: false,
      feedback: { kind: 'none' },
      feedbackTick: feedbackTick + 1,
    });
  },
}));
