import { authorize, body, failure, json, ApiError } from '@/lib/api';
import { evolutionRequest } from '@/lib/evolution';
import { inboxQuery, inboxReply, inboxTeamAction } from '@/lib/validation';
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
    await db.rpc('vc_mark_conversation_read', { target: input.workspaceId, source_number: input.numberId, conversation_jid: input.remoteJid });
    const { data: conversation } = await db.from('vc_conversations').select('id,status,assigned_to').eq('workspace_id',input.workspaceId).eq('number_id',input.numberId).eq('remote_jid',input.remoteJid).maybeSingle();
    const { data: notes } = conversation ? await db.from('vc_conversation_notes').select('id,body,author_id,created_at').eq('conversation_id',conversation.id).order('created_at') : { data: [] };
    return json({ messages, conversation, notes: notes ?? [] });
  }
  const raw = await evolutionRequest<any>(`/chat/findChats/${instance}`, { method: 'POST', body: {}, timeoutMs: 15_000 });
  const chats: InboxChat[] = rows(raw).flatMap(item => {
    const id = String(item.remoteJid ?? item.id ?? '');
    if (!id.endsWith('@s.whatsapp.net') && !id.endsWith('@g.us')) return [];
    const last = item.lastMessage ?? item.messages?.[0] ?? {};
    const phone = id.split('@')[0];
    return [{ id, name: item.name ?? item.pushName ?? item.contact?.pushName ?? (id.endsWith('@g.us') ? 'WhatsApp group' : `+${phone}`), preview: textOf(last), timestamp: Number(item.updatedAt ? new Date(item.updatedAt).getTime() / 1000 : last.messageTimestamp ?? 0), unread: Number(item.unreadMessages ?? item.unreadCount ?? 0), group: id.endsWith('@g.us') }];
  }).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const { data: metadata } = await db.from('vc_conversations').select('remote_jid,status,assigned_to,unread_count').eq('workspace_id',input.workspaceId).eq('number_id',input.numberId);
  const byJid = new Map((metadata ?? []).map(item => [item.remote_jid,item]));
  return json({ chats: chats.slice(0, 200).map(chat => ({ ...chat, ...(byJid.get(chat.id) ?? {}) })) });
} catch (e) { return failure(e); } }

export async function POST(request: Request) { try {
  const raw = await body(request);
  if (raw?.action) {
    const input = inboxTeamAction.parse(raw);
    const { db } = await authorize(input.workspaceId);
    if (input.action === 'update') { const { data, error } = await db.rpc('vc_update_conversation', { target: input.workspaceId, source_number: input.numberId, conversation_jid: input.remoteJid, next_status: input.status, assignee: input.assignedTo }); if (error) throw new ApiError(400,'Could not update this conversation.'); return json({ conversation: data }); }
    const { data, error } = await db.rpc('vc_add_conversation_note', { target: input.workspaceId, source_number: input.numberId, conversation_jid: input.remoteJid, note_body: input.text }); if (error) throw new ApiError(400,'Could not add the note.'); return json({ note: data },201);
  }
  const input = inboxReply.parse(raw);
  const { db } = await authorize(input.workspaceId);
  const instance = await instanceFor(db, input.workspaceId, input.numberId);
  const { data: permitted, error } = await db.rpc('vc_consume_action', { target: input.workspaceId, action_name: 'send' });
  if (error || !permitted) throw new ApiError(429, 'Too many messages. Please wait a minute.');
  const destination = input.remoteJid.endsWith('@s.whatsapp.net') ? input.remoteJid.split('@')[0] : input.remoteJid;
  await evolutionRequest(`/message/sendText/${instance}`, { method: 'POST', body: { number: destination, text: input.text } });
  return json({ accepted: true }, 201);
} catch (e) { return failure(e); } }
