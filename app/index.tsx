import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { LEVELS } from '../src/game/levels';
import { furthestUnlockedIndex, totalStars, useProgressStore } from '../src/store/progressStore';

function MenuButton({
  label,
  sub,
  onPress,
  primary,
}: {
  label: string;
  sub?: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuButton,
        primary && styles.menuButtonPrimary,
        pressed && styles.menuButtonPressed,
      ]}
    >
      <Text style={[styles.menuLabel, primary && styles.menuLabelPrimary]}>{label}</Text>
      {sub !== undefined && (
        <Text style={[styles.menuSub, primary && styles.menuSubPrimary]}>{sub}</Text>
      )}
    </Pressable>
  );
}

export default function Home() {
  const router = useRouter();
  const stars = useProgressStore((s) => s.stars);

  const continueIndex = furthestUnlockedIndex(stars);
  const continueLevel = LEVELS[continueIndex];
  const earned = totalStars(stars);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.title}>Long Dog</Text>
        <Text style={styles.subtitle}>a very long dachshund puzzle</Text>
        <Text style={styles.starTotal}>★ {earned} / {LEVELS.length * 3}</Text>
      </View>
      <View style={styles.menu}>
        <MenuButton
          label="Play"
          sub={continueLevel ? `Level ${continueIndex + 1} · ${continueLevel.name}` : undefined}
          onPress={() => continueLevel && router.push(`/game/${continueLevel.id}`)}
          primary
        />
        <MenuButton label="Level Select" onPress={() => router.push('/levels')} />
        <MenuButton label="Settings" onPress={() => router.push('/settings')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' },
  hero: { alignItems: 'center', marginTop: 48 },
  title: { fontSize: 44, fontWeight: '900', color: '#3B2A1A' },
  subtitle: { fontSize: 15, color: '#4A362A', marginTop: 4 },
  starTotal: { fontSize: 16, fontWeight: '800', color: '#B07C1F', marginTop: 12 },
  menu: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  menuButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  menuButtonPrimary: { backgroundColor: '#3B2A1A', paddingVertical: 20 },
  menuButtonPressed: { opacity: 0.7 },
  menuLabel: { fontSize: 19, fontWeight: '800', color: '#3B2A1A' },
  menuLabelPrimary: { color: '#F6E7B2', fontSize: 22 },
  menuSub: { fontSize: 13, color: '#8A7358', marginTop: 2 },
  menuSubPrimary: { color: '#C9B285' },
});
