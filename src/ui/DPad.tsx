import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Dir } from '../game/rules';

const ARROWS: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

function PadButton({ dir, onPress }: { dir: Dir; onPress: (dir: Dir) => void }) {
  return (
    <Pressable
      onPress={() => onPress(dir)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      hitSlop={6}
    >
      <Text style={styles.arrow}>{ARROWS[dir]}</Text>
    </Pressable>
  );
}

export function DPad({ onMove }: { onMove: (dir: Dir) => void }) {
  return (
    <View style={styles.pad}>
      <View style={styles.row}>
        <PadButton dir="up" onPress={onMove} />
      </View>
      <View style={styles.row}>
        <PadButton dir="left" onPress={onMove} />
        <View style={styles.gap} />
        <PadButton dir="right" onPress={onMove} />
      </View>
      <View style={styles.row}>
        <PadButton dir="down" onPress={onMove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  gap: { width: 54 },
  button: {
    width: 54,
    height: 54,
    margin: 3,
    borderRadius: 14,
    backgroundColor: '#3B2A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: '#5C4326' },
  arrow: { color: '#F6E7B2', fontSize: 22, fontWeight: '700' },
});
