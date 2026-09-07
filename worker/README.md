# Campaign worker

This single worker delivers queued `vc_campaign_recipients` through Evolution API. It uses PostgreSQL row locks, so a recipient is claimed atomically. Keep one worker process for now; `SEND_INTERVAL_MS=3000` spaces messages from all connected numbers by three seconds.

Docker is the preferred installation on the Evolution VPS:

```bash
sudo mkdir -p /opt/v-connect-worker
# Copy this directory and create /opt/v-connect-worker/.env from .env.example, then:
cd /opt/v-connect-worker
sudo chmod 600 .env
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=50 campaign-worker
```

The database URL and Evolution API key belong only in the VPS `.env`, with owner-only permissions. A delivery timeout is recorded as `timeout_unknown` and is not retried automatically because Evolution may already have accepted the message.
