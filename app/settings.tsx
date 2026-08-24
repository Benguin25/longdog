import React from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useProgressStore } from '../src/store/progressStore';
import { HudButton } from '../src/ui/HudButton';

function SettingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#C9B285', true: '#5FBF4A' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export default function Settings() {
  const router = useRouter();
  const soundEnabled = useProgressStore((s) => s.soundEnabled);
  const hapticsEnabled = useProgressStore((s) => s.hapticsEnabled);
  const setSoundEnabled = useProgressStore((s) => s.setSoundEnabled);
  const setHapticsEnabled = useProgressStore((s) => s.setHapticsEnabled);
  const resetProgress = useProgressStore((s) => s.resetProgress);

  const confirmReset = () => {
    Alert.alert('Reset progress?', 'All stars and unlocked levels will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetProgress },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <HudButton label="‹ Back" onPress={() => router.back()} />
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.card}>
        <SettingRow label="Sound" value={soundEnabled} onChange={setSoundEnabled} />
        <View style={styles.divider} />
        <SettingRow label="Haptics" value={hapticsEnabled} onChange={setHapticsEnabled} />
      </View>
      <View style={styles.dangerZone}>
        <HudButton label="Reset Progress" onPress={confirmReset} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  title: { fontSize: 20, fontWeight: '900', color: '#3B2A1A' },
  headerSpacer: { width: 76 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 24,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 17, fontWeight: '700', color: '#3B2A1A' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#C9B285' },
  dangerZone: { marginTop: 32, alignItems: 'center' },
});
