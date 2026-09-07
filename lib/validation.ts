import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';
export const workspaceId = z.uuid();
export const name = z.string().trim().min(2).max(60);
const sendMessage = z.object({ action: z.literal('send'), workspaceId, numberId: z.uuid(), phone: z.string().min(7).max(24), countryCode: z.string().regex(/^[1-9][0-9]{0,3}$/).default('234'), text: z.string().trim().min(1).max(4000) }).refine(value => { try { normalizePhone(value.phone,value.countryCode); return true; } catch { return false; } }, { path:['phone'], message:'Invalid phone number' }).transform(value => ({ ...value, phone: normalizePhone(value.phone,value.countryCode) }));
export const numberAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), workspaceId, label: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal('connect'), workspaceId, numberId: z.uuid() }),
  sendMessage,
]);
export const teamAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invite'), workspaceId, email: z.email().max(254), role: z.enum(['admin', 'member']) }),
  z.object({ action: z.literal('accept'), token: z.uuid() }),
  z.object({ action: z.literal('remove'), workspaceId, userId: z.uuid() }),
]);
export const contactsQuery = z.object({ workspaceId, numberId: z.uuid() });
export const remoteJid = z.string().regex(/^([1-9][0-9]{7,24}@(s\.whatsapp\.net|lid)|[0-9-]{8,40}@g\.us)$/);
export const inboxQuery = z.object({ workspaceId, numberId: z.uuid(), remoteJid: remoteJid.optional() });
export const inboxReply = z.object({ workspaceId, numberId: z.uuid(), remoteJid, text: z.string().trim().min(1).max(4000) });
export const inboxTeamAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), workspaceId, numberId: z.uuid(), remoteJid, status: z.enum(['open','pending','resolved']), assignedTo: z.uuid().nullable() }),
  z.object({ action: z.literal('note'), workspaceId, numberId: z.uuid(), remoteJid, text: z.string().trim().min(1).max(2000) }),
]);
const broadcastRecipient = z.object({ phone: z.string().regex(/^\+?[1-9][0-9]{7,14}$/).transform(s => s.replace(/^\+/, '')), name: z.string().trim().max(120).optional() });
export const broadcastAction = z.object({
  workspaceId,
  numberId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  text: z.string().trim().min(1).max(4000),
  confirmed: z.literal(true),
  recipients: z.array(broadcastRecipient).min(1).max(25).transform(items => Array.from(new Map(items.map(item => [item.phone, item])).values())),
});
const campaignRecipient = z.object({
  phone: z.string().regex(/^\+?[1-9][0-9]{7,14}$/).transform(value => value.replace(/^\+/, '')),
  name: z.string().trim().max(120).default(''),
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export const createCampaign = z.object({
  action: z.literal('create'),
  workspaceId,
  numberId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  text: z.string().trim().min(1).max(4000),
  scheduledFor: z.iso.datetime().nullable().default(null),
  confirmed: z.literal(true),
  recipients: z.array(campaignRecipient).min(1).max(5000).transform(items => Array.from(new Map(items.map(item => [item.phone, item])).values())),
});
export const campaignAction = z.discriminatedUnion('action', [
  createCampaign,
  z.object({ action: z.enum(['pause','resume','cancel']), workspaceId, campaignId: z.uuid() }),
]);
const audienceContact = campaignRecipient.extend({
  optedInAt: z.iso.datetime().default(() => new Date().toISOString()),
  optInSource: z.string().trim().min(2).max(120).default('import'),
});
export const audienceAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('createList'), workspaceId, name: z.string().trim().min(2).max(80), description: z.string().trim().max(240).default(''), contacts: z.array(audienceContact).min(1).max(5000) }),
  z.object({ action: z.literal('createTemplate'), workspaceId, name: z.string().trim().min(2).max(80), text: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal('suppress'), workspaceId, phone: z.string().regex(/^\+?[1-9][0-9]{7,14}$/).transform(value => value.replace(/^\+/, '')), reason: z.string().trim().min(2).max(120).default('opt_out'), suppressed: z.boolean().default(true) }),
]);
export function canManage(role: string | null | undefined) { return role === 'owner' || role === 'admin'; }
export function safeNext(value: string | null) { return value && /^\/invite\?token=[0-9a-f-]{36}$/i.test(value) ? value : '/'; }
