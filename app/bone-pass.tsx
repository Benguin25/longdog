import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { BONE_PASS_STARS_PER_LEVEL, BONE_PASS_TIERS } from '../src/game/config';
import { bonePassLevelForStars, bonePassProgress, bonePassRewardStatus } from '../src/game/bonePass';
import { totalStars, useProgressStore } from '../src/store/progressStore';
import { HudButton } from '../src/ui/HudButton';

export default function BonePassScreen() {
  const router = useRouter();
  const stars = useProgressStore((s) => s.stars);
  const claimed = useProgressStore((s) => s.claimedBonePassRewards);
  const claimReward = useProgressStore((s) => s.claimBonePassReward);
  const earnedStars = totalStars(stars);
  const level = bonePassLevelForStars(earnedStars);
  const progress = bonePassProgress(earnedStars);
  const passComplete = level === BONE_PASS_TIERS.length;
  const progressPercent = passComplete ? 100 : Math.min(100, (progress / BONE_PASS_STARS_PER_LEVEL) * 100);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <HudButton label="‹ Back" onPress={() => router.back()} />
        <Text style={styles.title}>Bone Pass</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.hero}>
        <Text style={styles.season}>TAILS OF THE BACKYARD</Text>
        <Text style={styles.level}>Bone Pass Level {level}</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View>
        <Text style={styles.progressText}>{passComplete ? 'All Bone Pass tiers unlocked!' : `${progress} / ${BONE_PASS_STARS_PER_LEVEL} stars to the next level`}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.tiers}>
        {BONE_PASS_TIERS.map((tier) => {
          const status = bonePassRewardStatus(tier, level, claimed);
          return (
            <View key={tier.level} style={[styles.tier, status === 'locked' && styles.tierLocked, status === 'claimed' && styles.tierClaimed]}>
              <View style={styles.levelBadge}><Text style={styles.levelBadgeText}>{tier.level}</Text></View>
              <View style={styles.reward}>
                <Text style={styles.rewardName}>{tier.rewardName}</Text>
                <Text style={styles.rewardBlurb}>{tier.blurb}</Text>
              </View>
              {status === 'claimed' ? <Text style={styles.claimed}>Claimed ✓</Text> : status === 'locked' ? <Text style={styles.locked}>Locked</Text> : (
                <Pressable onPress={() => claimReward(tier.rewardId)} style={({ pressed }) => [styles.claimButton, pressed && styles.pressed]}>
                  <Text style={styles.claimButtonText}>Claim</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.purchaseArea}>
        <Pressable onPress={() => Alert.alert('Coming soon', 'Bone Pass purchases will be available in a future update. No payment has been started.')} style={({ pressed }) => [styles.purchaseButton, pressed && styles.pressed]}>
          <Text style={styles.purchaseLabel}>Purchase Bone Pass</Text>
          <Text style={styles.purchaseSub}>Real-money purchase · Coming soon</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#8ED1F4' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 6 }, title: { fontSize: 20, fontWeight: '900', color: '#3B2A1A' }, headerSpacer: { width: 76 },
  hero: { marginHorizontal: 16, marginTop: 14, backgroundColor: '#3B2A1A', borderRadius: 20, padding: 18 }, season: { color: '#F6E7B2', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, level: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 4 }, progressTrack: { height: 12, backgroundColor: '#6B4F3F', borderRadius: 8, overflow: 'hidden', marginTop: 14 }, progressFill: { height: '100%', backgroundColor: '#FFD542', borderRadius: 8 }, progressText: { color: '#EBD8AD', fontSize: 12, fontWeight: '700', marginTop: 7 },
  tiers: { padding: 16, gap: 10, paddingBottom: 112 }, tier: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, gap: 10 }, tierLocked: { opacity: 0.56 }, tierClaimed: { backgroundColor: '#E7F6E3' }, levelBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3C64B', alignItems: 'center', justifyContent: 'center' }, levelBadgeText: { color: '#3B2A1A', fontSize: 15, fontWeight: '900' }, reward: { flex: 1 }, rewardName: { color: '#3B2A1A', fontSize: 15, fontWeight: '900' }, rewardBlurb: { color: '#8A7358', fontSize: 11.5, marginTop: 2 }, claimed: { color: '#27813A', fontSize: 12, fontWeight: '900' }, locked: { color: '#6B5B4D', fontSize: 12, fontWeight: '900' }, claimButton: { backgroundColor: '#3B2A1A', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }, claimButtonText: { color: '#F6E7B2', fontSize: 12, fontWeight: '900' },
  purchaseArea: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(142, 209, 244, 0.96)' }, purchaseButton: { alignItems: 'center', backgroundColor: '#E8973D', borderRadius: 16, paddingVertical: 12 }, purchaseLabel: { color: '#3B2A1A', fontSize: 17, fontWeight: '900' }, purchaseSub: { color: '#4A362A', fontSize: 11, fontWeight: '700', marginTop: 2 }, pressed: { opacity: 0.72 },
});
