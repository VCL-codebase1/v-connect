import { authenticated, authorize, body, failure, json, ApiError } from '@/lib/api';
import { teamAction } from '@/lib/validation';
export async function POST(request: Request) { try {
  const input = teamAction.parse(await body(request));
  if (input.action === 'accept') {
    const { db } = await authenticated();
    const { data, error } = await db.rpc('vc_accept_invite', { token: input.token });
    if (error) throw new ApiError(400, 'This invitation has expired, was used, or belongs to a different email.');
    return json({ workspaceId: data });
  }
  const { db, role } = await authorize(input.workspaceId, true);
  if (input.action === 'remove') {
    if (role !== 'owner') throw new ApiError(403, 'Only the workspace owner can remove teammates.');
    const { error } = await db.rpc('vc_remove_member', { target: input.workspaceId, member_id: input.userId });
    if (error) throw new ApiError(400, 'Could not remove this teammate.');
    return json({ removed: true });
  }
  const { data, error } = await db.rpc('vc_invite', { target: input.workspaceId, invite_email: input.email, invite_role: input.role });
  if (error) throw new ApiError(400, 'Could not create invitation. Daily limit: 20 per workspace.');
  return json({ token: data });
} catch (e) { return failure(e); } }
