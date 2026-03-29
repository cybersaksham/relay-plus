create extension if not exists "pgcrypto";

create table if not exists organizations (
    id uuid primary key,
    name text not null unique,
    created_at timestamptz not null default now(),
    archived_at timestamptz
);

create table if not exists environments (
    id uuid primary key,
    organization_id uuid not null references organizations(id) on delete cascade,
    name text not null,
    slug text not null,
    git_ssh_url text not null,
    setup_script text not null default '',
    workspace_script text not null default '',
    source_path text not null,
    status text not null,
    last_synced_commit text,
    last_sync_at timestamptz,
    active_job_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, name),
    unique (organization_id, slug)
);

create table if not exists threads (
    id uuid primary key,
    organization_id uuid not null references organizations(id) on delete cascade,
    title text not null,
    workspace_root text not null,
    status text not null,
    codex_session_id text,
    active_job_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists thread_environments (
    thread_id uuid not null references threads(id) on delete cascade,
    environment_id uuid not null references environments(id) on delete cascade,
    workspace_path text not null,
    materialization_status text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (thread_id, environment_id)
);

create table if not exists messages (
    id uuid primary key,
    thread_id uuid not null references threads(id) on delete cascade,
    role text not null,
    content text not null,
    raw_event_ref text,
    created_at timestamptz not null default now()
);

create table if not exists jobs (
    id uuid primary key,
    kind text not null,
    target_type text not null,
    target_id uuid not null,
    status text not null,
    log_path text not null,
    error_json jsonb,
    started_at timestamptz not null,
    finished_at timestamptz
);

create table if not exists environment_syncs (
    id uuid primary key,
    environment_id uuid not null references environments(id) on delete cascade,
    job_id uuid not null references jobs(id) on delete cascade,
    status text not null,
    commit_before text,
    commit_after text,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create table if not exists agent_sessions (
    id uuid primary key,
    thread_id uuid not null references threads(id) on delete cascade,
    codex_session_id text not null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz not null default now(),
    unique (thread_id, codex_session_id)
);
