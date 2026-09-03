import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { LEVELS } from '../src/game/levels';
import { furthestUnlockedIndex, totalStars, useProgressStore } from '../src/store/progressStore';
import { HowToPlayModal } from '../src/ui/HowToPlayModal';

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
  const hydrated = useProgressStore((s) => s.hydrated);
  const tutorialPrompted = useProgressStore((s) => s.tutorialPrompted);
  const tutorialDone = useProgressStore((s) => s.tutorialDone);
  const setTutorialPrompted = useProgressStore((s) => s.setTutorialPrompted);
  const [helpVisible, setHelpVisible] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);

  const continueIndex = furthestUnlockedIndex(stars);
  const continueLevel = LEVELS[continueIndex];
  const earned = totalStars(stars);

  // First launch: offer the tutorial once rehydration has settled.
  useEffect(() => {
    if (hydrated && !tutorialPrompted) setPromptVisible(true);
  }, [hydrated, tutorialPrompted]);

  const dismissPrompt = () => {
    setTutorialPrompted(true);
    setPromptVisible(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable
        onPress={() => setHelpVisible(true)}
        hitSlop={8}
        style={({ pressed }) => [styles.helpButton, pressed && styles.helpButtonPressed]}
      >
        <Text style={styles.helpLabel}>?</Text>
      </Pressable>
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
        <MenuButton
          label="Tutorial"
          sub={tutorialDone ? 'Replay' : '5 quick lessons'}
          onPress={() => router.push('/tutorial/1')}
        />
        <MenuButton label="Settings" onPress={() => router.push('/settings')} />
      </View>
      <HowToPlayModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        onPlayTutorial={() => router.push('/tutorial/1')}
      />

      <Modal visible={promptVisible} transparent animationType="fade" onRequestClose={dismissPrompt}>
        <View style={styles.backdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>New here?</Text>
            <Text style={styles.promptText}>Learn the ropes in five quick lessons.</Text>
            <Pressable
              onPress={() => {
                dismissPrompt();
                router.push('/tutorial/1');
              }}
              style={({ pressed }) => [styles.promptButton, pressed && styles.promptButtonPressed]}
            >
              <Text style={styles.promptButtonLabel}>Play tutorial</Text>
            </Pressable>
            <Pressable onPress={dismissPrompt} style={styles.promptLater}>
              <Text style={styles.promptLaterLabel}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' },
  helpButton: {
    position: 'absolute',
    top: 54,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B2A1A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  helpButtonPressed: { backgroundColor: '#5C4326' },
  helpLabel: { color: '#F6E7B2', fontSize: 20, fontWeight: '900' },
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(59, 42, 26, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  promptCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  promptTitle: { fontSize: 21, fontWeight: '900', color: '#3B2A1A' },
  promptText: { fontSize: 14.5, color: '#4A362A', textAlign: 'center', marginTop: 8, marginBottom: 16 },
  promptButton: {
    alignSelf: 'stretch',
    backgroundColor: '#3B2A1A',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  promptButtonPressed: { backgroundColor: '#5C4326' },
  promptButtonLabel: { color: '#F6E7B2', fontSize: 16, fontWeight: '800' },
  promptLater: { marginTop: 10, paddingVertical: 6 },
  promptLaterLabel: { color: '#8A7358', fontSize: 14, fontWeight: '700' },
});
