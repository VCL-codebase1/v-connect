import { authorize, body, failure, json, ApiError } from '@/lib/api';
import { evolutionRequest } from '@/lib/evolution';
import { inboxQuery, inboxReply } from '@/lib/validation';
import type { InboxChat, InboxMessage } from '@/lib/types';

type UnknownRow = Record<string, any>;
const rows = (value: any): UnknownRow[] => Array.isArray(value) ? value : Array.isArray(value?.records) ? value.records : Array.isArray(value?.messages?.records) ? value.messages.records : Array.isArray(value?.chats?.records) ? value.chats.records : [];
const textOf = (message: UnknownRow) => message?.message?.conversation ?? message?.message?.extendedTextMessage?.text ?? message?.message?.imageMessage?.caption ?? message?.message?.videoMessage?.caption ?? (message?.message?.imageMessage ? 'Photo' : message?.message?.audioMessage ? 'Voice message' : message?.message?.documentMessage ? 'Document' : 'Message');

async function instanceFor(db: any, workspaceId: string, numberId: string) {
  const { data, error } = await db.from('vc_numbers').select('instance_name').eq('id', numberId).eq('workspace_id', workspaceId).single();
  if (error || !data) throw new ApiError(404, 'Number not found in this workspace.');
  return encodeURIComponent(data.instance_name);
}

export async function GET(request: Request) { try {
  const input = inboxQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  const { db } = await authorize(input.workspaceId);
  const instance = await instanceFor(db, input.workspaceId, input.numberId);
  if (input.remoteJid) {
    const raw = await evolutionRequest<any>(`/chat/findMessages/${instance}`, { method: 'POST', body: { where: { key: { remoteJid: input.remoteJid } }, page: 1, offset: 50 }, timeoutMs: 15_000 });
    const messages: InboxMessage[] = rows(raw).map(item => ({ id: String(item.key?.id ?? item.id ?? crypto.randomUUID()), text: textOf(item), timestamp: Number(item.messageTimestamp ?? item.timestamp ?? 0), fromMe: Boolean(item.key?.fromMe), status: item.status })).sort((a, b) => a.timestamp - b.timestamp);
    return json({ messages });
  }
  const raw = await evolutionRequest<any>(`/chat/findChats/${instance}`, { method: 'POST', body: {}, timeoutMs: 15_000 });
  const chats: InboxChat[] = rows(raw).flatMap(item => {
    const id = String(item.remoteJid ?? item.id ?? '');
    if (!id.endsWith('@s.whatsapp.net') && !id.endsWith('@g.us')) return [];
    const last = item.lastMessage ?? item.messages?.[0] ?? {};
    const phone = id.split('@')[0];
    return [{ id, name: item.name ?? item.pushName ?? item.contact?.pushName ?? (id.endsWith('@g.us') ? 'WhatsApp group' : `+${phone}`), preview: textOf(last), timestamp: Number(item.updatedAt ? new Date(item.updatedAt).getTime() / 1000 : last.messageTimestamp ?? 0), unread: Number(item.unreadMessages ?? item.unreadCount ?? 0), group: id.endsWith('@g.us') }];
  }).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return json({ chats: chats.slice(0, 200) });
} catch (e) { return failure(e); } }

export async function POST(request: Request) { try {
  const input = inboxReply.parse(await body(request));
  const { db } = await authorize(input.workspaceId);
  const instance = await instanceFor(db, input.workspaceId, input.numberId);
  const { data: permitted, error } = await db.rpc('vc_consume_action', { target: input.workspaceId, action_name: 'send' });
  if (error || !permitted) throw new ApiError(429, 'Too many messages. Please wait a minute.');
  const destination = input.remoteJid.endsWith('@s.whatsapp.net') ? input.remoteJid.split('@')[0] : input.remoteJid;
  await evolutionRequest(`/message/sendText/${instance}`, { method: 'POST', body: { number: destination, text: input.text } });
  return json({ accepted: true }, 201);
} catch (e) { return failure(e); } }
