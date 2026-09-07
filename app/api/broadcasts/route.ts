import { authorize, body, failure, json, ApiError } from '@/lib/api';
import { evolutionRequest } from '@/lib/evolution';
import { broadcastAction, workspaceId } from '@/lib/validation';

export const maxDuration = 60;

export async function GET(request: Request) { try {
  const target = workspaceId.parse(new URL(request.url).searchParams.get('workspaceId'));
  const { db } = await authorize(target);
  const { data, error } = await db.from('vc_broadcasts').select('id,name,message,status,recipient_count,sent_count,failed_count,created_at,completed_at,vc_numbers(label)').eq('workspace_id', target).order('created_at', { ascending: false }).limit(30);
  if (error) throw new ApiError(500, 'Broadcast history could not be loaded. Apply migration 002 first.');
  return json({ broadcasts: (data ?? []).map(row => ({ ...row, number_label: (row.vc_numbers as unknown as { label?: string } | null)?.label })) });
} catch (e) { return failure(e); } }

export async function POST(request: Request) { try {
  const input = broadcastAction.parse(await body(request));
  const { db } = await authorize(input.workspaceId, true);
  const { data: number, error } = await db.from('vc_numbers').select('instance_name').eq('id', input.numberId).eq('workspace_id', input.workspaceId).single();
  if (error || !number) throw new ApiError(404, 'Number not found in this workspace.');
  const { data: broadcastId, error: beginError } = await db.rpc('vc_begin_broadcast', { target: input.workspaceId, source_number: input.numberId, broadcast_name: input.name, broadcast_message: input.text, total_recipients: input.recipients.length });
  if (beginError || !broadcastId) throw new ApiError(429, 'Could not start this broadcast. Check access or wait before trying again.');
  let sent = 0;
  let failed = 0;
  const instance = encodeURIComponent(number.instance_name);
  for (let i = 0; i < input.recipients.length; i += 5) {
    const batch = await Promise.allSettled(input.recipients.slice(i, i + 5).map(recipient => evolutionRequest(`/message/sendText/${instance}`, { method: 'POST', body: { number: recipient.phone, text: input.text }, timeoutMs: 10_000 })));
    sent += batch.filter(result => result.status === 'fulfilled').length;
    failed += batch.filter(result => result.status === 'rejected').length;
  }
  const status = sent === 0 ? 'failed' : failed ? 'partial' : 'completed';
  await db.rpc('vc_finish_broadcast', { broadcast_id: broadcastId, delivered: sent, rejected: failed, final_status: status });
  return json({ id: broadcastId, sent, failed, status }, 201);
} catch (e) { return failure(e); } }
