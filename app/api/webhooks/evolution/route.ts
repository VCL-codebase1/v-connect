import { createClient } from '@supabase/supabase-js';
import { json, ApiError, failure } from '@/lib/api';

export async function POST(request: Request) { try {
  const secret = request.headers.get('x-v-connect-webhook');
  if (!secret || secret.length < 32) throw new ApiError(401, 'Invalid webhook credentials.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'JSON request required.');
  const raw = await request.text();
  if (raw.length > 200_000) throw new ApiError(413, 'Webhook payload too large.');
  let payload: any;
  try { payload = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid webhook payload.'); }
  const instance = String(payload.instance ?? payload.instanceName ?? '');
  const event = String(payload.event ?? '').toLowerCase();
  const eventData = payload.data ?? {};
  const key = eventData.key ?? eventData.message?.key ?? {};
  const conversationJid = typeof key.remoteJid === 'string' ? key.remoteJid : null;
  const sentByUs = Boolean(key.fromMe);
  if (!/^vc_[a-f0-9]{32}$/.test(instance)) throw new ApiError(400, 'Invalid instance.');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await db.rpc('vc_record_inbox_event', { webhook_secret: secret, provider_instance: instance, event_name: event, conversation_jid: conversationJid, sent_by_us: sentByUs });
  if (error) throw new ApiError(401, 'Webhook rejected.');
  return json({ received: true });
} catch (e) { return failure(e); } }
