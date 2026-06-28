import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOpenRouterBody,
  isDone,
  parseOpenRouterDelta,
  parseLlmFrame,
  sseTokenFrame,
  sseErrorFrame,
} from './llm';

test('buildOpenRouterBody always streams and defaults max_tokens', () => {
  const body = buildOpenRouterBody({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(body.stream, true);
  assert.equal(body.model, 'm');
  assert.equal(body.max_tokens, 256);
  assert.equal('provider' in body, false, 'no provider routing unless no-log requested');
});

test('buildOpenRouterBody denies data collection when no-log is on', () => {
  const body = buildOpenRouterBody({
    model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 16,
    noLog: true,
  });
  assert.equal(body.max_tokens, 16);
  assert.deepEqual(body.provider, { data_collection: 'deny' });
});

test('parseOpenRouterDelta extracts content and ignores non-content frames', () => {
  assert.equal(
    parseOpenRouterDelta(JSON.stringify({ choices: [{ delta: { content: 'po' } }] })),
    'po',
  );
  assert.equal(parseOpenRouterDelta('[DONE]'), null);
  assert.equal(parseOpenRouterDelta(''), null);
  assert.equal(parseOpenRouterDelta('not json'), null);
  assert.equal(
    parseOpenRouterDelta(JSON.stringify({ choices: [{ delta: {} }] })),
    null,
    'role-only opening delta yields no token',
  );
});

test('isDone recognises the terminal sentinel', () => {
  assert.equal(isDone('[DONE]'), true);
  assert.equal(isDone(' [DONE] '), true);
  assert.equal(isDone('{"token":"x"}'), false);
});

test('our SSE frames round-trip through parseLlmFrame', () => {
  assert.deepEqual(parseLlmFrame(sseTokenFrame('hello').replace(/^data: /, '').trim()), {
    token: 'hello',
  });
  assert.deepEqual(parseLlmFrame(sseErrorFrame('boom').replace(/^data: /, '').trim()), {
    error: 'boom',
  });
  assert.deepEqual(parseLlmFrame('[DONE]'), { done: true });
  assert.equal(parseLlmFrame(''), null);
  assert.equal(parseLlmFrame('{"unrelated":1}'), null);
});
