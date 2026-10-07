import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breathPhase, cycleLabel, CYCLE_MS } from '../js/breath.js';

test('фазы дыхания 4-2-6', () => {
  assert.deepEqual(pick(breathPhase(0)), { phase: 'in', sec: 4, cycle: 1 });
  assert.deepEqual(pick(breathPhase(3999)), { phase: 'in', sec: 1, cycle: 1 });
  assert.deepEqual(pick(breathPhase(4000)), { phase: 'hold', sec: 2, cycle: 1 });
  assert.deepEqual(pick(breathPhase(5999)), { phase: 'hold', sec: 1, cycle: 1 });
  assert.deepEqual(pick(breathPhase(6000)), { phase: 'out', sec: 6, cycle: 1 });
  assert.deepEqual(pick(breathPhase(11999)), { phase: 'out', sec: 1, cycle: 1 });
  assert.deepEqual(pick(breathPhase(CYCLE_MS)), { phase: 'in', sec: 4, cycle: 2 });
});

test('круг растёт на вдохе и сжимается на выдохе', () => {
  assert.equal(breathPhase(0).scale, 0.6);
  assert.equal(breathPhase(4000).scale, 1);
  assert.ok(breathPhase(9000).scale < 1 && breathPhase(9000).scale > 0.6);
  assert.ok(Math.abs(breathPhase(11999).scale - 0.6) < 0.01);
  assert.equal(breathPhase(-50).phase, 'in');
});

test('подпись цикла', () => {
  assert.equal(cycleLabel(3), 'Цикл 3 из 5');
  assert.equal(cycleLabel(6), 'Цикл 6 · можно продолжать');
});

function pick({ phase, sec, cycle }) {
  return { phase, sec, cycle };
}
