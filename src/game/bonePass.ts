import { BONE_PASS_STARS_PER_LEVEL, BONE_PASS_TIERS, type BonePassTier } from './config';

export type BonePassRewardStatus = 'locked' | 'unlocked' | 'claimed';

export function bonePassLevelForStars(stars: number): number {
  return Math.min(BONE_PASS_TIERS.length, Math.floor(Math.max(0, stars) / BONE_PASS_STARS_PER_LEVEL) + 1);
}

export function bonePassProgress(stars: number): number {
  return Math.max(0, stars) % BONE_PASS_STARS_PER_LEVEL;
}

export function bonePassRewardStatus(
  tier: BonePassTier,
  currentLevel: number,
  claimedRewardIds: readonly string[],
): BonePassRewardStatus {
  if (claimedRewardIds.includes(tier.rewardId)) return 'claimed';
  return tier.level <= currentLevel ? 'unlocked' : 'locked';
}
