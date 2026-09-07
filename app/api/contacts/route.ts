import { authorize, failure, json, ApiError } from '@/lib/api';
import { evolutionRequest } from '@/lib/evolution';
import { contactsQuery } from '@/lib/validation';
import type { Contact } from '@/lib/types';

type EvolutionContact = { id?: string; remoteJid?: string; pushName?: string | null; name?: string | null };

export async function GET(request: Request) { try {
  const input = contactsQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  const { db } = await authorize(input.workspaceId);
  const { data: number, error } = await db.from('vc_numbers').select('instance_name').eq('id', input.numberId).eq('workspace_id', input.workspaceId).single();
  if (error || !number) throw new ApiError(404, 'Number not found in this workspace.');
  const raw = await evolutionRequest<EvolutionContact[]>(`/chat/findContacts/${encodeURIComponent(number.instance_name)}`, { method: 'POST', body: { where: {} }, timeoutMs: 15_000 });
  const contacts = (Array.isArray(raw) ? raw : []).flatMap((item): Contact[] => {
    const jid = item.remoteJid ?? item.id ?? '';
    if (!jid.endsWith('@s.whatsapp.net')) return [];
    const phone = jid.slice(0, -'@s.whatsapp.net'.length).replace(/\D/g, '');
    if (!/^[1-9][0-9]{7,14}$/.test(phone)) return [];
    return [{ id: jid, phone, name: (item.pushName ?? item.name ?? `+${phone}`).trim() }];
  });
  return json({ contacts: Array.from(new Map(contacts.map(contact => [contact.phone, contact])).values()).sort((a, b) => a.name.localeCompare(b.name)) });
} catch (e) { return failure(e); } }
