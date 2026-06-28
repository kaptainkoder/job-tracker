import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UserSettings } from '../../shared/types';
import {
  DEFAULT_MODEL,
  isKnownModel,
  modelLabel,
  settingsFormToPayload,
  settingsToForm,
} from './settings';

const row: UserSettings = {
  user_id: 'owner-id',
  model: 'anthropic/claude-opus-4-8',
  no_log: false,
  created_at: '2026-06-28T00:00:00Z',
  updated_at: '2026-06-28T00:00:00Z',
};

test('settingsToForm uses defaults when there is no stored row', () => {
  assert.deepEqual(settingsToForm(null), { model: DEFAULT_MODEL, no_log: true });
});

test('settingsToForm hydrates a stored row and preserves no_log=false', () => {
  assert.deepEqual(settingsToForm(row), { model: 'anthropic/claude-opus-4-8', no_log: false });
});

test('settingsToForm falls back to the default model when the stored slug is unknown', () => {
  assert.equal(settingsToForm({ ...row, model: 'ghost/model-9' }).model, DEFAULT_MODEL);
});

test('settingsFormToPayload normalises an unknown model to the default', () => {
  assert.deepEqual(settingsFormToPayload('u1', { model: 'ghost/model-9', no_log: true }), {
    user_id: 'u1',
    model: DEFAULT_MODEL,
    no_log: true,
  });
});

test('settingsFormToPayload keeps a known model and the no_log choice', () => {
  assert.deepEqual(settingsFormToPayload('u1', { model: 'openai/gpt-5.1', no_log: false }), {
    user_id: 'u1',
    model: 'openai/gpt-5.1',
    no_log: false,
  });
});

test('isKnownModel + modelLabel agree with the option list', () => {
  assert.equal(isKnownModel(DEFAULT_MODEL), true);
  assert.equal(isKnownModel('ghost/model-9'), false);
  assert.equal(modelLabel(DEFAULT_MODEL), 'Claude Sonnet 4.6');
  assert.equal(modelLabel('ghost/model-9'), 'ghost/model-9', 'unknown slug shows raw');
});
