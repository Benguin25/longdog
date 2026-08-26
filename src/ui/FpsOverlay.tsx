// Dev-only FPS meter. Frames are counted on the UI thread by a Reanimated
// frame callback; the JS thread is touched only twice a second to update
// the label, so the meter never perturbs a running tween. Gated behind
// __DEV__ + SHOW_FPS_OVERLAY at the call site.

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';

const WINDOW_MS = 500;

export function FpsOverlay() {
  const [fps, setFps] = useState(0);
  const frames = useSharedValue(0);
  const windowStart = useSharedValue(0);

  useFrameCallback((info) => {
    const now = info.timestamp;
    if (windowStart.value === 0) {
      windowStart.value = now;
      frames.value = 0;
      return;
    }
    frames.value += 1;
    const elapsed = now - windowStart.value;
    if (elapsed >= WINDOW_MS) {
      const value = Math.round((frames.value * 1000) / elapsed);
      frames.value = 0;
      windowStart.value = now;
      runOnJS(setFps)(value);
    }
  });

  return (
    <View style={styles.pill} pointerEvents="none">
      <Text style={[styles.text, fps > 0 && fps < 50 && styles.low]}>{fps} fps</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 4,
    right: 8,
    backgroundColor: 'rgba(43, 27, 16, 0.75)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: { color: '#8CFF9E', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  low: { color: '#FF8C7A' },
});
