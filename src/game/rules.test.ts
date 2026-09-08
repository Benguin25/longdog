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

test('a fresh dog from the house is released into the normal gravity pass', () => {
  const state = parseLevel({
    id: 'house-release',
    name: 'House Release',
    grid: ['....H', '.....', '..F..', '.....', '#####'],
    dogs: [[[1, 2], [0, 2]]],
    spawnDir: 'left',
  });

  const result = applyAction(state, 'right');

  assert.equal(result.status, 'moved');
  assert.ok(result.events.includes('spawned'));
  assert.ok(result.events.includes('fell'));
  const freshDog = result.state.dogs.at(-1);
  assert.ok(freshDog);
  assert.equal(result.fallRows?.[freshDog.id], 1);
  assert.deepEqual(freshDog.cells, [
    { x: 4, y: 1 },
    { x: 3, y: 1 },
    { x: 2, y: 1 },
  ]);
});

test('a falling head turns its dog to stone on a turn-to-stone tile', () => {
  const state = parseLevel({
    id: 'fall-onto-stone',
    name: 'Fall Onto Stone',
    grid: ['....H', '.....', '..F..', '.....', '#####'],
    dogs: [[[1, 0], [0, 0]]],
    spawnDir: 'left',
  });

  const result = applyAction(state, 'right');

  assert.equal(result.status, 'moved');
  assert.ok(result.events.includes('froze'));
  assert.ok(result.events.includes('spawned'));
  assert.ok(result.state.statues.has('2,2'));
  assert.ok(result.state.statues.has('1,2'));
  assert.equal(result.state.dogs.length, 1);
  assert.equal(result.state.dogs[0].id, 1);
});
