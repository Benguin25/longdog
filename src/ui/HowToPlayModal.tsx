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

import type { Action, LevelData } from '../game/rules';
import { DPad } from './DPad';
import { MiniBoard } from './MiniBoard';

// Illustration levels: minimal, hand-verified boards that show the real
// in-game art for each mechanic (parsed + settled, checked against
// rules.ts — see scripts used during development).
const GOAL_LEVEL: LevelData = {
  id: 'htp-goal',
  name: 'The Goal',
  grid: ['......', 'E.o...', '######'],
  dogs: [[[4, 1], [5, 1]]],
};
const GRAVITY_LEVEL: LevelData = {
  id: 'htp-gravity',
  name: 'Gravity',
  grid: ['......', '......', '##...E', '##^^##'],
  dogs: [[[1, 1], [0, 1]]],
};
const LONG_DOG_LEVEL: LevelData = {
  id: 'htp-long',
  name: 'A Very Long Dog',
  grid: ['......', '......', '#####E'],
  dogs: [[[3, 0], [3, 1], [2, 1], [1, 1], [0, 1]]],
};
const PLAYING_DEAD_LEVEL: LevelData = {
  id: 'htp-dead',
  name: 'Playing Dead',
  grid: ['..H....', '###..FE', '####^^#'],
  dogs: [[[4, 1], [3, 1]]],
  spawnDir: 'left',
};
const TWO_DOGS_LEVEL: LevelData = {
  id: 'htp-two',
  name: 'Two Dogs',
  grid: ['....o.', '......', 'E.....', '######'],
  dogs: [[[2, 2], [3, 2]], [[5, 1], [5, 2]]],
};

type Illustration =
  | { kind: 'board'; level: LevelData; moves?: readonly Action[] }
  | { kind: 'controls' };

type Page = {
  illustration: Illustration;
  title: string;
  lines: string[];
};

const PAGES: Page[] = [
  {
    illustration: { kind: 'board', level: GOAL_LEVEL },
    title: 'The Goal',
    lines: [
      'Eat every bone on the level. Once they’re all eaten, the dog door (the arched doorway) lights up and opens.',
      'Then get your dog’s head into the open door to clear the level.',
    ],
  },
  {
    illustration: { kind: 'controls' },
    title: 'Controls',
    lines: [
      'Swipe on the board, or use the D-pad, to move one tile at a time.',
      'Undo takes back your last move — as many times as you like. Reset restarts the level.',
    ],
  },
  {
    illustration: { kind: 'board', level: GRAVITY_LEVEL },
    title: 'Gravity',
    lines: [
      'After every move, your dog falls unless some part of its body rests on ground, a statue, or another dog.',
      'Falling off the bottom of the level — or touching the spiky garden rakes shown here — is fatal. Don’t worry: the move is undone automatically.',
    ],
  },
  {
    illustration: { kind: 'board', level: LONG_DOG_LEVEL },
    title: 'A Very Long Dog',
    lines: [
      'Every bone you eat makes your dog one segment longer.',
      'Your body is a platform you can stand on — and an obstacle in your way. Length is both your tool and your problem.',
    ],
  },
  {
    illustration: { kind: 'board', level: PLAYING_DEAD_LEVEL, moves: ['right'] },
    title: 'Playing Dead',
    lines: [
      'Step your head onto a “play dead” mat and your whole dog turns to stone, exactly in the shape it held.',
      'A fresh dog pops out of the dog house. Statues make great stairs and bridges — the shape you freeze in is the puzzle.',
    ],
  },
  {
    illustration: { kind: 'board', level: TWO_DOGS_LEVEL },
    title: 'Two Dogs',
    lines: [
      'Some levels have two live dogs. Tap the board (or the Swap button) to switch control.',
      'Both dogs must reach the exit. They can stand on each other — and get in each other’s way.',
    ],
  },
];

function PageIllustration({
  illustration,
  width,
  active,
}: {
  illustration: Illustration;
  width: number;
  active: boolean;
}) {
  if (illustration.kind === 'controls') {
    return (
      <View style={styles.controlsIllustration}>
        <View style={styles.dpadScale} pointerEvents="none">
          <DPad onMove={() => {}} />
        </View>
        <Text style={styles.swipeCaption}>swipe ⇠ ⇢</Text>
      </View>
    );
  }
  return (
    <MiniBoard
      level={illustration.level}
      moves={illustration.moves}
      width={width}
      height={120}
      active={active}
    />
  );
}

export function HowToPlayModal({
  visible,
  onClose,
  onPlayTutorial,
}: {
  visible: boolean;
  onClose: () => void;
  onPlayTutorial: () => void;
}) {
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

  const playTutorial = () => {
    close();
    onPlayTutorial();
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
                {PAGES.map((page, i) => (
                  <View key={i} style={[styles.page, { width: pageWidth }]}>
                    <PageIllustration
                      illustration={page.illustration}
                      width={pageWidth - 16}
                      active={Math.abs(i - pageIndex) <= 1}
                    />
                    <Text style={styles.pageTitle}>{page.title}</Text>
                    <ScrollView style={styles.pageTextScroll}>
                      {page.lines.map((line, li) => (
                        <Text key={li} style={styles.pageLine}>
                          {line}
                        </Text>
                      ))}
                    </ScrollView>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.dots}>
            {PAGES.map((page, i) => (
              <View key={i} style={[styles.dot, i === pageIndex && styles.dotActive]} />
            ))}
          </View>

          <Pressable onPress={playTutorial} style={styles.tutorialLink}>
            <Text style={styles.tutorialLinkLabel}>Play the tutorial ›</Text>
          </Pressable>

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
    maxHeight: '85%',
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
  carousel: { marginTop: 10, height: 300 },
  page: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, flex: 1 },
  controlsIllustration: { height: 120, alignItems: 'center', justifyContent: 'center' },
  dpadScale: { transform: [{ scale: 0.7 }] },
  swipeCaption: { fontSize: 13, fontWeight: '700', color: '#8A7358', marginTop: -6 },
  pageTitle: { fontSize: 19, fontWeight: '800', color: '#3B2A1A', marginTop: 8 },
  pageTextScroll: { marginTop: 6, alignSelf: 'stretch' },
  pageLine: {
    fontSize: 14.5,
    lineHeight: 21,
    color: '#4A362A',
    textAlign: 'center',
    marginTop: 6,
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
  tutorialLink: { alignItems: 'center', marginTop: 10, paddingVertical: 4 },
  tutorialLinkLabel: { color: '#8A7358', fontSize: 14, fontWeight: '800' },
  nextButton: {
    marginTop: 10,
    backgroundColor: '#3B2A1A',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  nextButtonPressed: { backgroundColor: '#5C4326' },
  nextLabel: { color: '#F6E7B2', fontSize: 17, fontWeight: '800' },
});
