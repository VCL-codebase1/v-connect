import 'server-only';
import { authorize, ApiError } from '@/lib/api';
import { evolutionRequest } from '@/lib/evolution';
import type { WhatsAppNumber } from '@/lib/types';
export async function workspaceData(id: string) {
  const { db } = await authorize(id);
  const [numbersResult, membersResult] = await Promise.all([db.from('vc_numbers').select('*').eq('workspace_id', id).order('created_at'), db.rpc('vc_team', { target: id })]);
  if (numbersResult.error || membersResult.error) throw new ApiError(500, 'Workspace data could not be loaded. Check the database setup.');
  const raw = numbersResult.data as WhatsAppNumber[];
  const numbers: WhatsAppNumber[] = [];
  // Bound concurrent VPS requests, even when a workspace has many numbers.
  for (let i = 0; i < raw.length; i += 5) {
    numbers.push(...await Promise.all(raw.slice(i, i + 5).map(async number => {
      try { const data = await evolutionRequest<{ instance?: { state?: string } }>(`/instance/connectionState/${encodeURIComponent(number.instance_name)}`, { timeoutMs: 3000 }); return { ...number, state: data.instance?.state ?? 'close' }; }
      catch { return { ...number, state: 'unknown', error: 'Connection status unavailable' }; }
    })));
  }
  return { numbers, members: membersResult.data ?? [], warning: numbers.some(n => n.error) ? 'Some connection statuses could not be checked. Your numbers are saved; try refreshing shortly.' : undefined };
}
