import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export function HudButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
      hitSlop={6}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#3B2A1A',
  },
  pressed: { backgroundColor: '#5C4326' },
  disabled: { opacity: 0.4 },
  label: { color: '#F6E7B2', fontSize: 15, fontWeight: '700' },
});
