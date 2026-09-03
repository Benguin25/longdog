import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Dir } from '../game/rules';

const ARROWS: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

function PadButton({
  dir, onPress, dim,
}: {
  dir: Dir; onPress: (dir: Dir) => void; dim: boolean;
}) {
  return (
    <Pressable
      onPress={() => onPress(dir)}
      style={({ pressed }) => [styles.button, dim && styles.buttonDim, pressed && styles.pressed]}
      hitSlop={6}
    >
      <Text style={styles.arrow}>{ARROWS[dir]}</Text>
    </Pressable>
  );
}

/** `enabled` (if given) dims directions not in the list — they still call
 *  onMove, so the caller decides whether to reject and give feedback. */
export function DPad({ onMove, enabled }: { onMove: (dir: Dir) => void; enabled?: readonly Dir[] }) {
  const dim = (dir: Dir) => enabled !== undefined && !enabled.includes(dir);
  return (
    <View style={styles.pad}>
      <View style={styles.row}>
        <PadButton dir="up" onPress={onMove} dim={dim('up')} />
      </View>
      <View style={styles.row}>
        <PadButton dir="left" onPress={onMove} dim={dim('left')} />
        <View style={styles.gap} />
        <PadButton dir="right" onPress={onMove} dim={dim('right')} />
      </View>
      <View style={styles.row}>
        <PadButton dir="down" onPress={onMove} dim={dim('down')} />
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
  buttonDim: { opacity: 0.35 },
  pressed: { backgroundColor: '#5C4326' },
  arrow: { color: '#F6E7B2', fontSize: 22, fontWeight: '700' },
});
