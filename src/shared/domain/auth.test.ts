import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeNextPath } from './auth';

test('safeNextPath preserves internal application routes', () => {
  assert.equal(safeNextPath('/profile'), '/profile');
  assert.equal(safeNextPath('/tracker?stage=lead'), '/tracker?stage=lead');
});

test('safeNextPath blocks external and protocol-relative redirects', () => {
  assert.equal(safeNextPath('https://attacker.example'), '/tracker');
  assert.equal(safeNextPath('//attacker.example'), '/tracker');
  assert.equal(safeNextPath(null), '/tracker');
});

test('safeNextPath prevents redirect loops through auth routes', () => {
  assert.equal(safeNextPath('/sign-in'), '/tracker');
  assert.equal(safeNextPath('/auth/callback?next=/sign-in'), '/tracker');
});
