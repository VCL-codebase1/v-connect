import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { supabaseServer, isConfigured } from '@/lib/supabase/server';
import { canManage } from '@/lib/validation';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } }); }
export async function body(request: Request, maxBytes = 20000) {
  const url = new URL(request.url);
  // Next's local request URL may normalize 127.0.0.1 to localhost; Host preserves
  // the browser-facing authority. Never accept a caller-supplied forwarded host.
  const expectedOrigin = `${url.protocol}//${request.headers.get('host') ?? url.host}`;
  if (request.headers.get('origin') !== expectedOrigin) throw new ApiError(403, 'Request origin is not allowed.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'JSON request required.');
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw new ApiError(413, 'Request too large.');
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, 'Request too large.');
  try { return JSON.parse(text); } catch { throw new ApiError(400, 'Invalid request.'); }
}
export async function authenticated() {
  if (!isConfigured()) throw new ApiError(503, 'Workspace login is not configured yet.');
  const db = await supabaseServer();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new ApiError(401, 'Please sign in to continue.');
  return { db, user };
}
export async function authorize(target: string, manage = false) {
  const context = await authenticated();
  const { data: membership, error } = await context.db.from('vc_memberships').select('role').eq('workspace_id', target).eq('user_id', context.user.id).single();
  if (error || !membership || (manage && !canManage(membership.role))) throw new ApiError(403, 'You do not have access to this workspace action.');
  return { ...context, role: membership.role as string };
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: 'Check your details and try again.' }, 400);
  // Do not log credentials, provider response bodies, or user messages.
  return json({ error: 'The service is temporarily unavailable. Please try again.' }, 502);
}
