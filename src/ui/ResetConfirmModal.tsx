import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function ResetConfirmModal({ visible, onCancel, onConfirm }: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>Restart this level?</Text>
          <Text style={styles.body}>Your moves will be lost.</Text>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={({ pressed }) => [styles.restart, pressed && styles.pressed]}>
              <Text style={styles.restartLabel}>Restart</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(59, 42, 26, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22 },
  title: { color: '#3B2A1A', fontSize: 21, fontWeight: '900', textAlign: 'center' },
  body: { color: '#4A362A', fontSize: 15, textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  cancel: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#EEE4D5', paddingVertical: 12 },
  restart: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#D9534F', paddingVertical: 12 },
  pressed: { opacity: 0.8 },
  cancelLabel: { color: '#3B2A1A', fontSize: 16, fontWeight: '800' },
  restartLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
