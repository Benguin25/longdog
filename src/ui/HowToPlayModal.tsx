import React, { useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Page = {
  emoji: string;
  title: string;
  lines: string[];
};

const PAGES: Page[] = [
  {
    emoji: '🌭',
    title: 'The Goal',
    lines: [
      'Eat every snack on the level to open the glowing dog door.',
      'Then get your dog’s head into the open door to clear the level.',
    ],
  },
  {
    emoji: '👆',
    title: 'Controls',
    lines: [
      'Swipe on the board, or use the D-pad, to move one tile at a time.',
      'Undo takes back your last move — as many times as you like. Reset restarts the level.',
    ],
  },
  {
    emoji: '🪨',
    title: 'Gravity',
    lines: [
      'After every move, your dog falls unless some part of its body rests on ground, a statue, or another dog.',
      'Falling off the bottom of the level — or touching spikes — is fatal. Don’t worry: the move is undone automatically.',
    ],
  },
  {
    emoji: '🦴',
    title: 'A Very Long Dog',
    lines: [
      'Every snack you eat makes your dog one segment longer.',
      'Your body is a platform you can stand on — and an obstacle in your way. Length is both your tool and your problem.',
    ],
  },
  {
    emoji: '🗿',
    title: 'Playing Dead',
    lines: [
      'Step your head onto a “play dead” tile and your whole dog turns to stone, exactly in the shape it held.',
      'A fresh dog pops out of the dog house. Statues make great stairs and bridges — the shape you freeze in is the puzzle.',
    ],
  },
  {
    emoji: '🐕🐕',
    title: 'Two Dogs',
    lines: [
      'Some levels have two live dogs. Tap the board (or the Swap button) to switch control.',
      'Both dogs must reach the exit. They can stand on each other — and get in each other’s way.',
    ],
  },
];

export function HowToPlayModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [pageWidth, setPageWidth] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const lastPage = pageIndex === PAGES.length - 1;

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
    setPageIndex(index);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth === 0) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setPageIndex(Math.max(0, Math.min(PAGES.length - 1, index)));
  };

  const close = () => {
    setPageIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>How to Play</Text>
            <Pressable onPress={close} hitSlop={10} style={styles.closeButton}>
              <Text style={styles.closeLabel}>✕</Text>
            </Pressable>
          </View>

          <View
            style={styles.carousel}
            onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
          >
            {pageWidth > 0 && (
              <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onScrollEnd}
              >
                {PAGES.map((page) => (
                  <View key={page.title} style={[styles.page, { width: pageWidth }]}>
                    <Text style={styles.pageEmoji}>{page.emoji}</Text>
                    <Text style={styles.pageTitle}>{page.title}</Text>
                    {page.lines.map((line, i) => (
                      <Text key={i} style={styles.pageLine}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.dots}>
            {PAGES.map((page, i) => (
              <View key={page.title} style={[styles.dot, i === pageIndex && styles.dotActive]} />
            ))}
          </View>

          <Pressable
            onPress={() => (lastPage ? close() : goTo(pageIndex + 1))}
            style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
          >
            <Text style={styles.nextLabel}>{lastPage ? 'Got it!' : 'Next ›'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(59, 42, 26, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 22, fontWeight: '900', color: '#3B2A1A' },
  closeButton: { position: 'absolute', right: 0 },
  closeLabel: { fontSize: 18, fontWeight: '800', color: '#8A7358' },
  carousel: { marginTop: 10, height: 240 },
  page: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 8 },
  pageEmoji: { fontSize: 44 },
  pageTitle: { fontSize: 19, fontWeight: '800', color: '#3B2A1A', marginTop: 8 },
  pageLine: {
    fontSize: 14.5,
    lineHeight: 21,
    color: '#4A362A',
    textAlign: 'center',
    marginTop: 10,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D9CBB5',
  },
  dotActive: { backgroundColor: '#3B2A1A' },
  nextButton: {
    marginTop: 14,
    backgroundColor: '#3B2A1A',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  nextButtonPressed: { backgroundColor: '#5C4326' },
  nextLabel: { color: '#F6E7B2', fontSize: 17, fontWeight: '800' },
});
