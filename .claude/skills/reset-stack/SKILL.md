---
name: reset-stack
description: Wipe the database, rebuild and restart the Docker stack, and verify all services are healthy.
disable-model-invocation: true
allowed-tools: Bash(*)
---

# Reset Stack

Wipe the database, restart the Docker stack with a fresh build, and verify everything is healthy.

This is a **destructive operation** — the SQLite database will be deleted. Confirm with the user before proceeding.

## Dynamic context

Current container status:
!`docker compose ps 2>/dev/null || echo "No containers running"`

Docker volume info:
!`docker volume inspect indexer-tools-v3_indexer-tools-data 2>/dev/null | head -20 || echo "Volume not found"`

## Workflow

### Step 1 — Confirm

Ask the user to confirm they want to wipe the database and restart. Do NOT proceed without explicit confirmation.

### Step 2 — Stop containers

```bash
docker compose down
```

### Step 3 — Wipe database

Delete all database files from the named volume. The compose project prefixes the volume name, so the actual volume is `indexer-tools-v3_indexer-tools-data`:

```bash
docker run --rm -v indexer-tools-v3_indexer-tools-data:/data alpine sh -c "rm -f /data/*.db /data/*.db-wal /data/*.db-shm /data/*.json && ls -la /data/ && echo 'Database wiped'"
```

Verify the output shows an empty directory. If the volume doesn't exist, check for a local `./data` directory and clear it instead.

### Step 4 — Rebuild and start

```bash
docker compose up --build -d
```

Wait for the build to complete. If it fails, report the error and stop.

### Step 5 — Wait for healthy

Wait up to 60 seconds for containers to become healthy:

```bash
timeout 60 bash -c 'until docker compose ps --format json 2>/dev/null | grep -q healthy; do sleep 3; done'
```

### Step 6 — Verify

Run all three checks and report results:

1. **Container status**: `docker compose ps` — both backend and frontend should show `Up` and `(healthy)`
2. **Backend health**: `docker compose exec -T indexer-tools-backend wget -qO- http://localhost:4000/api/health 2>/dev/null || echo "Health check failed"`
3. **Recent logs**: `docker compose logs --tail 20 indexer-tools-backend` — scan for errors or startup issues

### Step 7 — Report

Summarise the outcome:
- Containers running and healthy?
- Backend API responding?
- Any errors in logs?
- Database recreated fresh (empty tables)?
