import { redirect } from 'next/navigation';
import { AcceptInvite } from '@/components/accept-invite';
import { isConfigured, supabaseServer } from '@/lib/supabase/server';
import { z } from 'zod';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const { token } = await searchParams;
  if (!z.uuid().safeParse(token).success) redirect('/login');
  const next = `/invite?token=${token}`;
  if (!isConfigured()) redirect(`/login?next=${encodeURIComponent(next)}`);
  const db = await supabaseServer(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return <AcceptInvite token={token!} email={user.email ?? ''}/>;
}
