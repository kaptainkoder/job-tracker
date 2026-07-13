import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIVE_STAGES,
  isStale,
  STAGE_DOT,
  STAGE_LABEL,
  STAGE_PILL,
  STAGES,
  STALE_AFTER_DAYS,
} from './stages';

const EXPECTED_DISPLAY = {
  lead: {
    label: 'Lead',
    pill: 'bg-stage-lead/15 text-stage-lead',
    dot: 'bg-stage-lead',
  },
  applied: {
    label: 'Applied',
    pill: 'bg-stage-applied/15 text-stage-applied',
    dot: 'bg-stage-applied',
  },
  interviewing: {
    label: 'Interviewing',
    pill: 'bg-stage-interviewing/15 text-stage-interviewing',
    dot: 'bg-stage-interviewing',
  },
  offer: {
    label: 'Offer',
    pill: 'bg-stage-offer/15 text-stage-offer',
    dot: 'bg-stage-offer',
  },
  rejected: {
    label: 'Rejected',
    pill: 'bg-stage-rejected/15 text-stage-rejected',
    dot: 'bg-stage-rejected',
  },
} as const;

const NOW = new Date('2026-07-14T12:00:00.000Z');
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

test('pipeline and active stages preserve their exact order', () => {
  assert.deepEqual(STAGES, ['lead', 'applied', 'interviewing', 'offer', 'rejected']);
  assert.deepEqual(ACTIVE_STAGES, ['lead', 'applied', 'interviewing']);
});

test('every stage display map has exactly the pipeline stage keys', () => {
  for (const map of [STAGE_LABEL, STAGE_PILL, STAGE_DOT]) {
    assert.deepEqual(Object.keys(map), STAGES);
  }
});

test('every stage preserves its exact label, pill, and dot values', () => {
  for (const stage of STAGES) {
    assert.equal(STAGE_LABEL[stage], EXPECTED_DISPLAY[stage].label);
    assert.equal(STAGE_PILL[stage], EXPECTED_DISPLAY[stage].pill);
    assert.equal(STAGE_DOT[stage], EXPECTED_DISPLAY[stage].dot);
  }
});

test('stale applications use a ten-day window', () => {
  assert.equal(STALE_AFTER_DAYS, 10);
});

test('each active stage becomes stale at the exact ten-day boundary', () => {
  const justBeforeBoundary = new Date(NOW.getTime() - TEN_DAYS_MS + 1).toISOString();
  const exactBoundary = new Date(NOW.getTime() - TEN_DAYS_MS).toISOString();

  for (const stage of ACTIVE_STAGES) {
    assert.equal(isStale(stage, justBeforeBoundary, NOW), false);
    assert.equal(isStale(stage, exactBoundary, NOW), true);
  }
});

test('terminal stages never become stale', () => {
  const olderThanBoundary = new Date(NOW.getTime() - TEN_DAYS_MS - 1).toISOString();

  assert.equal(isStale('offer', olderThanBoundary, NOW), false);
  assert.equal(isStale('rejected', olderThanBoundary, NOW), false);
});

test('future activity does not make an active stage stale', () => {
  const futureActivity = new Date(NOW.getTime() + 1).toISOString();

  assert.equal(isStale('lead', futureActivity, NOW), false);
});
