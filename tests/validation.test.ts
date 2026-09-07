import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audienceAction, broadcastAction, campaignAction, inboxQuery, inboxReply, numberAction, teamAction, safeNext } from '../lib/validation';
const workspaceId = '62c3ba2d-b351-4172-a8b9-fc8abf5f854e';
const numberId = '8174b955-765c-44d5-8830-05339cc3810d';
test('message destinations accept local formatting but reject arbitrary identifiers', () => {
  const base = { action: 'send', workspaceId, numberId, text: 'Hello' };
  for (const phone of ['123', '123456789@g.us', 'https://evil.example', '1'.repeat(16)]) assert.equal(numberAction.safeParse({ ...base, phone }).success, false);
  assert.equal((numberAction.parse({ ...base, phone: '0801 234 5678' }) as { phone: string }).phone, '2348012345678');
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
test('broadcasts require consent, valid phone numbers, and stay within the recipient cap', () => {
  const base = { workspaceId, numberId, name: 'Service notice', text: 'Hello', confirmed: true as const };
  assert.equal(broadcastAction.safeParse({ ...base, confirmed: false, recipients: [{ phone: '+2348012345678' }] }).success, false);
  assert.equal(broadcastAction.safeParse({ ...base, recipients: [{ phone: 'group@g.us' }] }).success, false);
  assert.equal(broadcastAction.safeParse({ ...base, recipients: Array.from({ length: 26 }, (_, i) => ({ phone: `23480123456${i}` })) }).success, false);
  const parsed = broadcastAction.parse({ ...base, recipients: [{ phone: '+2348012345678' }, { phone: '2348012345678' }] });
  assert.equal(parsed.recipients.length, 1);
  assert.equal(parsed.recipients[0].phone, '2348012345678');
});
test('inbox requests accept only WhatsApp user and group identifiers', () => {
  const base = { workspaceId, numberId };
  assert.equal(inboxQuery.safeParse({ ...base, remoteJid: '2348012345678@s.whatsapp.net' }).success, true);
  assert.equal(inboxQuery.safeParse({ ...base, remoteJid: '120363025555555555@g.us' }).success, true);
  assert.equal(inboxQuery.safeParse({ ...base, remoteJid: '225555555555555@lid' }).success, true);
  for (const remoteJid of ['../../instance/fetchInstances', 'person@example.com', 'status@broadcast', '123@evil.example']) assert.equal(inboxQuery.safeParse({ ...base, remoteJid }).success, false);
  assert.equal(inboxReply.safeParse({ ...base, remoteJid: '2348012345678@s.whatsapp.net', text: ' ' }).success, false);
});
test('campaigns deduplicate recipients and require explicit consent', () => {
  const base = { action:'create', workspaceId, numberId, name:'Customer update', text:'Hi {{name}}', scheduledFor:null, confirmed:true as const };
  const parsed = campaignAction.parse({ ...base, recipients:[{phone:'+2348012345678',name:'Ada'},{phone:'2348012345678',name:'Duplicate'}] });
  assert.equal(parsed.action,'create');
  assert.equal(parsed.recipients.length,1);
  assert.equal(campaignAction.safeParse({...base,confirmed:false,recipients:[{phone:'2348012345678'}]}).success,false);
  assert.equal(campaignAction.safeParse({...base,recipients:Array.from({length:5001},(_,i)=>({phone:`234${String(i).padStart(11,'0')}`}))}).success,false);
});
test('audience imports require consent source data and valid international numbers', () => {
  const base={action:'createList',workspaceId,name:'Customers',description:'',contacts:[{phone:'2348012345678',name:'Ada',optedInAt:new Date().toISOString(),optInSource:'checkout'}]};
  assert.equal(audienceAction.safeParse(base).success,true);
  assert.equal(audienceAction.safeParse({...base,contacts:[{...base.contacts[0],phone:'08012345678'}]}).success,false);
  assert.equal(audienceAction.safeParse({...base,contacts:[{...base.contacts[0],optInSource:''}]}).success,false);
});
