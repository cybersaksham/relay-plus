# Relay Plus

Relay Plus is a local-first multi-repo AI workspace app built as two services:

- `backend`: Rust API and orchestration service
- `frontend`: Next.js UI with a local design system

## What is implemented

- Organizations, environments, threads, messages, jobs, and agent sessions persisted in Postgres
- Source clone caching and per-thread workspace materialization under `PROJECT_BASE_DATA_DIRECTORY`
- Setup and workspace script execution with per-job log files
- Codex runner adapter using `codex exec --json` and `codex exec resume`
- SSE stream for thread preparation and Codex run events
- Next.js dashboard, thread workspace, and design-system reference route

## Local development

1. Start Postgres:

```bash
docker compose up -d postgres
```

2. Configure the backend:

```bash
cp backend/.env.example backend/.env
```

3. Configure the frontend:

```bash
cp frontend/.env.example frontend/.env.local
```

4. Run both services together:

```bash
./scripts/dev.sh
```

## Notes

- Codex must be installed on the host machine and logged in.
- Set `CODEX_HOME` in `backend/.env` to the Codex profile directory that already contains your login, typically `~/.codex`.
- Repo cloning uses the host machine's existing SSH agent and keys.
- Workspace writes are scoped to the thread workspace via Codex `workspace-write` sandbox mode.
- The combined dev runner expects `backend/.env` and either `frontend/.env` or `frontend/.env.local`.
