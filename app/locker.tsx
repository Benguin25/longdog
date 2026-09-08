import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { SHOP_ITEMS } from '../src/game/config';
import type { LevelData } from '../src/game/rules';
import { useProgressStore } from '../src/store/progressStore';
import { HudButton } from '../src/ui/HudButton';
import { MiniBoard } from '../src/ui/MiniBoard';

type Slot = 'coat' | 'accessory' | 'theme';

const PREVIEW_LEVEL: LevelData = {
  id: 'locker-preview', name: 'Locker Preview', grid: ['......', '......', '#####E'], dogs: [[[3, 1], [2, 1], [1, 1]]],
};
const TABS: { slot: Slot; label: string }[] = [
  { slot: 'coat', label: 'Coats' }, { slot: 'accessory', label: 'Accessories' }, { slot: 'theme', label: 'Themes' },
];

export default function LockerScreen() {
  const router = useRouter();
  const owned = useProgressStore((s) => s.owned);
  const equipped = useProgressStore((s) => s.equipped);
  const equipItem = useProgressStore((s) => s.equipItem);
  const [tab, setTab] = useState<Slot>('coat');
  const items = SHOP_ITEMS.filter((item) => item.slot === tab && owned.includes(item.id));

  const equip = (id: string | null) => equipItem(tab, id);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <HudButton label="‹ Back" onPress={() => router.back()} />
        <Text style={styles.title}>Locker</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.previewCard}>
        <MiniBoard level={PREVIEW_LEVEL} width={260} height={130} />
        <Text style={styles.previewLabel}>Your equipped Long Dog</Text>
      </View>
      <View style={styles.tabs}>
        {TABS.map((item) => (
          <Pressable key={item.slot} onPress={() => setTab(item.slot)} style={[styles.tab, tab === item.slot && styles.tabActive]}>
            <Text style={[styles.tabLabel, tab === item.slot && styles.tabLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.grid}>
        {tab === 'coat' && (
          <LockerCard name="Classic" blurb="The original long look." equipped={equipped.coat === 'classic'} onPress={() => equip('classic')} />
        )}
        {tab !== 'coat' && (
          <LockerCard name="None" blurb="No cosmetic equipped." equipped={equipped[tab] === null} onPress={() => equip(null)} />
        )}
        {items.map((item) => (
          <LockerCard
            key={item.id}
            name={item.name}
            blurb={item.blurb}
            equipped={equipped[tab] === item.id}
            onPress={() => equip(item.id)}
          />
        ))}
        {items.length === 0 && tab === 'coat' && <Text style={styles.empty}>Earn or buy cosmetics to fill your Locker.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function LockerCard({ name, blurb, equipped, onPress }: { name: string; blurb: string; equipped: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, equipped && styles.cardEquipped, pressed && styles.cardPressed]}>
      <Text style={styles.cardName}>{name}</Text>
      <Text style={styles.cardBlurb}>{blurb}</Text>
      <Text style={[styles.state, equipped && styles.stateEquipped]}>{equipped ? 'Equipped ✓' : 'Tap to equip'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 6 },
  title: { fontSize: 20, fontWeight: '900', color: '#3B2A1A' }, headerSpacer: { width: 76 },
  previewCard: { alignItems: 'center', marginHorizontal: 20, marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 8 },
  previewLabel: { color: '#4A362A', fontSize: 13, fontWeight: '700', marginTop: 3, marginBottom: 3 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 10 }, tabActive: { backgroundColor: '#3B2A1A' },
  tabLabel: { color: '#4A362A', fontSize: 12, fontWeight: '800' }, tabLabelActive: { color: '#F6E7B2' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  card: { width: '47%', minHeight: 112, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, justifyContent: 'space-between' },
  cardEquipped: { borderWidth: 3, borderColor: '#5FBF4A' }, cardPressed: { opacity: 0.72 },
  cardName: { color: '#3B2A1A', fontSize: 15, fontWeight: '900' }, cardBlurb: { color: '#8A7358', fontSize: 12, marginTop: 5 },
  state: { color: '#8A7358', fontSize: 12, fontWeight: '800', marginTop: 10 }, stateEquipped: { color: '#27813A' },
  empty: { color: '#4A362A', fontSize: 14, paddingTop: 8 },
});
