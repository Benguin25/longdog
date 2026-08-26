import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { PACKS, PACK_SIZE } from '../src/game/config';
import { LEVELS } from '../src/game/levels';
import { isLevelUnlocked, useProgressStore } from '../src/store/progressStore';
import { HudButton } from '../src/ui/HudButton';
import { Stars } from '../src/ui/Stars';

const COLUMNS = 4;

export default function LevelSelect() {
  const router = useRouter();
  const stars = useProgressStore((s) => s.stars);
  const hydrated = useProgressStore((s) => s.hydrated);

  const packs = PACKS.map((pack, p) => ({
    ...pack,
    levels: LEVELS.slice(p * PACK_SIZE, (p + 1) * PACK_SIZE).map((level, i) => {
      const index = p * PACK_SIZE + i;
      return {
        level,
        index,
        stars: stars[level.id] ?? 0,
        unlocked: hydrated && isLevelUnlocked(stars, index),
      };
    }),
  })).filter((p) => p.levels.length > 0);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <HudButton label="‹ Back" onPress={() => router.back()} />
        <Text style={styles.title}>Level Select</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {packs.map((pack) => {
          const packStars = pack.levels.reduce((sum, l) => sum + l.stars, 0);
          return (
            <View key={pack.name} style={styles.pack}>
              <View style={[styles.packHeader, { backgroundColor: pack.color }]}>
                <Text style={styles.packName}>{pack.name}</Text>
                <Text style={styles.packStars}>★ {packStars} / {pack.levels.length * 3}</Text>
              </View>
              <View style={styles.grid}>
                {pack.levels.map(({ level, index, stars: s, unlocked }) => (
                  <Pressable
                    key={level.id}
                    disabled={!unlocked}
                    onPress={() => router.push(`/game/${level.id}`)}
                    style={({ pressed }) => [
                      styles.tile,
                      !unlocked && styles.tileLocked,
                      pressed && styles.tilePressed,
                    ]}
                  >
                    <Text style={[styles.tileNumber, !unlocked && styles.tileNumberLocked]}>
                      {unlocked ? index + 1 : '🔒'}
                    </Text>
                    {unlocked && <Stars count={s} size={11} />}
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  title: { fontSize: 20, fontWeight: '900', color: '#3B2A1A' },
  headerSpacer: { width: 76 },
  scroll: { padding: 16, paddingBottom: 40 },
  pack: { marginBottom: 20 },
  packHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  packName: { fontSize: 17, fontWeight: '900', color: '#FFFFFF' },
  packStars: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 8,
  },
  tile: {
    width: `${100 / COLUMNS}%`,
    aspectRatio: 1.35,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  tileLocked: { opacity: 0.45 },
  tilePressed: { opacity: 0.6 },
  tileNumber: { fontSize: 18, fontWeight: '800', color: '#3B2A1A' },
  tileNumberLocked: { fontSize: 14 },
});
