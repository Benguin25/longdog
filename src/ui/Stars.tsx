import React from 'react';
import { StyleSheet, Text } from 'react-native';

export function Stars({ count, size = 16 }: { count: number; size?: number }) {
  return (
    <Text style={[styles.stars, { fontSize: size }]}>
      <Text style={styles.filled}>{'★'.repeat(count)}</Text>
      <Text style={styles.empty}>{'☆'.repeat(Math.max(0, 3 - count))}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  stars: { letterSpacing: 1 },
  filled: { color: '#E8A33D' },
  empty: { color: '#B8A88F' },
});
