import { authorize, body, failure, json, ApiError } from '@/lib/api';
import { numberAction } from '@/lib/validation';
import { evolutionRequest, EvolutionError } from '@/lib/evolution';
export const maxDuration = 60;
async function provision(instanceName: string) {
  return evolutionRequest('/instance/create', { method: 'POST', body: { instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: false } });
}
export async function POST(request: Request) { try {
  const input = numberAction.parse(await body(request));
  const { db } = await authorize(input.workspaceId, input.action !== 'send');
  if (input.action === 'create') {
    const { data: number, error } = await db.rpc('vc_create_number', { target: input.workspaceId, number_label: input.label });
    if (error) throw new ApiError(400, 'Could not add number. A workspace can have up to 20 numbers.');
    try { await provision(number.instance_name); }
    catch { return json({ number, warning: 'Number saved. Use Connect to finish pairing when the connection is available.' }, 201); }
    return json({ number }, 201);
  }
  // The provider identifier is always resolved from a tenant-scoped database row.
  const { data: number, error } = await db.from('vc_numbers').select('instance_name').eq('id', input.numberId).eq('workspace_id', input.workspaceId).single();
  if (error || !number) throw new ApiError(404, 'Number not found in this workspace.');
  const { data: permitted, error: limitError } = await db.rpc('vc_consume_action', { target: input.workspaceId, action_name: input.action });
  if (limitError || !permitted) throw new ApiError(429, 'Too many requests. Please wait a minute.');
  const name = encodeURIComponent(number.instance_name);
  if (input.action === 'connect') {
    try { await evolutionRequest(`/instance/connectionState/${name}`, { timeoutMs: 5000 }); }
    catch (e) { if (e instanceof EvolutionError && e.status === 404) await provision(number.instance_name); else throw e; }
    const data = await evolutionRequest<{ base64?: string; instance?: { state?: string } }>(`/instance/connect/${name}`);
    const base64 = data.base64?.match(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/) ? data.base64 : undefined;
    return json({ base64, connected: data.instance?.state === 'open' });
  }
  await evolutionRequest(`/message/sendText/${name}`, { method: 'POST', body: { number: input.phone, text: input.text } });
  return json({ accepted: true });
} catch (e) { return failure(e); } }
