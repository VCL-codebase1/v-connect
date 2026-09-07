# V Connect

A mobile-friendly Next.js app for managing multiple WhatsApp numbers across tenant workspaces. Deploy the web app on Vercel; Evolution API stays on the VPS.

## Included

- Workspace switching and creation; separate numbers and members for each tenant.
- Owner, admin, and member access enforced in the API and PostgreSQL RLS.
- Email/password login and email confirmation through Supabase Auth.
- Multiple WhatsApp instances, connection status, QR device pairing, and individual text messages.
- Email-bound, single-use team invitation links and owner-controlled member removal.
- Database-backed message/connect rate limits shared across serverless instances.
- Responsive dashboard, mobile menu, search, filters, loading states, and accessible native dialogs.

## Run locally

```bash
npm ci
npm run dev
```

The existing `.env.local` contains the Evolution credentials. Keep it private. Before Supabase is configured, `/` redirects to `/login`; live API routes fail closed. The configured API uses public HTTPS and does not need a tunnel. Only use this tunnel if you deliberately switch `EVOLUTION_API_URL` to `http://localhost:8080` for troubleshooting:

```bash
ssh -N -L 8080:127.0.0.1:8080 root@76.13.62.161
```

## Connect Supabase

The existing project `iktenrvmriqzsmixafsc` is already configured and its schema is installed. Do not rerun the initial migration there. For a new project:

1. Create a Supabase project, or use a dedicated existing project.
2. Run `supabase/migrations/001_workspaces.sql` once in its SQL editor. This creates `vc_*` tables, RLS policies, and guarded RPCs. Do not run the test setup in your real project.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local` and Vercel. No service-role key is required.
4. Enable email/password authentication and email confirmation. Configure production SMTP and Supabase authentication rate limits before inviting customers.
5. In Auth → URL Configuration, set Site URL to your Vercel production URL and allow `https://v-connect-blond.vercel.app/auth/confirm` and `http://localhost:3000/auth/confirm` as redirect URLs. Set `APP_URL` to the app URL for each deployment environment.
6. Default PKCE confirmation links work in the browser used to sign up. For cross-device confirmation, customize the confirmation template to point to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Users can reopen their invitation link after confirming.
7. Sign up, confirm your email, sign in, and create a workspace. Owners/admins can add numbers and invite colleagues. All workspace members can send individual messages.

## Deploy on Vercel

Deployment is user-managed. The previous local Vercel project binding has been removed; choose your own account and project. The project uses standard Next.js with Node 22. Vercel detects `next build` automatically. Deploy through the CLI or connect the repository for future deployments.

Set these environment variables for each intended environment and redeploy:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://iktenrvmriqzsmixafsc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Copy from your local `.env.local` |
| `APP_URL` | `https://v-connect-blond.vercel.app` |
| `EVOLUTION_API_URL` | `https://vcglengineering.tech` |
| `EVOLUTION_API_ORIGIN` | `http://localhost:3000` (an existing allowed Origin sent by the backend) |
| `EVOLUTION_API_KEY` | Existing secret from the VPS `.env` |

The Vercel deployment refuses an HTTP Evolution endpoint. `localhost:8080` only works through the local SSH tunnel; Vercel cannot reach it. The VPS currently allows the literal Origin `http://localhost:3000`; the helper sends this explicitly. HTTPS is configured. This Origin header is sent by the server, so the current value works even when the app is hosted elsewhere. If you change it to your final app origin, update the VPS allowlist at the same time. Never expose the API key with a `NEXT_PUBLIC_` prefix.

## Verification

```bash
npm run check:setup
npm run typecheck
npm test
npm run build
```

Database integration tests passed both in an isolated PostgreSQL 15 container and against the actual Supabase database in rollback-only transactions. No test users or workspaces were retained. They exercise actual RLS, tenant access, immutable instance mappings, invitation roles, email matching, invitation replay, revocation, and rate limits. To repeat in a disposable PostgreSQL instance, pipe `tests/rls-setup.sql`, the migration, and `tests/rls.test.sql` into `psql -v ON_ERROR_STOP=1` as its administrator. Never use the test setup against a real Supabase or Evolution database.

## Operational limits

- Supabase and public VPS HTTPS are connected. Real signup, confirmation, WhatsApp pairing, and message delivery still need end-to-end verification after you deploy and configure your final confirmation URLs. No real messages were sent during development.
- This version sends individual text messages; it does not include a shared inbox, media messages, campaigns, billing, or incoming-message webhooks.
- Each workspace can have 20 numbers and each user can own 10 workspaces. Limits are enforced in the database. The VPS’s practical capacity depends on traffic and message history.
- QR pairing needs a second screen for scanning. Connection statuses update when opening a workspace or pressing refresh.
- Provider instance creation and database creation are separate operations. If the provider is temporarily unavailable, the database keeps the number; Connect retries provisioning when the instance is missing.
- A send timeout does not prove delivery failed. Check WhatsApp before manually retrying; sending is never automatically retried.
- No customer data or real VPS credentials are embedded in the client. Client code never receives the global Evolution key.

See `DEPLOYMENT.md` for VPS operations and backups.

