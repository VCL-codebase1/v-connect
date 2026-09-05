import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { safeNext } from '@/lib/validation';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await supabaseServer();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  let error: unknown = true;
  if (code) ({ error } = await db.auth.exchangeCodeForSession(code));
  else if (tokenHash && url.searchParams.get('type') === 'email') ({ error } = await db.auth.verifyOtp({ token_hash: tokenHash, type: 'email' }));
  return NextResponse.redirect(new URL(error ? '/login?error=confirmation' : safeNext(url.searchParams.get('next')), url.origin));
}
