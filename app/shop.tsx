import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { COATS, HAPTICS_ENABLED, SHOP_ITEMS, THEMES, type AccessoryId, type ShopItem } from '../src/game/config';
import type { LevelData } from '../src/game/rules';
import { useProgressStore } from '../src/store/progressStore';
import { HudButton } from '../src/ui/HudButton';
import { MiniBoard } from '../src/ui/MiniBoard';

type Slot = 'coat' | 'accessory' | 'theme';

const COAT_ACCESSORY_LEVEL: LevelData = {
  id: 'shop-coat',
  name: 'Coat Preview',
  grid: ['......', '......', '#####E'],
  dogs: [[[3, 1], [2, 1], [1, 1]]],
};
const THEME_LEVEL: LevelData = {
  id: 'shop-theme',
  name: 'Theme Preview',
  grid: ['......', '...o..', '##..E.', '######'],
  dogs: [[[1, 1], [0, 1]]],
};

const TABS: { slot: Slot; label: string }[] = [
  { slot: 'coat', label: 'Coats' },
  { slot: 'accessory', label: 'Accessories' },
  { slot: 'theme', label: 'Themes' },
];

function ShopCard({
  item,
  slot,
  owned,
  equipped,
  biscuits,
  onBuy,
  onEquip,
}: {
  item: ShopItem | { id: null; name: string; blurb: string; price?: undefined };
  slot: Slot;
  owned: boolean;
  equipped: boolean;
  biscuits: number;
  onBuy: (id: string) => void;
  onEquip: (id: string | null) => void;
}) {
  const price = 'price' in item ? item.price : undefined;
  const previewLevel = slot === 'theme' ? THEME_LEVEL : COAT_ACCESSORY_LEVEL;

  let button: React.ReactNode;
  if (equipped) {
    button = <HudButton label="Equipped ✓" onPress={() => {}} disabled />;
  } else if (owned || item.id === null) {
    button = <HudButton label="Equip" onPress={() => onEquip(item.id)} />;
  } else if (price !== undefined && biscuits >= price) {
    button = <HudButton label={`Buy · 🍪 ${price}`} onPress={() => onBuy(item.id as string)} />;
  } else {
    button = <HudButton label={`Need ${(price ?? 0) - biscuits} more`} onPress={() => {}} disabled />;
  }

  return (
    <View style={styles.card}>
      <View style={styles.preview}>
        <MiniBoard
          level={previewLevel}
          width={150}
          height={90}
          // Each card previews its own slot explicitly; the other two slots
          // fall back to the player's equipped cosmetics (MiniBoard's
          // default when a prop is omitted).
          coat={slot === 'coat' ? (item.id ? COATS[item.id] : COATS.classic) : undefined}
          accessory={slot === 'accessory' ? (item.id as AccessoryId | null) : undefined}
          palette={slot === 'theme' ? (item.id ? THEMES[item.id] : null) : undefined}
        />
      </View>
      <Text style={styles.cardName}>{item.name}</Text>
      <Text style={styles.cardBlurb}>{item.blurb}</Text>
      {button}
    </View>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const biscuits = useProgressStore((s) => s.biscuits);
  const owned = useProgressStore((s) => s.owned);
  const equipped = useProgressStore((s) => s.equipped);
  const hapticsEnabled = useProgressStore((s) => s.hapticsEnabled);
  const buyItem = useProgressStore((s) => s.buyItem);
  const equipItem = useProgressStore((s) => s.equipItem);

  const [tab, setTab] = useState<Slot>('coat');

  const buzzSuccess = () => {
    if (!HAPTICS_ENABLED || !hapticsEnabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleBuy = (id: string) => {
    if (buyItem(id)) buzzSuccess();
  };
  const handleEquip = (id: string | null) => {
    equipItem(tab, id);
  };

  const items = SHOP_ITEMS.filter((i) => i.slot === tab);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hud}>
        <HudButton label="‹ Back" onPress={() => router.back()} />
        <Text style={styles.header}>Shop</Text>
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>🍪 {biscuits}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.slot}
            onPress={() => setTab(t.slot)}
            style={[styles.tab, tab === t.slot && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, tab === t.slot && styles.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {tab !== 'coat' && (
          <ShopCard
            item={{ id: null, name: tab === 'accessory' ? 'None' : 'Pack default', blurb: 'The plain look.' }}
            slot={tab}
            owned
            equipped={tab === 'accessory' ? equipped.accessory === null : equipped.theme === null}
            biscuits={biscuits}
            onBuy={handleBuy}
            onEquip={handleEquip}
          />
        )}
        {items.map((item) => (
          <ShopCard
            key={item.id}
            item={item}
            slot={tab}
            owned={owned.includes(item.id)}
            equipped={equipped[tab] === item.id}
            biscuits={biscuits}
            onBuy={handleBuy}
            onEquip={handleEquip}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  header: { fontSize: 20, fontWeight: '900', color: '#3B2A1A' },
  balance: {
    backgroundColor: '#3B2A1A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  balanceLabel: { color: '#F6E7B2', fontWeight: '800', fontSize: 14 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#3B2A1A' },
  tabLabel: { fontSize: 13, fontWeight: '700', color: '#4A362A' },
  tabLabelActive: { color: '#F6E7B2' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  card: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    gap: 6,
  },
  preview: {
    width: 150,
    height: 90,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardName: { fontSize: 14, fontWeight: '800', color: '#3B2A1A', textAlign: 'center' },
  cardBlurb: { fontSize: 11.5, color: '#8A7358', textAlign: 'center', minHeight: 30 },
});
