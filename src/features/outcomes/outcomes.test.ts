import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Outcome } from '../../shared/types';
import {
  emptyOutcomeForm,
  latestOutcome,
  outcomeFormToPayload,
  sortOutcomesDesc,
  suggestedStageForOutcome,
  todayISODate,
  validateOutcomeForm,
} from './outcomes';

const NOW = new Date('2026-06-28T10:00:00Z');

test('empty form defaults to a callback dated today', () => {
  const form = emptyOutcomeForm(NOW);
  assert.equal(form.kind, 'callback');
  assert.equal(form.occurred_on, todayISODate(NOW));
  assert.equal(form.notes, '');
});

test('validation rejects blank, malformed, and future dates', () => {
  assert.ok(validateOutcomeForm({ kind: 'offer', occurred_on: '', notes: '' }, NOW).occurred_on);
  assert.ok(validateOutcomeForm({ kind: 'offer', occurred_on: 'nope', notes: '' }, NOW).occurred_on);
  assert.ok(validateOutcomeForm({ kind: 'offer', occurred_on: '2026-12-31', notes: '' }, NOW).occurred_on);
  assert.deepEqual(validateOutcomeForm({ kind: 'offer', occurred_on: '2026-06-28', notes: '' }, NOW), {});
  assert.deepEqual(validateOutcomeForm({ kind: 'offer', occurred_on: '2026-06-01', notes: '' }, NOW), {});
});

test('form maps to an owner-scoped payload with ISO timestamp and null artifact', () => {
  const payload = outcomeFormToPayload(
    { kind: 'rejected', occurred_on: '2026-06-20', notes: '  no fit  ' },
    'app-1',
    'user-1',
  );
  assert.equal(payload.application_id, 'app-1');
  assert.equal(payload.user_id, 'user-1');
  assert.equal(payload.kind, 'rejected');
  assert.equal(payload.notes, 'no fit');
  assert.equal(payload.artifact_id, null);
  assert.ok(payload.occurred_at.startsWith('2026-06-20T'));
});

test('blank notes persist as null', () => {
  assert.equal(outcomeFormToPayload({ kind: 'offer', occurred_on: '2026-06-20', notes: '   ' }, 'a', 'u').notes, null);
});

test('latest + sort order outcomes by occurred_at descending', () => {
  const mk = (id: string, at: string): Outcome => ({ id, occurred_at: at } as Outcome);
  const list = [mk('a', '2026-06-01T00:00:00Z'), mk('b', '2026-06-20T00:00:00Z'), mk('c', '2026-06-10T00:00:00Z')];
  assert.equal(latestOutcome(list)?.id, 'b');
  assert.deepEqual(sortOutcomesDesc(list).map((o) => o.id), ['b', 'c', 'a']);
  assert.equal(latestOutcome([]), null);
});

test('only offer/rejected imply a stage move', () => {
  assert.equal(suggestedStageForOutcome('offer'), 'offer');
  assert.equal(suggestedStageForOutcome('rejected'), 'rejected');
  assert.equal(suggestedStageForOutcome('callback'), null);
  assert.equal(suggestedStageForOutcome('ghosted'), null);
  assert.equal(suggestedStageForOutcome('withdrew'), null);
});
