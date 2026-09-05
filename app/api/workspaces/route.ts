import { z } from 'zod';
import { authenticated, body, failure, json, ApiError } from '@/lib/api';
import { name, workspaceId } from '@/lib/validation';
import { workspaceData } from '@/lib/workspaces';
export const maxDuration = 30;
export async function GET(request: Request) { try { const id = workspaceId.parse(new URL(request.url).searchParams.get('id')); return json(await workspaceData(id)); } catch (e) { return failure(e); } }
export async function POST(request: Request) { try {
  const input = z.object({ name }).parse(await body(request));
  const { db } = await authenticated();
  const { data, error } = await db.rpc('vc_create_workspace', { workspace_name: input.name });
  if (error) throw new ApiError(400, 'Could not create workspace. You can own up to 10 workspaces.');
  return json({ workspace: { ...data, role: 'owner' } }, 201);
} catch (e) { return failure(e); } }
