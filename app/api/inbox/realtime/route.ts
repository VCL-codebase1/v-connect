import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { authorize, body, failure, json, ApiError } from '@/lib/api';
import { evolutionRequest } from '@/lib/evolution';
import { workspaceId } from '@/lib/validation';

export async function POST(request: Request) { try {
  const input = z.object({ workspaceId, numberId: z.uuid() }).parse(await body(request));
  const { db } = await authorize(input.workspaceId, true);
  const { data: number, error } = await db.from('vc_numbers').select('instance_name').eq('id', input.numberId).eq('workspace_id', input.workspaceId).single();
  if (error || !number) throw new ApiError(404, 'Number not found in this workspace.');
  const appUrl = process.env.APP_URL;
  if (!appUrl || new URL(appUrl).protocol !== 'https:') throw new ApiError(503, 'Set APP_URL to the deployed HTTPS app before enabling live updates.');
  const secret = randomBytes(32).toString('hex');
  const { error: secretError } = await db.rpc('vc_set_webhook_secret', { target: input.workspaceId, source_number: input.numberId, webhook_secret: secret });
  if (secretError) throw new ApiError(500, 'Could not secure the webhook. Apply migration 003 first.');
  await evolutionRequest(`/webhook/set/${encodeURIComponent(number.instance_name)}`, { method: 'POST', body: { webhook: { enabled: true, url: `${appUrl.replace(/\/$/, '')}/api/webhooks/evolution`, webhookByEvents: false, webhookBase64: false, headers: { 'x-v-connect-webhook': secret }, events: ['MESSAGES_UPSERT','MESSAGES_UPDATE','SEND_MESSAGE','SEND_MESSAGE_UPDATE','CHATS_UPSERT','CHATS_UPDATE','CONNECTION_UPDATE'] } } });
  return json({ enabled: true });
} catch (e) { return failure(e); } }
