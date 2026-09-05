import { z } from 'zod';
import { body, failure, json, ApiError } from '@/lib/api';
import { supabaseServer, isConfigured } from '@/lib/supabase/server';
import { safeNext } from '@/lib/validation';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('signout') }),
  z.object({ action: z.enum(['signin','signup']), email: z.email().max(254), password: z.string().min(8).max(128), next: z.string().optional() }),
]);
export async function POST(request: Request) { try {
  const input = schema.parse(await body(request));
  if (!isConfigured()) throw new ApiError(503, 'Login is being set up. You can explore the demo workspace now.');
  const db = await supabaseServer();
  if (input.action === 'signout') { const { error } = await db.auth.signOut(); if (error) throw new ApiError(502, 'Could not sign out. Try again.'); return json({ ok: true }); }
  if (input.action === 'signin') {
    const { error } = await db.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) throw new ApiError(400, 'Could not sign in. Check your email, password, and email confirmation.');
    return json({ redirect: safeNext(input.next ?? null) });
  }
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  const next = safeNext(input.next ?? null);
  const { data, error } = await db.auth.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` } });
  if (error) throw new ApiError(400, 'Could not create your account. Please try again shortly.');
  return json(data.session ? { redirect: next } : { message: 'Check your email to confirm your account, then sign in.' });
} catch (e) { return failure(e); } }
