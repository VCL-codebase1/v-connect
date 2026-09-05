import { LoginForm } from '@/components/login-form';
import { isConfigured } from '@/lib/supabase/server';
import { safeNext } from '@/lib/validation';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) { const params = await searchParams; return <LoginForm configured={isConfigured()} next={safeNext(params.next ?? null)} confirmationError={params.error === 'confirmation'}/>; }
