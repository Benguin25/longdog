import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LEVELS, levelById } from '../../src/game/levels';
import { starsForClear } from '../../src/game/scoring';
import { useProgressStore } from '../../src/store/progressStore';
import { HudButton } from '../../src/ui/HudButton';
import { Stars } from '../../src/ui/Stars';

export default function LevelClear() {
  const router = useRouter();
  const { id, moves, earned } = useLocalSearchParams<{ id: string; moves?: string; earned?: string }>();
  const best = useProgressStore((s) => (id ? s.stars[id] ?? 0 : 0));
  const earnedBiscuits = Number(earned ?? 0);

  const biscuitScale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (earnedBiscuits <= 0) return;
    Animated.spring(biscuitScale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [earnedBiscuits, biscuitScale]);

  const level = id ? levelById(id) : undefined;
  if (!level) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>Level not found</Text>
        <HudButton label="Home" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const moveCount = Number(moves ?? 0);
  const stars = starsForClear(moveCount, level.par);
  const index = LEVELS.findIndex((l) => l.id === level.id);
  const next = index >= 0 ? LEVELS[index + 1] : undefined;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Level Clear!</Text>
        <Text style={styles.levelName}>
          {index + 1}. {level.name}
        </Text>
        <View style={styles.starRow}>
          <Stars count={stars} size={44} />
        </View>
        {earnedBiscuits > 0 && (
          <Animated.Text style={[styles.biscuits, { transform: [{ scale: biscuitScale }] }]}>
            +{earnedBiscuits} 🍪 biscuits
          </Animated.Text>
        )}
        <Text style={styles.moves}>
          {moveCount} moves{level.par !== undefined ? ` · par ${level.par}` : ''}
        </Text>
        {best > stars && <Text style={styles.best}>Best: {'★'.repeat(best)}</Text>}
        {stars < 3 && level.par !== undefined && (
          <Text style={styles.tip}>Clear in {level.par} moves for ★★★</Text>
        )}
        <View style={styles.buttons}>
          <HudButton label="Replay" onPress={() => router.replace(`/game/${level.id}`)} />
          <HudButton label="Levels" onPress={() => router.replace('/levels')} />
          {next && (
            <HudButton label="Next ›" onPress={() => router.replace(`/game/${next.id}`)} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#8ED1F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    minWidth: 280,
  },
  title: { fontSize: 28, fontWeight: '900', color: '#3B2A1A' },
  levelName: { fontSize: 15, color: '#8A7358', marginTop: 4 },
  starRow: { marginVertical: 10 },
  biscuits: { fontSize: 15, fontWeight: '800', color: '#B07C1F', marginBottom: 4 },
  moves: { fontSize: 15, color: '#4A362A' },
  best: { fontSize: 13, color: '#B07C1F', marginTop: 4 },
  tip: { fontSize: 13, color: '#8A7358', marginTop: 6 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
