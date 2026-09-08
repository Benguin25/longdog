import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAction, parseLevel } from './rules';

test('a falling head entering an open exit completes the level', () => {
  const state = parseLevel({
    id: 'fall-into-exit',
    name: 'Fall into exit',
    grid: ['.....', '.....', '#.E..', '#####'],
    dogs: [[[1, 1], [0, 1]]],
  });

  const result = applyAction(state, 'right');

  assert.equal(result.status, 'won');
  assert.equal(result.state.dogs.length, 0);
  assert.ok(result.events.includes('fell'));
  assert.ok(result.events.includes('dogExited'));
});
