import assert from 'node:assert/strict';
import test from 'node:test';

import { BONE_PASS_STARS_PER_LEVEL, BONE_PASS_TIERS } from './config';
import { bonePassLevelForStars, bonePassProgress, bonePassRewardStatus } from './bonePass';

test('Bone Pass converts earned stars to capped levels and progress', () => {
  assert.equal(bonePassLevelForStars(0), 1);
  assert.equal(bonePassLevelForStars(BONE_PASS_STARS_PER_LEVEL), 2);
  assert.equal(bonePassLevelForStars(9999), BONE_PASS_TIERS.length);
  assert.equal(bonePassProgress(BONE_PASS_STARS_PER_LEVEL + 3), 3);
});

test('Bone Pass reward states are locked, unlocked, or claimed', () => {
  const tier = BONE_PASS_TIERS[1];
  assert.equal(bonePassRewardStatus(tier, 1, []), 'locked');
  assert.equal(bonePassRewardStatus(tier, 2, []), 'unlocked');
  assert.equal(bonePassRewardStatus(tier, 2, [tier.rewardId]), 'claimed');
});
