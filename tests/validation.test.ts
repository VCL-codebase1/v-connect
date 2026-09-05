import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberAction, teamAction, safeNext } from '../lib/validation';
const workspaceId = '62c3ba2d-b351-4172-a8b9-fc8abf5f854e';
const numberId = '8174b955-765c-44d5-8830-05339cc3810d';
test('message destinations require international phone numbers, not arbitrary JIDs', () => {
  const base = { action: 'send', workspaceId, numberId, text: 'Hello' };
  for (const phone of ['123', '0' + '1'.repeat(9), '123456789@g.us', '+234 8012345678', 'https://evil.example', '1'.repeat(16)]) assert.equal(numberAction.safeParse({ ...base, phone }).success, false);
  assert.equal((numberAction.parse({ ...base, phone: '+2348012345678' }) as { phone: string }).phone, '2348012345678');
});
test('reject missing tenant IDs and oversized or empty messages', () => {
  const base = { action: 'send', workspaceId, numberId, phone: '+2348012345678', text: 'Hello' };
  assert.equal(numberAction.safeParse({ ...base, workspaceId: '' }).success, false);
  assert.equal(numberAction.safeParse({ ...base, text: ' ' }).success, false);
  assert.equal(numberAction.safeParse({ ...base, text: 'a'.repeat(4001) }).success, false);
});
test('invitations cannot grant ownership', () => {
  assert.equal(teamAction.safeParse({ action: 'invite', workspaceId, email: 'a@example.com', role: 'owner' }).success, false);
});
test('post-login redirect cannot leave the application', () => {
  for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/invite?token=x', '/invite?token='+workspaceId+'&next=https://evil.example']) assert.equal(safeNext(next), '/');
  assert.equal(safeNext('/invite?token='+workspaceId), '/invite?token='+workspaceId);
});
