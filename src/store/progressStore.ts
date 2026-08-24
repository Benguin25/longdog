// Persistent progression: stars per level, furthest level, settings.
// Backed by AsyncStorage via zustand's persist middleware (SPEC: persistence
// of furthest level, stars per level, settings via AsyncStorage).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LEVELS } from '../game/levels';

interface ProgressStore {
  /** Best star count per level id (absent = never cleared). */
  stars: Record<string, number>;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  /** True once AsyncStorage rehydration finished (gates lock rendering). */
  hydrated: boolean;

  recordClear: (levelId: string, stars: number) => void;
  setSoundEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  resetProgress: () => void;
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set) => ({
      stars: {},
      soundEnabled: true,
      hapticsEnabled: true,
      hydrated: false,

      recordClear: (levelId, s) =>
        set((st) => ({
          stars: { ...st.stars, [levelId]: Math.max(st.stars[levelId] ?? 0, s) },
        })),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setHydrated: (v) => set({ hydrated: v }),
      resetProgress: () => set({ stars: {} }),
    }),
    {
      name: 'longdog-progress',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        stars: s.stars,
        soundEnabled: s.soundEnabled,
        hapticsEnabled: s.hapticsEnabled,
      }),
      onRehydrateStorage: () => () => {
        useProgressStore.getState().setHydrated(true);
      },
    },
  ),
);

/** A level is playable once every earlier level has been cleared. */
export function isLevelUnlocked(stars: Record<string, number>, levelIndex: number): boolean {
  if (levelIndex <= 0) return true;
  const prev = LEVELS[levelIndex - 1];
  return prev !== undefined && (stars[prev.id] ?? 0) > 0;
}

/** Index of the furthest unlocked level (the one "Play" continues at). */
export function furthestUnlockedIndex(stars: Record<string, number>): number {
  for (let i = 0; i < LEVELS.length; i++) {
    if ((stars[LEVELS[i].id] ?? 0) === 0) return i;
  }
  return LEVELS.length - 1;
}

export function totalStars(stars: Record<string, number>): number {
  return LEVELS.reduce((sum, l) => sum + (stars[l.id] ?? 0), 0);
}
