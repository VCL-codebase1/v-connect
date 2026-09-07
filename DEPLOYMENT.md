# Evolution API deployment

VPS: `76.13.62.161`  
Deployment directory on VPS: `/opt/evolution-api`

Evolution API runs in Docker Compose with PostgreSQL 15 and Redis 7. Data and WhatsApp sessions use persistent Docker volumes. Containers restart automatically and logs rotate. PostgreSQL and Redis have no host ports; the API currently listens on the VPS loopback interface at port 8080.

## Access

The public API endpoint is `https://vcglengineering.tech`, behind Caddy with automatic TLS renewal. The app deployment is user-managed; see `README.md` for the required environment values. To use the private loopback endpoint for troubleshooting, keep this SSH tunnel running on your Mac:

```bash
ssh -N -L 8080:127.0.0.1:8080 root@76.13.62.161
```

Your local Next.js server can then use `http://localhost:8080`.

## Next.js

The local `.env.local` contains `EVOLUTION_API_URL`, `EVOLUTION_API_ORIGIN`, and `EVOLUTION_API_KEY`. Keep these variables server-side; never use a `NEXT_PUBLIC_` prefix or expose the key to browser code. The deployed Next.js app uses the public HTTPS endpoint. This version rejects requests without an allowed Origin header, including backend requests, so send the configured origin explicitly.

Example server-side request:

```ts
const response = await fetch(
  `${process.env.EVOLUTION_API_URL}/instance/fetchInstances`,
  {
    headers: {
      apikey: process.env.EVOLUTION_API_KEY!,
      Origin: process.env.EVOLUTION_API_ORIGIN!,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  },
);
if (!response.ok) throw new Error(`Evolution API returned ${response.status}`);
const instances = await response.json();
```

## Operations

SSH into the VPS, then:

```bash
cd /opt/evolution-api
docker compose ps
docker compose logs --tail=100 api
docker compose restart api
```

Secrets are stored in `/opt/evolution-api/.env` with owner-only permissions. Do not run `docker compose down -v`: it deletes persistent data. Back up the database, instance volume, and configuration before upgrades.

The API has an authenticated Docker health check. An unhealthy status is diagnostic; Docker restart policies restart exited containers, not merely unhealthy ones.

## Backups

`evolution-backup.timer` runs daily at 02:00 UTC, with up to five minutes of jitter. It stores owner-only backups under `/var/backups/evolution-api`, retaining roughly seven days. Backups contain a PostgreSQL custom-format dump, WhatsApp instance files, deployment configuration, secrets, and checksums. Redis is a rebuildable cache and is not backed up.

```bash
sudo systemctl start evolution-backup.service
sudo systemctl status evolution-backup.service
sudo systemctl list-timers evolution-backup.timer
```

These backups are on the same VPS, so they do not protect against loss of the server. Off-server backup storage remains to be configured. The database dump is transactionally consistent; live session files are captured separately. Stop the API before a backup if you require a coordinated snapshot for an upgrade.

To restore, stop the API, preserve the current volumes and configuration, and restore the chosen database dump into an empty database using `pg_restore -U evolution -d evolution`. Restore `instances.tar.gz` into the instance volume, restore the matching configuration files, and start the stack. Do not overwrite a running deployment without preserving its current data.

## Prepared Next.js client

`lib/evolution.ts` contains the server-only request helper used by the Next.js app now in this workspace. Workspace routes check membership and resolve the Evolution instance name from a tenant-scoped database row. The helper refuses redirects and adds the API key and required Origin header. See `README.md` for Supabase setup and Vercel deployment. The global instance-list endpoint is not exposed by the app.

## Pending

- Configure the Supabase email-confirmation redirect URLs in the dashboard (see `SETUP-STATUS.md`).
- Pair a WhatsApp account and configure app-specific webhooks when the app URL is known.
