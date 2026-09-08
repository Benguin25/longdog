import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function DeathChoiceModal({ visible, onRestart, onLobby }: {
  visible: boolean;
  onRestart: () => void;
  onLobby: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>Oops!</Text>
          <Text style={styles.body}>Give that puzzle another try?</Text>
          <Pressable onPress={onRestart} style={({ pressed }) => [styles.restart, pressed && styles.pressed]}>
            <Text style={styles.restartLabel}>Restart</Text>
          </Pressable>
          <Pressable onPress={onLobby} style={({ pressed }) => [styles.lobby, pressed && styles.pressed]}>
            <Text style={styles.lobbyLabel}>Back to lobby</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(59, 42, 26, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22, alignItems: 'stretch' },
  title: { color: '#D9534F', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  body: { color: '#4A362A', fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  restart: { alignItems: 'center', borderRadius: 12, backgroundColor: '#D9534F', paddingVertical: 13 },
  lobby: { alignItems: 'center', borderRadius: 12, backgroundColor: '#EEE4D5', paddingVertical: 13, marginTop: 10 },
  pressed: { opacity: 0.8 },
  restartLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  lobbyLabel: { color: '#3B2A1A', fontSize: 16, fontWeight: '800' },
});
