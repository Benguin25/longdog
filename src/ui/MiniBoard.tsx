// A tiny, non-interactive live board: the real GameCanvas rendering a fixed
// level (optionally after a scripted, pre-verified sequence of moves). Used
// wherever the app wants an illustration that is literally the in-game art
// instead of a copy of it (How to Play pages, the shop's cosmetic previews).

import React, { useMemo } from 'react';
import { View } from 'react-native';

import type { AccessoryId, CoatColors, PackPalette } from '../game/config';
import { DEFAULT_COAT } from '../game/config';
import { applyAction, parseLevel, type Action, type GameState, type LevelData } from '../game/rules';
import { GameCanvas } from '../render/GameCanvas';

export function MiniBoard({
  level,
  moves = [],
  width,
  height,
  pack = 0,
  active = true,
  coat = DEFAULT_COAT,
  accessory = null,
  palette,
}: {
  level: LevelData;
  moves?: readonly Action[];
  width: number;
  height: number;
  pack?: number;
  active?: boolean;
  coat?: CoatColors;
  accessory?: AccessoryId | null;
  palette?: PackPalette;
}) {
  const state = useMemo<GameState>(() => {
    let s = parseLevel(level);
    for (const action of moves) {
      const result = applyAction(s, action);
      if (result.status !== 'moved' && result.status !== 'won') {
        if (__DEV__) {
          throw new Error(
            `MiniBoard: scripted move '${action}' was '${result.status}' for level ${level.id}`,
          );
        }
        break;
      }
      s = result.state;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, moves]);

  if (!active) return <View style={{ width, height }} />;

  return (
    <GameCanvas
      state={state}
      prevState={null}
      fallRows={{}}
      fallEats={{}}
      width={width}
      height={height}
      pack={pack}
      feedback={{ kind: 'none' }}
      feedbackTick={0}
      won={false}
      exited={null}
      highlight={[]}
      coat={coat}
      accessory={accessory}
      palette={palette}
    />
  );
}
