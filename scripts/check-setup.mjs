// Read-only checks. Does not create users, instances, or send messages.
const required = ['APP_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','EVOLUTION_API_URL','EVOLUTION_API_ORIGIN','EVOLUTION_API_KEY'];
let failures = 0;
function report(ok, label) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
for (const name of required) report(Boolean(process.env[name]), `${name} is configured`);
if (failures) process.exit(1);
function endpoint(name) {
  const url = new URL(process.env[name]);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`${name} must be a plain HTTP(S) origin`);
  return url.origin;
}
async function get(url, headers) { return fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
try {
  const app = endpoint('APP_URL');
  const sb = endpoint('NEXT_PUBLIC_SUPABASE_URL');
  const api = endpoint('EVOLUTION_API_URL');
  const origin = endpoint('EVOLUTION_API_ORIGIN');
  report(api.startsWith('https://'), 'Evolution API uses HTTPS');
  const sbHeaders = { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
  const settings = await get(`${sb}/auth/v1/settings`, sbHeaders);
  report(settings.ok, 'Supabase publishable key is accepted');
  if (settings.ok) {
    const data = await settings.json();
    report(data.external?.email === true && data.disable_signup !== true, 'Email login and sign-up are enabled');
    report(data.mailer_autoconfirm === false, 'Email confirmation is required');
  }
  const anonymous = await get(`${sb}/rest/v1/vc_workspaces?select=id`, sbHeaders);
  report([401,403].includes(anonymous.status), 'Anonymous workspace access is denied');
  const unauthenticated = await get(`${api}/instance/fetchInstances`, { Origin: origin });
  report(unauthenticated.status === 401, 'Evolution API rejects requests without a key');
  const authenticated = await get(`${api}/instance/fetchInstances`, { Origin: origin, apikey: process.env.EVOLUTION_API_KEY });
  report(authenticated.ok, 'Evolution API accepts the configured key and Origin');
  console.log(`\nSet Supabase Site URL to ${app}`);
  console.log(`Allow redirect URL ${app}/auth/confirm`);
  console.log('Dashboard redirect settings and real account/phone pairing are not verified by this check.');
} catch (error) {
  // Never print provider bodies, credentials, or request headers.
  report(false, error instanceof TypeError ? 'Invalid URL or network connection failure' : 'Setup check could not complete');
}
process.exitCode = failures ? 1 : 0;
