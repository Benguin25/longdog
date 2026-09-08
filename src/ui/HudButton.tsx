import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export function HudButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  compact?: boolean;
}) {
  const isBack = label.includes('Back') || label.includes('Exit');
  const iconOnly = compact || label === '?' || isBack;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (isBack ? 'Back' : label)}
      style={({ pressed }) => [styles.button, iconOnly && styles.compact, pressed && styles.pressed, disabled && styles.disabled]}
      hitSlop={6}
    >
      <Text style={styles.label}>{isBack ? '‹' : label}</Text>
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
  compact: { width: 42, paddingHorizontal: 0, alignItems: 'center' },
  pressed: { backgroundColor: '#5C4326' },
  disabled: { opacity: 0.4 },
  label: { color: '#F6E7B2', fontSize: 18, fontWeight: '800' },
});
