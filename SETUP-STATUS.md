# Live setup status

Updated September 5, 2026.

- Supabase project: `iktenrvmriqzsmixafsc`.
- Workspace schema installed in Supabase: five `vc_*` tables with RLS.
- Isolation, invitation, role, revocation, and rate-limit tests passed against the real Supabase database inside rollback-only transactions.
- Public Supabase API rejects anonymous workspace reads.
- VPS API: `https://vcglengineering.tech`, served by Caddy with automatic TLS renewal.
- Public API authentication verified: HTTP 401 without a key; HTTP 200 with a key and the allowed Origin.
- Deployment is now user-managed. No further Vercel account changes or deployments will be made by the assistant. Previous deployments remain untouched.
- Local Vercel project binding and expired local deployment token removed. Runtime values remain in `.env.local`; copy the six variables listed in `README.md` to your own deployment. Database administrator credentials are not used by the application.
- Final app URL: `https://v-connect-blond.vercel.app`.
- The VPS accepts authenticated Evolution API requests carrying this final app origin; the read-only production check returned HTTP 200.

## Remaining Supabase dashboard setting

Open https://supabase.com/dashboard/project/iktenrvmriqzsmixafsc/auth/url-configuration

Set Site URL to `https://v-connect-blond.vercel.app`, and set `APP_URL` to the same origin in your deployment.

Add the exact Redirect URLs:

- `https://v-connect-blond.vercel.app/auth/confirm`
- `http://localhost:3000/auth/confirm`

Email login and sign-up are enabled. Email confirmation is required. Keep confirmation enabled. No real signup emails or WhatsApp messages were sent during setup. After redirects are configured, create an account, confirm email, create a workspace, add a number, and pair it using WhatsApp Linked devices.

The Evolution CORS allowlist contains `http://localhost:3000`, `https://v-connect-anywork365.vercel.app`, and `https://v-connect-blond.vercel.app`. The app sends the configured Origin header explicitly. The database and Redis remain private; only Caddy exposes ports 80/443.

Run `npm run check:setup` for read-only service checks. It prints no secrets, creates no accounts or numbers, and sends no messages.
