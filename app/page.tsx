import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/dashboard';
import { isConfigured, supabaseServer } from '@/lib/supabase/server';
import type { Workspace } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!isConfigured()) redirect('/demo');
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await db.from('vc_memberships').select('workspace_id,role,vc_workspaces(id,name)').eq('user_id', user.id).order('joined_at');
  const workspaces: Workspace[] = (data ?? []).flatMap(row => { const w = row.vc_workspaces as unknown as { id: string; name: string } | null; return w ? [{ ...w, role: row.role }] : []; });
  return <Dashboard initial={{ demo: false, user: { email: user.email ?? '' }, workspaces, numbers: [], members: [], error: error ? 'Workspace data could not be loaded. Please check the database setup.' : undefined }}/>;
}
