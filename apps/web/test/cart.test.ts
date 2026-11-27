// The cart reducer on its own, without a browser: node --test --experimental-strip-types.
import test from 'node:test';
import assert from 'node:assert/strict';
import reducer, { namedParticipants, setParticipants, setQuantity, assignLine } from '../src/store/cartSlice.ts';

const empty = () => reducer(undefined, { type: 'init' });

test('"Order together" opens with two empty name fields', () => {
  // The button dispatches two empty slots; they must survive, or the group
  // order section has nothing to show and the button appears to do nothing.
  const state = reducer(empty(), setParticipants(['', '']));
  assert.deepEqual(state.participants, ['', '']);
  assert.deepEqual(namedParticipants(state.participants), []);
});

test('a name being typed keeps its spaces; the names sent are trimmed', () => {
  const state = reducer(empty(), setParticipants(['Aru ', '  ']));
  assert.deepEqual(state.participants, ['Aru ', '  ']);
  assert.deepEqual(namedParticipants(state.participants), ['Aru']);
});

test('removing a person puts their dishes back to unassigned', () => {
  let state = reducer(empty(), setQuantity({ itemId: 1, quantity: 2 }));
  state = reducer(state, setParticipants(['Aru', 'Dana']));
  state = reducer(state, assignLine({ itemId: 1, from: '', to: 'Aru' }));
  assert.equal(state.lines['1|Aru']?.quantity, 2);

  state = reducer(state, setParticipants(['Dana']));
  assert.equal(state.lines['1|Aru'], undefined);
  assert.equal(state.lines['1|']?.quantity, 2);
});

test('no more than the maximum number of slots is kept', () => {
  const state = reducer(empty(), setParticipants(Array.from({ length: 15 }, (_, i) => `P${i}`)));
  assert.equal(state.participants.length, 10);
});
