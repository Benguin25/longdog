// Feedback side effects: sounds, haptics, and the death flash banner text.
// Presentational only — extracted so the game screen and the tutorial
// screen play identical crunch/crack/door/bark/land/yelp feedback.

import { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';

import { playSfx } from '../audio/sfx';
import { EXIT_STEP_MS, HAPTICS_ENABLED } from '../game/config';
import { buildActionTimelines } from '../render/scene';
import { useGameStore, type Feedback } from '../store/gameStore';

export function useGameFeedbackFx({
  feedback,
  feedbackTick,
  soundEnabled,
  hapticsEnabled,
}: {
  feedback: Feedback;
  feedbackTick: number;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}): { deadFlash: string | null } {
  const [deadFlash, setDeadFlash] = useState<string | null>(null);

  useEffect(() => {
    if (feedbackTick === 0) return;
    const buzz = (fn: () => Promise<unknown>) => {
      if (!HAPTICS_ENABLED || !hapticsEnabled) return;
      fn().catch(() => {});
    };
    if (feedback.kind === 'dead') {
      playSfx('yelp', soundEnabled);
      buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      setDeadFlash(feedback.cause === 'spikes' ? 'Yelp! Spikes!' : 'Yelp! Long fall!');
      const t = setTimeout(() => setDeadFlash(null), 900);
      return () => clearTimeout(t);
    }
    if (feedback.kind === 'events') {
      const ev = feedback.events;
      const timers: ReturnType<typeof setTimeout>[] = [];
      // Time the crunch and the landing thud to the dogs' action timelines
      // (a bone eaten mid-fall crunches when the head actually reaches it).
      const st = useGameStore.getState();
      const timelines = st.state
        ? [...buildActionTimelines(st.state, st.prevState, st.fallRows, st.fallEats).values()]
        : [];
      if (ev.includes('ate')) {
        const crunch = () => {
          playSfx('crunch', soundEnabled);
          buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
        };
        const eatAts = timelines.flatMap((tl) => tl.eatAt);
        if (eatAts.length === 0) eatAts.push(0);
        for (const at of new Set(eatAts)) {
          if (at <= 0) crunch();
          else timers.push(setTimeout(crunch, at));
        }
      }
      if (ev.includes('froze')) {
        playSfx('crack', soundEnabled);
        buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      }
      if (ev.includes('spawned')) playSfx('door', soundEnabled);
      if (ev.includes('dogExited')) {
        // The bark lands when the head actually reaches the door.
        timers.push(
          setTimeout(() => {
            playSfx('bark', soundEnabled);
            buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
          }, EXIT_STEP_MS),
        );
      } else if (ev.includes('fell')) {
        // Play the thud when the fall tween actually lands, not at move time.
        const landAt = Math.max(0, ...timelines.map((tl) => tl.landAt));
        timers.push(setTimeout(() => playSfx('land', soundEnabled), landAt));
      }
      return () => timers.forEach(clearTimeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, feedbackTick, soundEnabled, hapticsEnabled]);

  return { deadFlash };
}
