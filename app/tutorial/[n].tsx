import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { HAPTICS_ENABLED, SWIPE_MIN_DISTANCE } from '../../src/game/config';
import { initSfx, unloadSfx } from '../../src/audio/sfx';
import { DIRS, type Dir } from '../../src/game/rules';
import { TUTORIAL_LEVELS } from '../../src/game/levels/tutorial';
import {
  inputAllowed,
  resolveHighlight,
  stepSatisfied,
  type TutorialAllow,
  type TutorialOutcome,
} from '../../src/game/tutorial';
import { GameCanvas } from '../../src/render/GameCanvas';
import { exitDurationMs } from '../../src/render/scene';
import { useGameStore } from '../../src/store/gameStore';
import { useProgressStore } from '../../src/store/progressStore';
import { DPad } from '../../src/ui/DPad';
import { HudButton } from '../../src/ui/HudButton';
import { useGameFeedbackFx } from '../../src/ui/useGameFeedbackFx';

interface Progress {
  stepIndex: number;
  /** moveCount at which each step became the active step. */
  stepStartMoves: number[];
}

export default function TutorialScreen() {
  const { n } = useLocalSearchParams<{ n: string }>();
  const router = useRouter();
  const lessonNumber = Math.max(1, Math.min(TUTORIAL_LEVELS.length, Number(n) || 1));
  const tutorialLevel = TUTORIAL_LEVELS[lessonNumber - 1];

  const state = useGameStore((s) => s.state);
  const prevState = useGameStore((s) => s.prevState);
  const fallRows = useGameStore((s) => s.fallRows);
  const fallEats = useGameStore((s) => s.fallEats);
  const feedback = useGameStore((s) => s.feedback);
  const feedbackTick = useGameStore((s) => s.feedbackTick);
  const won = useGameStore((s) => s.won);
  const exited = useGameStore((s) => s.exited);
  const moveCount = useGameStore((s) => s.moveCount);
  const loadLevelData = useGameStore((s) => s.loadLevelData);
  const reset = useGameStore((s) => s.reset);

  const hapticsEnabled = useProgressStore((s) => s.hapticsEnabled);
  const soundEnabled = useProgressStore((s) => s.soundEnabled);
  const setTutorialDone = useProgressStore((s) => s.setTutorialDone);

  const { deadFlash } = useGameFeedbackFx({ feedback, feedbackTick, soundEnabled, hapticsEnabled });

  const [board, setBoard] = useState({ w: 0, h: 0 });
  const [progress, setProgressState] = useState<Progress>({ stepIndex: 0, stepStartMoves: [0] });
  const progressRef = useRef<Progress>(progress);
  const [lessonComplete, setLessonComplete] = useState(false);
  const clearedRef = useRef(false);

  const updateProgress = useCallback((next: Progress) => {
    progressRef.current = next;
    setProgressState(next);
  }, []);

  const wiggleX = useSharedValue(0);
  const wiggleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: wiggleX.value }] }));
  const triggerWiggle = useCallback(() => {
    wiggleX.value = withSequence(
      withTiming(-8, { duration: 40 }),
      withTiming(8, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 50 }),
      withTiming(0, { duration: 40 }),
    );
    if (HAPTICS_ENABLED && hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hapticsEnabled]);

  const step = tutorialLevel.script[progress.stepIndex];

  // Load the lesson (and reset the controller) whenever it changes.
  useEffect(() => {
    loadLevelData(tutorialLevel);
    updateProgress({ stepIndex: 0, stepStartMoves: [0] });
    clearedRef.current = false;
    setLessonComplete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialLevel]);

  useEffect(() => {
    void initSfx();
    return () => {
      void unloadSfx();
    };
  }, []);

  // Lesson complete: wait out the winning dog's exit walk before showing
  // the completion card (same delay as the game screen's clear card).
  useEffect(() => {
    if (!won || clearedRef.current) return;
    clearedRef.current = true;
    const walk = exited ? exitDurationMs(exited.cells.length) : 0;
    const t = setTimeout(() => {
      setLessonComplete(true);
      if (lessonNumber === TUTORIAL_LEVELS.length) setTutorialDone(true);
    }, walk);
    return () => clearTimeout(t);
  }, [won, exited, lessonNumber, setTutorialDone]);

  const handleInput = useCallback(
    (input: TutorialAllow) => {
      const script = tutorialLevel.script;
      const { stepIndex, stepStartMoves } = progressRef.current;
      const curStep = script[stepIndex];
      if (!curStep) return;

      if (!inputAllowed(curStep, input)) {
        triggerWiggle();
        return;
      }

      if (input === 'undo') {
        useGameStore.getState().undo();
      } else {
        useGameStore.getState().dispatch(input);
      }

      const st = useGameStore.getState();
      let idx = stepIndex;
      let starts = stepStartMoves;

      const outcome: TutorialOutcome =
        input === 'undo' ? { kind: 'undo' } : { kind: 'action', feedback: st.feedback };

      // Check whether this input completes the CURRENT step first — an undo
      // that satisfies an `until: 'undo'` step should advance, even though
      // it also rewinds moveCount. Only fall back to resyncing stepIndex
      // (the player rewound past where this step began) when it doesn't.
      if (stepSatisfied(curStep, outcome) && idx + 1 < script.length) {
        starts = [...starts];
        starts[idx + 1] = st.moveCount;
        idx += 1;
      } else if (input === 'undo') {
        while (idx > 0 && st.moveCount < starts[idx]) idx -= 1;
      }

      if (idx !== stepIndex || starts !== stepStartMoves) {
        updateProgress({ stepIndex: idx, stepStartMoves: starts });
      }
    },
    [tutorialLevel, triggerWiggle, updateProgress],
  );

  const handleContinue = useCallback(() => {
    const script = tutorialLevel.script;
    const { stepIndex, stepStartMoves } = progressRef.current;
    const curStep = script[stepIndex];
    if (!curStep || stepIndex + 1 >= script.length) return;
    if (!stepSatisfied(curStep, { kind: 'continue' })) return;
    const st = useGameStore.getState();
    const starts = [...stepStartMoves];
    starts[stepIndex + 1] = st.moveCount;
    updateProgress({ stepIndex: stepIndex + 1, stepStartMoves: starts });
  }, [tutorialLevel, updateProgress]);

  const handleReset = useCallback(() => {
    reset();
    updateProgress({ stepIndex: 0, stepStartMoves: [0] });
    clearedRef.current = false;
    setLessonComplete(false);
  }, [reset, updateProgress]);

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .minDistance(SWIPE_MIN_DISTANCE)
    .onEnd((e) => {
      const { translationX: dx, translationY: dy } = e;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_DISTANCE) return;
      const dir: Dir =
        Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      handleInput(dir);
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => handleInput('swap'));
  const boardGesture = Gesture.Exclusive(swipe, tap);

  if (!state) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.header}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const highlight = step ? resolveHighlight(step.highlight, state) : [];
  const enabledDirs = step?.allow
    ? step.allow.filter((a): a is Dir => (DIRS as readonly string[]).includes(a))
    : undefined;
  const nextLesson = lessonNumber < TUTORIAL_LEVELS.length ? lessonNumber + 1 : null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hud}>
        <HudButton label="‹ Exit" onPress={() => router.replace('/')} />
        <View style={styles.hudCenter}>
          <Text style={styles.header}>
            Tutorial {lessonNumber}/{TUTORIAL_LEVELS.length}
          </Text>
          <Text style={styles.counter}>{tutorialLevel.name}</Text>
        </View>
        <View style={styles.hudRight}>
          <HudButton label="Undo" onPress={() => handleInput('undo')} disabled={moveCount === 0} />
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
              fallEats={fallEats}
              width={board.w}
              height={board.h}
              pack={0}
              feedback={feedback}
              feedbackTick={feedbackTick}
              won={won}
              exited={exited}
              highlight={highlight}
            />
          )}

          {step && (
            <Animated.View style={[styles.coach, wiggleStyle]} pointerEvents="box-none">
              <Text style={styles.coachText}>{step.say}</Text>
              {step.until === 'continue' && (
                <HudButton label="Got it ›" onPress={handleContinue} />
              )}
            </Animated.View>
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
          <HudButton label="Reset" onPress={handleReset} />
          {state.dogs.length > 1 && <HudButton label="Swap" onPress={() => handleInput('swap')} />}
        </View>
        <DPad onMove={(dir) => handleInput(dir)} enabled={enabledDirs} />
        <View style={styles.sideButtons} />
      </View>

      {lessonComplete && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.clearCard}>
            <Text style={styles.clearTitle}>Lesson complete!</Text>
            {nextLesson !== null ? (
              <HudButton label="Next lesson ›" onPress={() => router.replace(`/tutorial/${nextLesson}`)} />
            ) : (
              <HudButton label="Play Level 1 ›" onPress={() => router.replace('/game/level001')} />
            )}
            <View style={{ height: 8 }} />
            <HudButton label="Home" onPress={() => router.replace('/')} />
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
  hudRight: { flexDirection: 'row', gap: 8 },
  header: { fontSize: 18, fontWeight: '800', color: '#3B2A1A' },
  counter: { fontSize: 13, color: '#4A362A', marginTop: 2 },
  board: { flex: 1, marginVertical: 6 },
  coach: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  coachText: { fontSize: 15, lineHeight: 21, color: '#3B2A1A', fontWeight: '700', textAlign: 'center' },
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
    backgroundColor: 'rgba(59, 42, 26, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 10,
  },
  clearTitle: { fontSize: 26, fontWeight: '900', color: '#3B2A1A' },
});
