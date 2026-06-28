import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOpenRouterBody,
  isDone,
  parseOpenRouterDelta,
  parseOpenRouterUsage,
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

test('buildOpenRouterBody requests a usage frame only when asked', () => {
  const without = buildOpenRouterBody({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal('usage' in without, false);
  const withUsage = buildOpenRouterBody({
    model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
    usage: true,
  });
  assert.deepEqual(withUsage.usage, { include: true });
});

test('parseOpenRouterUsage returns the real cost only from a usage frame', () => {
  assert.equal(parseOpenRouterUsage(JSON.stringify({ usage: { cost: 0.0123 } })), 0.0123);
  assert.equal(parseOpenRouterUsage(JSON.stringify({ choices: [{ delta: { content: 'x' } }] })), null);
  assert.equal(parseOpenRouterUsage('[DONE]'), null);
  assert.equal(parseOpenRouterUsage('not json'), null);
  assert.equal(parseOpenRouterUsage(JSON.stringify({ usage: { cost: 'free' } })), null);
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
