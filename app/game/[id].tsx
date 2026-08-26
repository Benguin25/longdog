import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import {
  HAPTICS_ENABLED,
  HINT_MAX_STATES,
  HINT_MOVES,
  MOVE_TWEEN_MS,
  PACK_SIZE,
  SHOW_FPS_OVERLAY,
  SHOW_HINT_BUTTON,
  SWIPE_MIN_DISTANCE,
  WIN_NAVIGATE_MS,
} from '../../src/game/config';
import { initSfx, playSfx, unloadSfx } from '../../src/audio/sfx';
import type { Action, Dir } from '../../src/game/rules';
import { LEVELS } from '../../src/game/levels';
import { starsForClear } from '../../src/game/scoring';
import { solveState } from '../../src/game/solve';
import { GameCanvas } from '../../src/render/GameCanvas';
import { fallDurationMs } from '../../src/render/scene';
import { useGameStore } from '../../src/store/gameStore';
import { useProgressStore } from '../../src/store/progressStore';
import { DPad } from '../../src/ui/DPad';
import { FpsOverlay } from '../../src/ui/FpsOverlay';
import { HudButton } from '../../src/ui/HudButton';

const HINT_ARROW: Record<Action, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  swap: '⇄',
};

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const level = useGameStore((s) => s.level);
  const state = useGameStore((s) => s.state);
  const prevState = useGameStore((s) => s.prevState);
  const fallRows = useGameStore((s) => s.fallRows);
  const moveCount = useGameStore((s) => s.moveCount);
  const won = useGameStore((s) => s.won);
  const feedback = useGameStore((s) => s.feedback);
  const feedbackTick = useGameStore((s) => s.feedbackTick);
  const loadLevel = useGameStore((s) => s.loadLevel);
  const dispatch = useGameStore((s) => s.dispatch);
  const undo = useGameStore((s) => s.undo);
  const reset = useGameStore((s) => s.reset);

  const hapticsEnabled = useProgressStore((s) => s.hapticsEnabled);
  const soundEnabled = useProgressStore((s) => s.soundEnabled);
  const recordClear = useProgressStore((s) => s.recordClear);

  const [board, setBoard] = useState({ w: 0, h: 0 });
  const [deadFlash, setDeadFlash] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const buzz = useCallback(
    (fn: () => Promise<unknown>) => {
      if (!HAPTICS_ENABLED || !hapticsEnabled) return;
      fn().catch(() => {});
    },
    [hapticsEnabled],
  );

  useEffect(() => {
    if (id) loadLevel(id);
  }, [id, loadLevel]);

  // Preload the synthesized sound effects; release them on unmount.
  useEffect(() => {
    void initSfx();
    return () => {
      void unloadSfx();
    };
  }, []);

  // Feedback side effects (sounds + haptics + death flash). Presentational only.
  useEffect(() => {
    if (feedbackTick === 0) return;
    setHint(null); // any input invalidates a shown hint
    if (feedback.kind === 'dead') {
      playSfx('yelp', soundEnabled);
      buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      setDeadFlash(feedback.cause === 'spikes' ? 'Yelp! Spikes!' : 'Yelp! Long fall!');
      const t = setTimeout(() => setDeadFlash(null), 900);
      return () => clearTimeout(t);
    }
    if (feedback.kind === 'events') {
      const ev = feedback.events;
      if (ev.includes('ate')) {
        playSfx('crunch', soundEnabled);
        buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      }
      if (ev.includes('froze')) {
        playSfx('crack', soundEnabled);
        buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      }
      if (ev.includes('spawned')) playSfx('door', soundEnabled);
      if (ev.includes('dogExited')) {
        playSfx('bark', soundEnabled);
        buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      } else if (ev.includes('fell')) {
        // Play the thud when the fall tween actually lands, not at move time.
        const rows = Object.values(useGameStore.getState().fallRows);
        const landAt = MOVE_TWEEN_MS + fallDurationMs(rows.length ? Math.max(...rows) : 0);
        const landTimer = setTimeout(() => playSfx('land', soundEnabled), landAt);
        return () => clearTimeout(landTimer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, feedbackTick, buzz]);

  // On win: persist stars, then hand off to the level-clear screen
  // (delayed so the confetti + happy bark get their moment).
  const clearedRef = useRef(false);
  useEffect(() => {
    if (!won || !level || clearedRef.current) return;
    clearedRef.current = true;
    buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    recordClear(level.id, starsForClear(moveCount, level.par));
    const t = setTimeout(() => {
      router.replace(`/clear/${level.id}?moves=${moveCount}`);
    }, WIN_NAVIGATE_MS);
    return () => clearTimeout(t);
  }, [won, level, moveCount, recordClear, router, buzz]);

  useEffect(() => {
    clearedRef.current = false;
  }, [id]);

  const onMove = useCallback((dir: Dir) => dispatch(dir), [dispatch]);

  const onHint = useCallback(() => {
    const s = useGameStore.getState().state;
    if (!s || useGameStore.getState().won) return;
    const report = solveState(s, { maxStates: HINT_MAX_STATES });
    if (report.solvable && report.solution && report.solution.length > 0) {
      const moves = report.solution.slice(0, HINT_MOVES).map((a) => HINT_ARROW[a]);
      setHint(`Hint: ${moves.join('  ')}`);
    } else {
      setHint('No way out from here — try Undo');
    }
  }, []);

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .minDistance(SWIPE_MIN_DISTANCE)
    .onEnd((e) => {
      const { translationX: dx, translationY: dy } = e;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_DISTANCE) return;
      const dir: Dir =
        Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      dispatch(dir);
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => dispatch('swap'));
  const boardGesture = Gesture.Exclusive(swipe, tap);

  if (!level || !state) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.header}>Level not found</Text>
        <HudButton label="Home" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const par = level.par;
  const levelIndex = LEVELS.findIndex((l) => l.id === level.id);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hud}>
        <HudButton label="‹ Back" onPress={() => router.replace('/levels')} />
        <View style={styles.hudCenter}>
          <Text style={styles.header}>
            {levelIndex >= 0 ? `${levelIndex + 1}. ` : ''}
            {level.name}
          </Text>
          <Text style={styles.counter}>
            Moves: {moveCount}
            {par !== undefined ? `  ·  Par: ${par}` : ''}
          </Text>
        </View>
        <View style={styles.hudRight}>
          <HudButton label="Undo" onPress={undo} disabled={moveCount === 0} />
        </View>
      </View>

      <GestureDetector gesture={boardGesture}>
        <View
          style={styles.board}
          onLayout={(e) =>
            setBoard({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
        >
          {board.w > 0 && (
            <GameCanvas
              state={state}
              prevState={prevState}
              fallRows={fallRows}
              width={board.w}
              height={board.h}
              pack={levelIndex >= 0 ? Math.floor(levelIndex / PACK_SIZE) : 0}
              feedback={feedback}
              feedbackTick={feedbackTick}
              won={won}
            />
          )}
          {deadFlash && (
            <View style={styles.deadBanner} pointerEvents="none">
              <Text style={styles.deadText}>{deadFlash}</Text>
            </View>
          )}
          {hint && (
            <View style={styles.hintBanner} pointerEvents="none">
              <Text style={styles.hintText}>{hint}</Text>
            </View>
          )}
          {__DEV__ && SHOW_FPS_OVERLAY && <FpsOverlay />}
        </View>
      </GestureDetector>

      <View style={styles.controls}>
        <View style={styles.sideButtons}>
          <HudButton label="Reset" onPress={reset} />
          {state.dogs.length > 1 && <HudButton label="Swap" onPress={() => dispatch('swap')} />}
          {SHOW_HINT_BUTTON && <HudButton label="Hint" onPress={onHint} />}
        </View>
        <DPad onMove={onMove} />
        <View style={styles.sideButtons} />
      </View>

      {won && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.clearCard}>
            <Text style={styles.clearTitle}>Cleared!</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  hudCenter: { alignItems: 'center', flex: 1 },
  hudRight: { flexDirection: 'row' },
  header: { fontSize: 18, fontWeight: '800', color: '#3B2A1A' },
  counter: { fontSize: 13, color: '#4A362A', marginTop: 2 },
  board: { flex: 1, marginVertical: 6 },
  deadBanner: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: '#D9534F',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  deadText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  hintBanner: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: '#3B2A1A',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  hintText: { color: '#F6E7B2', fontWeight: '800', fontSize: 18 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sideButtons: { width: 80, gap: 8 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(59, 42, 26, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 18,
  },
  clearTitle: { fontSize: 26, fontWeight: '900', color: '#3B2A1A' },
});
