import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { HAPTICS_ENABLED, STARS_PAR_WINDOW, SWIPE_MIN_DISTANCE } from '../../src/game/config';
import type { Dir } from '../../src/game/rules';
import { LEVELS } from '../../src/game/levels';
import { GameCanvas } from '../../src/render/GameCanvas';
import { useGameStore } from '../../src/store/gameStore';
import { DPad } from '../../src/ui/DPad';
import { HudButton } from '../../src/ui/HudButton';

function buzz(fn: () => Promise<unknown>) {
  if (!HAPTICS_ENABLED) return;
  fn().catch(() => {});
}

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const level = useGameStore((s) => s.level);
  const state = useGameStore((s) => s.state);
  const prevState = useGameStore((s) => s.prevState);
  const moveCount = useGameStore((s) => s.moveCount);
  const won = useGameStore((s) => s.won);
  const feedback = useGameStore((s) => s.feedback);
  const feedbackTick = useGameStore((s) => s.feedbackTick);
  const loadLevel = useGameStore((s) => s.loadLevel);
  const dispatch = useGameStore((s) => s.dispatch);
  const undo = useGameStore((s) => s.undo);
  const reset = useGameStore((s) => s.reset);

  const [board, setBoard] = useState({ w: 0, h: 0 });
  const [deadFlash, setDeadFlash] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadLevel(id);
  }, [id, loadLevel]);

  // Feedback side effects (haptics + death flash). Presentational only.
  useEffect(() => {
    if (feedbackTick === 0) return;
    if (feedback.kind === 'dead') {
      buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      setDeadFlash(feedback.cause === 'spikes' ? 'Yelp! Spikes!' : 'Yelp! Long fall!');
      const t = setTimeout(() => setDeadFlash(null), 900);
      return () => clearTimeout(t);
    }
    if (feedback.kind === 'events') {
      if (feedback.events.includes('ate')) buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      if (feedback.events.includes('froze')) buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      if (feedback.events.includes('dogExited')) buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    }
  }, [feedback, feedbackTick]);

  useEffect(() => {
    if (won) buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  }, [won]);

  const onMove = useCallback((dir: Dir) => dispatch(dir), [dispatch]);

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
  const nextLevel = levelIndex >= 0 ? LEVELS[levelIndex + 1] : undefined;
  const stars =
    par === undefined ? 1 : moveCount <= par ? 3 : moveCount <= par + STARS_PAR_WINDOW ? 2 : 1;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hud}>
        <HudButton label="‹ Back" onPress={() => router.replace('/')} />
        <View style={styles.hudCenter}>
          <Text style={styles.header}>{level.name}</Text>
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
            <GameCanvas state={state} prevState={prevState} width={board.w} height={board.h} />
          )}
          {deadFlash && (
            <View style={styles.deadBanner} pointerEvents="none">
              <Text style={styles.deadText}>{deadFlash}</Text>
            </View>
          )}
        </View>
      </GestureDetector>

      <View style={styles.controls}>
        <View style={styles.sideButtons}>
          <HudButton label="Reset" onPress={reset} />
          {state.dogs.length > 1 && <HudButton label="Swap" onPress={() => dispatch('swap')} />}
        </View>
        <DPad onMove={onMove} />
        <View style={styles.sideButtons} />
      </View>

      {won && (
        <View style={styles.overlay}>
          <View style={styles.clearCard}>
            <Text style={styles.clearTitle}>Level Clear!</Text>
            <Text style={styles.clearStars}>{'★'.repeat(stars) + '☆'.repeat(3 - stars)}</Text>
            <Text style={styles.clearMoves}>
              {moveCount} moves{par !== undefined ? ` · par ${par}` : ''}
            </Text>
            <View style={styles.clearButtons}>
              <HudButton label="Replay" onPress={reset} />
              {nextLevel ? (
                <HudButton label="Next ›" onPress={() => router.replace(`/game/${nextLevel.id}`)} />
              ) : (
                <HudButton label="Home" onPress={() => router.replace('/')} />
              )}
            </View>
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
    backgroundColor: 'rgba(59, 42, 26, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    minWidth: 240,
  },
  clearTitle: { fontSize: 24, fontWeight: '900', color: '#3B2A1A' },
  clearStars: { fontSize: 30, color: '#E8A33D', marginVertical: 6 },
  clearMoves: { fontSize: 14, color: '#4A362A', marginBottom: 14 },
  clearButtons: { flexDirection: 'row', gap: 10 },
});
