import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildManifest,
  buildPrivacyLogRow,
  canonicalize,
  PRIVACY_CATEGORIES,
  payloadHash,
  preflightKey,
  requiresPreflight,
  type PrivacyManifest,
} from './privacy';

// --- buildManifest ---------------------------------------------------------------------------

test('manifest reports included categories as sent and the rest as explicitly withheld', () => {
  const manifest = buildManifest(['job-description', 'skills']);
  assert.deepEqual(manifest.sent, ['job-description', 'skills']);
  // Every other canonical category must appear in withheld — the "what is NOT sent" list is total.
  assert.equal(manifest.sent.length + manifest.withheld.length, PRIVACY_CATEGORIES.length);
  assert.ok(manifest.withheld.includes('contact-info'));
  assert.ok(manifest.withheld.includes('salary'));
});

test('manifest output is canonical-ordered and de-duplicated regardless of input order', () => {
  const manifest = buildManifest(['skills', 'job-description', 'skills']);
  // Canonical order puts job-description before skills no matter how they were passed.
  assert.deepEqual(manifest.sent, ['job-description', 'skills']);
});

test('an unknown category is ignored, not sent', () => {
  // @ts-expect-error — deliberately passing a value outside the vocabulary.
  const manifest = buildManifest(['job-description', 'totally-made-up']);
  assert.deepEqual(manifest.sent, ['job-description']);
});

// --- requiresPreflight -----------------------------------------------------------------------

const noPii = buildManifest(['job-description', 'skills']);
const withResume = buildManifest(['job-description', 'resume']);

test('first call of a (target, action) type requires pre-flight', () => {
  assert.equal(
    requiresPreflight({ target: 'openrouter', action: 'ping', manifest: noPii, approvedKeys: [] }),
    true,
  );
});

test('a repeat of an already-approved non-PII pair does NOT require pre-flight', () => {
  assert.equal(
    requiresPreflight({
      target: 'openrouter',
      action: 'ping',
      manifest: noPii,
      approvedKeys: [preflightKey('openrouter', 'ping')],
    }),
    false,
  );
});

test('a résumé-bearing call always requires pre-flight, even when previously approved', () => {
  assert.equal(
    requiresPreflight({
      target: 'openrouter',
      action: 'tailor-resume',
      manifest: withResume,
      approvedKeys: [preflightKey('openrouter', 'tailor-resume')],
    }),
    true,
  );
});

test('a contact-info call always requires pre-flight', () => {
  assert.equal(
    requiresPreflight({
      target: 'openrouter',
      action: 'cover-letter',
      manifest: buildManifest(['contact-info']),
      approvedKeys: [preflightKey('openrouter', 'cover-letter')],
    }),
    true,
  );
});

// --- payloadHash / canonicalize --------------------------------------------------------------

test('hash is deterministic for the same payload', async () => {
  const payload = { model: 'x', messages: [{ role: 'user', content: 'hi' }] };
  assert.equal(await payloadHash(payload), await payloadHash(payload));
});

test('hash is independent of object key order but sensitive to content', async () => {
  const a = { model: 'x', stream: true };
  const b = { stream: true, model: 'x' };
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(await payloadHash(a), await payloadHash(b));
  // A different value must change the hash.
  assert.notEqual(await payloadHash(a), await payloadHash({ model: 'y', stream: true }));
});

test('hash is a 64-char lowercase hex SHA-256 with a known vector', async () => {
  // SHA-256 of the canonical JSON string of {} — canonicalize({}) === "{}".
  const hash = await payloadHash({});
  assert.match(hash, /^[0-9a-f]{64}$/);
  // SHA-256("{}") is a fixed, well-known digest.
  assert.equal(hash, '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
});

test('array order is preserved (message order is meaningful)', () => {
  assert.notEqual(canonicalize([1, 2, 3]), canonicalize([3, 2, 1]));
});

// --- buildPrivacyLogRow ----------------------------------------------------------------------

test('audit row carries labelled manifests, hash, and cost — never the payload', () => {
  const manifest: PrivacyManifest = buildManifest(['job-description', 'resume']);
  const row = buildPrivacyLogRow({
    userId: 'user-1',
    applicationId: 'app-1',
    target: 'openrouter',
    action: 'tailor-resume',
    model: 'anthropic/claude-sonnet-4-6',
    manifest,
    payloadSha256: 'deadbeef',
    costUsd: 0.011,
  });
  assert.equal(row.user_id, 'user-1');
  assert.equal(row.application_id, 'app-1');
  assert.equal(row.target, 'openrouter');
  assert.equal(row.action, 'tailor-resume');
  assert.equal(row.model, 'anthropic/claude-sonnet-4-6');
  assert.deepEqual(row.sent_manifest, ['Job description', 'Résumé content']);
  assert.ok(row.withheld_manifest.includes('Contact details'));
  assert.equal(row.payload_sha256, 'deadbeef');
  assert.equal(row.cost_usd, 0.011);
  // The row must not smuggle the payload anywhere.
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'payload'), false);
});

test('audit row defaults optional application_id and cost to null', () => {
  const row = buildPrivacyLogRow({
    userId: 'user-1',
    target: 'openrouter',
    action: 'ping',
    model: null,
    manifest: buildManifest([]),
    payloadSha256: 'abc',
  });
  assert.equal(row.application_id, null);
  assert.equal(row.cost_usd, null);
  assert.deepEqual(row.sent_manifest, []);
});
