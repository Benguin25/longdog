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

test('a gravity spike death retains the lethal landing position for animation', () => {
  const state = parseLevel({
    id: 'fall-onto-spikes',
    name: 'Fall onto spikes',
    grid: ['.....', '.....', '#.^..', '#####'],
    dogs: [[[1, 1], [0, 1]]],
  });

  const result = applyAction(state, 'right');

  assert.equal(result.status, 'dead');
  assert.equal(result.cause, 'spikes');
  assert.ok(result.state);
  assert.equal(result.state.dogs[0].cells[0].x, 2);
  assert.equal(result.state.dogs[0].cells[0].y, 2);
  assert.equal(result.fallRows?.[0], 1);
});
