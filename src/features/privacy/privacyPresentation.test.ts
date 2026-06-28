import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrivacyLogEntry } from '../../shared/types';
import {
  computePrivacyMetrics,
  formatPrivacyAction,
  formatPrivacyCost,
  shortenPayloadHash,
} from './privacyPresentation';

const entries: PrivacyLogEntry[] = [
  {
    id: '1', user_id: 'u1', application_id: 'a1', target: 'openrouter',
    action: 'tailor-resume', model: 'anthropic/claude-sonnet-4-6',
    sent_manifest: ['Job description'], withheld_manifest: ['Contact details'],
    payload_sha256: 'a91f000000000000000000000000000000000000000000000000000000007c2e',
    cost_usd: 0.011, created_at: '2026-06-28T10:00:00Z',
  },
  {
    id: '2', user_id: 'u1', application_id: null, target: 'openrouter',
    action: 'prep-questions', model: null, sent_manifest: [], withheld_manifest: [],
    payload_sha256: '1234567890abcdef', cost_usd: null, created_at: '2026-06-28T11:00:00Z',
  },
  {
    id: '3', user_id: 'u1', application_id: 'a2', target: 'enhancecv',
    action: 'export-resume', model: null, sent_manifest: [], withheld_manifest: [],
    payload_sha256: 'feedfacecafebeef', cost_usd: 0.004, created_at: '2026-06-28T12:00:00Z',
  },
];

test('privacy metrics sum known spend and count distinct targets', () => {
  assert.deepEqual(computePrivacyMetrics(entries), {
    totalSpendUsd: 0.015,
    outboundCalls: 3,
    egressTargets: 2,
  });
  assert.deepEqual(computePrivacyMetrics([]), {
    totalSpendUsd: 0,
    outboundCalls: 0,
    egressTargets: 0,
  });
});

test('privacy row presentation is honest and compact', () => {
  assert.equal(formatPrivacyAction('tailor-resume'), 'Tailor resume');
  assert.equal(formatPrivacyAction('prep-questions'), 'Prep questions');
  assert.equal(formatPrivacyCost(0.011), '$0.011');
  assert.equal(formatPrivacyCost(null), 'Pending');
  assert.equal(shortenPayloadHash(entries[0].payload_sha256), 'a91f…7c2e');
  assert.equal(shortenPayloadHash('short'), 'short');
});
