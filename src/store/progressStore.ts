// Persistent progression: stars per level, furthest level, settings.
// Backed by AsyncStorage via zustand's persist middleware (SPEC: persistence
// of furthest level, stars per level, settings via AsyncStorage).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { BISCUITS_FIRST_CLEAR, BISCUITS_PER_STAR, BISCUITS_TUTORIAL, SHOP_ITEMS } from '../game/config';
import { LEVELS } from '../game/levels';

export interface Equipped {
  coat: string;
  accessory: string | null;
  theme: string | null;
}

const DEFAULT_EQUIPPED: Equipped = { coat: 'classic', accessory: null, theme: null };

interface ProgressStore {
  /** Best star count per level id (absent = never cleared). */
  stars: Record<string, number>;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  /** True once the first-launch "play the tutorial?" prompt has been shown. */
  tutorialPrompted: boolean;
  /** True once the player has finished all five tutorial lessons. */
  tutorialDone: boolean;
  /** Earned currency, spendable in the shop. */
  biscuits: number;
  /** Cosmetic item ids the player owns (the free 'classic' coat always is). */
  owned: string[];
  equipped: Equipped;
  /** True once AsyncStorage rehydration finished (gates lock rendering). */
  hydrated: boolean;

  /** Records a clear's stars and returns the biscuits earned by it. */
  recordClear: (levelId: string, stars: number) => number;
  /** Awards BISCUITS_TUTORIAL once, the first time the tutorial is finished. */
  awardTutorial: () => void;
  /** Buys and equips a shop item. False if already owned or too poor. */
  buyItem: (id: string) => boolean;
  /** Equips an owned item (or unequips accessory/theme with null). */
  equipItem: (slot: 'coat' | 'accessory' | 'theme', id: string | null) => void;
  setSoundEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setTutorialPrompted: (v: boolean) => void;
  setTutorialDone: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  resetProgress: () => void;
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      stars: {},
      soundEnabled: true,
      hapticsEnabled: true,
      tutorialPrompted: false,
      tutorialDone: false,
      biscuits: 0,
      owned: ['classic'],
      equipped: DEFAULT_EQUIPPED,
      hydrated: false,

      recordClear: (levelId, s) => {
        const st = get();
        const prevStars = st.stars[levelId] ?? 0;
        const earned =
          (prevStars === 0 ? BISCUITS_FIRST_CLEAR : 0) +
          Math.max(0, s - prevStars) * BISCUITS_PER_STAR;
        set({
          stars: { ...st.stars, [levelId]: Math.max(prevStars, s) },
          biscuits: st.biscuits + earned,
        });
        return earned;
      },

      awardTutorial: () => {
        const st = get();
        if (st.tutorialDone) return;
        set({ tutorialDone: true, biscuits: st.biscuits + BISCUITS_TUTORIAL });
      },

      buyItem: (id) => {
        const item = SHOP_ITEMS.find((i) => i.id === id);
        if (!item) return false;
        const st = get();
        if (st.owned.includes(id) || st.biscuits < item.price) return false;
        set({
          biscuits: st.biscuits - item.price,
          owned: [...st.owned, id],
          equipped: { ...st.equipped, [item.slot]: id },
        });
        return true;
      },

      equipItem: (slot, id) => {
        const st = get();
        if (id === null) {
          if (slot === 'coat') return; // a coat is always equipped
          set({ equipped: { ...st.equipped, [slot]: null } });
          return;
        }
        if (!st.owned.includes(id)) return;
        set({ equipped: { ...st.equipped, [slot]: id } });
      },

      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setTutorialPrompted: (v) => set({ tutorialPrompted: v }),
      setTutorialDone: (v) => set({ tutorialDone: v }),
      setHydrated: (v) => set({ hydrated: v }),
      resetProgress: () =>
        set({
          stars: {},
          tutorialPrompted: false,
          tutorialDone: false,
          biscuits: 0,
          owned: ['classic'],
          equipped: DEFAULT_EQUIPPED,
        }),
    }),
    {
      name: 'longdog-progress',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        stars: s.stars,
        soundEnabled: s.soundEnabled,
        hapticsEnabled: s.hapticsEnabled,
        tutorialPrompted: s.tutorialPrompted,
        tutorialDone: s.tutorialDone,
        biscuits: s.biscuits,
        owned: s.owned,
        equipped: s.equipped,
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
