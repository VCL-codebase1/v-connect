import { z } from 'zod';
export const workspaceId = z.uuid();
export const name = z.string().trim().min(2).max(60);
export const numberAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), workspaceId, label: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal('connect'), workspaceId, numberId: z.uuid() }),
  z.object({ action: z.literal('send'), workspaceId, numberId: z.uuid(), phone: z.string().regex(/^\+?[1-9][0-9]{7,14}$/).transform(s => s.replace(/^\+/, '')), text: z.string().trim().min(1).max(4000) }),
]);
export const teamAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invite'), workspaceId, email: z.email().max(254), role: z.enum(['admin', 'member']) }),
  z.object({ action: z.literal('accept'), token: z.uuid() }),
  z.object({ action: z.literal('remove'), workspaceId, userId: z.uuid() }),
]);
export function canManage(role: string | null | undefined) { return role === 'owner' || role === 'admin'; }
export function safeNext(value: string | null) { return value && /^\/invite\?token=[0-9a-f-]{36}$/i.test(value) ? value : '/'; }
