import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { LEVELS } from '../src/game/levels';

export default function Home() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Long Dog</Text>
      <Text style={styles.subtitle}>a very long dachshund puzzle</Text>
      <FlatList
        data={[...LEVELS]}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => router.push(`/game/${item.id}`)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Text style={styles.cardNumber}>{index + 1}</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.par !== undefined && <Text style={styles.cardPar}>par {item.par}</Text>}
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: '#3B2A1A',
    textAlign: 'center',
    marginTop: 24,
  },
  subtitle: { fontSize: 15, color: '#4A362A', textAlign: 'center', marginBottom: 20 },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  cardPressed: { opacity: 0.7 },
  cardNumber: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#B5773A',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 40,
    overflow: 'hidden',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardName: { fontSize: 17, fontWeight: '700', color: '#3B2A1A' },
  cardPar: { fontSize: 13, color: '#8A7358', marginTop: 2 },
});
