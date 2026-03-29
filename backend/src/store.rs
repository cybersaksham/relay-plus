use chrono::Utc;
use serde_json::json;
use sqlx::{PgPool, query, query_as};
use uuid::Uuid;

use crate::{
    domain::{
        AgentSessionRecord, CreateEnvironmentInput, CreateOrganizationInput, CreateThreadInput,
        EnvironmentRecord, JobKind, JobRecord, MessageRecord, OrganizationRecord, TargetType,
        ThreadDetailDto, ThreadEnvironmentRecord, ThreadRecord, UpdateOrganizationInput,
    },
    error::AppError,
};

pub async fn list_organizations(pool: &PgPool) -> Result<Vec<OrganizationRecord>, AppError> {
    Ok(query_as::<_, OrganizationRecord>(
        r#"
        select id, name, created_at, archived_at
        from organizations
        order by archived_at nulls first, created_at asc
        "#,
    )
    .fetch_all(pool)
    .await?)
}

pub async fn create_organization(
    pool: &PgPool,
    payload: CreateOrganizationInput,
) -> Result<OrganizationRecord, AppError> {
    Ok(query_as::<_, OrganizationRecord>(
        r#"
        insert into organizations (id, name)
        values ($1, $2)
        returning id, name, created_at, archived_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(payload.name)
    .fetch_one(pool)
    .await
    .map_err(map_unique)?)
}

pub async fn update_organization(
    pool: &PgPool,
    organization_id: Uuid,
    payload: UpdateOrganizationInput,
) -> Result<OrganizationRecord, AppError> {
    let current = get_organization(pool, organization_id).await?;
    let archived_at = match payload.archived {
        Some(true) => Some(Utc::now()),
        Some(false) => None,
        None => current.archived_at,
    };
    let name = payload.name.unwrap_or(current.name);

    Ok(query_as::<_, OrganizationRecord>(
        r#"
        update organizations
        set name = $2, archived_at = $3
        where id = $1
        returning id, name, created_at, archived_at
        "#,
    )
    .bind(organization_id)
    .bind(name)
    .bind(archived_at)
    .fetch_one(pool)
    .await
    .map_err(map_unique)?)
}

pub async fn get_organization(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<OrganizationRecord, AppError> {
    query_as::<_, OrganizationRecord>(
        r#"
        select id, name, created_at, archived_at
        from organizations
        where id = $1
        "#,
    )
    .bind(organization_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("organization {organization_id} not found")))
}

pub async fn list_environments(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<Vec<EnvironmentRecord>, AppError> {
    Ok(query_as::<_, EnvironmentRecord>(
        r#"
        select id, organization_id, name, slug, git_ssh_url, setup_script, workspace_script, source_path,
               status, last_synced_commit, last_sync_at, active_job_id, created_at, updated_at
        from environments
        where organization_id = $1
        order by created_at asc
        "#,
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await?)
}

pub async fn get_environment(
    pool: &PgPool,
    environment_id: Uuid,
) -> Result<EnvironmentRecord, AppError> {
    query_as::<_, EnvironmentRecord>(
        r#"
        select id, organization_id, name, slug, git_ssh_url, setup_script, workspace_script, source_path,
               status, last_synced_commit, last_sync_at, active_job_id, created_at, updated_at
        from environments
        where id = $1
        "#,
    )
    .bind(environment_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("environment {environment_id} not found")))
}

pub async fn create_environment(
    pool: &PgPool,
    environment_id: Uuid,
    organization_id: Uuid,
    payload: &CreateEnvironmentInput,
    slug: &str,
    source_path: &str,
    active_job_id: Uuid,
) -> Result<EnvironmentRecord, AppError> {
    Ok(query_as::<_, EnvironmentRecord>(
        r#"
        insert into environments (
            id, organization_id, name, slug, git_ssh_url, setup_script, workspace_script,
            source_path, status, active_job_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
        returning id, organization_id, name, slug, git_ssh_url, setup_script, workspace_script, source_path,
                  status, last_synced_commit, last_sync_at, active_job_id, created_at, updated_at
        "#,
    )
    .bind(environment_id)
    .bind(organization_id)
    .bind(&payload.name)
    .bind(slug)
    .bind(&payload.git_ssh_url)
    .bind(&payload.setup_script)
    .bind(&payload.workspace_script)
    .bind(source_path)
    .bind(active_job_id)
    .fetch_one(pool)
    .await
    .map_err(map_unique)?)
}

pub async fn mark_environment_running(
    pool: &PgPool,
    environment_id: Uuid,
    active_job_id: Uuid,
) -> Result<(), AppError> {
    query(
        r#"
        update environments
        set status = 'syncing', active_job_id = $2, updated_at = now()
        where id = $1
        "#,
    )
    .bind(environment_id)
    .bind(active_job_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_environment_ready(
    pool: &PgPool,
    environment_id: Uuid,
    source_path: &str,
    commit: &str,
) -> Result<(), AppError> {
    query(
        r#"
        update environments
        set status = 'ready',
            source_path = $2,
            last_synced_commit = $3,
            last_sync_at = now(),
            active_job_id = null,
            updated_at = now()
        where id = $1
        "#,
    )
    .bind(environment_id)
    .bind(source_path)
    .bind(commit)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_environment_failed(pool: &PgPool, environment_id: Uuid) -> Result<(), AppError> {
    query(
        r#"
        update environments
        set status = 'failed', active_job_id = null, updated_at = now()
        where id = $1
        "#,
    )
    .bind(environment_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_environment_sync(
    pool: &PgPool,
    environment_id: Uuid,
    job_id: Uuid,
    status: &str,
    commit_before: Option<&str>,
    commit_after: Option<&str>,
) -> Result<(), AppError> {
    query(
        r#"
        insert into environment_syncs (
            id, environment_id, job_id, status, commit_before, commit_after, created_at, completed_at
        )
        values ($1, $2, $3, $4, $5, $6, now(), now())
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(environment_id)
    .bind(job_id)
    .bind(status)
    .bind(commit_before)
    .bind(commit_after)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn create_thread(
    pool: &PgPool,
    thread_id: Uuid,
    payload: &CreateThreadInput,
    workspace_root: &str,
    active_job_id: Uuid,
) -> Result<ThreadRecord, AppError> {
    let mut tx = pool.begin().await?;

    let thread = query_as::<_, ThreadRecord>(
        r#"
        insert into threads (
            id, organization_id, title, workspace_root, status, active_job_id
        )
        values ($1, $2, $3, $4, 'preparing', $5)
        returning id, organization_id, title, workspace_root, status, codex_session_id, active_job_id,
                  created_at, updated_at
        "#,
    )
    .bind(thread_id)
    .bind(payload.organization_id)
    .bind(&payload.title)
    .bind(workspace_root)
    .bind(active_job_id)
    .fetch_one(&mut *tx)
    .await?;

    for environment_id in &payload.environment_ids {
        query(
            r#"
            insert into thread_environments (
                thread_id, environment_id, workspace_path, materialization_status
            )
            values ($1, $2, '', 'pending')
            "#,
        )
        .bind(thread_id)
        .bind(environment_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(thread)
}

pub async fn list_threads(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<Vec<ThreadRecord>, AppError> {
    Ok(query_as::<_, ThreadRecord>(
        r#"
        select id, organization_id, title, workspace_root, status, codex_session_id, active_job_id,
               created_at, updated_at
        from threads
        where organization_id = $1
        order by updated_at desc
        "#,
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await?)
}

pub async fn get_thread(pool: &PgPool, thread_id: Uuid) -> Result<ThreadRecord, AppError> {
    query_as::<_, ThreadRecord>(
        r#"
        select id, organization_id, title, workspace_root, status, codex_session_id, active_job_id,
               created_at, updated_at
        from threads
        where id = $1
        "#,
    )
    .bind(thread_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("thread {thread_id} not found")))
}

pub async fn get_thread_environments(
    pool: &PgPool,
    thread_id: Uuid,
) -> Result<Vec<ThreadEnvironmentRecord>, AppError> {
    Ok(query_as::<_, ThreadEnvironmentRecord>(
        r#"
        select thread_id, environment_id, workspace_path, materialization_status, created_at, updated_at
        from thread_environments
        where thread_id = $1
        order by created_at asc
        "#,
    )
    .bind(thread_id)
    .fetch_all(pool)
    .await?)
}

pub async fn get_thread_detail(
    pool: &PgPool,
    thread_id: Uuid,
) -> Result<ThreadDetailDto, AppError> {
    let thread = get_thread(pool, thread_id).await?;
    let thread_environments = get_thread_environments(pool, thread_id).await?;
    let environment_ids: Vec<Uuid> = thread_environments
        .iter()
        .map(|item| item.environment_id)
        .collect();

    let environments = if environment_ids.is_empty() {
        Vec::new()
    } else {
        query_as::<_, EnvironmentRecord>(
            r#"
            select id, organization_id, name, slug, git_ssh_url, setup_script, workspace_script, source_path,
                   status, last_synced_commit, last_sync_at, active_job_id, created_at, updated_at
            from environments
            where id = any($1)
            order by created_at asc
            "#,
        )
        .bind(&environment_ids)
        .fetch_all(pool)
        .await?
    };

    let active_job = match thread.active_job_id {
        Some(job_id) => Some(get_job(pool, job_id).await?),
        None => None,
    };

    Ok(ThreadDetailDto {
        thread,
        environments,
        thread_environments,
        active_job,
    })
}

pub async fn mark_thread_environment_status(
    pool: &PgPool,
    thread_id: Uuid,
    environment_id: Uuid,
    workspace_path: &str,
    status: &str,
) -> Result<(), AppError> {
    query(
        r#"
        update thread_environments
        set workspace_path = $3,
            materialization_status = $4,
            updated_at = now()
        where thread_id = $1 and environment_id = $2
        "#,
    )
    .bind(thread_id)
    .bind(environment_id)
    .bind(workspace_path)
    .bind(status)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_thread_ready(pool: &PgPool, thread_id: Uuid) -> Result<(), AppError> {
    query(
        r#"
        update threads
        set status = 'ready', active_job_id = null, updated_at = now()
        where id = $1
        "#,
    )
    .bind(thread_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_thread_running(
    pool: &PgPool,
    thread_id: Uuid,
    job_id: Uuid,
) -> Result<(), AppError> {
    query(
        r#"
        update threads
        set status = 'running', active_job_id = $2, updated_at = now()
        where id = $1
        "#,
    )
    .bind(thread_id)
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_thread_failed(pool: &PgPool, thread_id: Uuid) -> Result<(), AppError> {
    query(
        r#"
        update threads
        set status = 'failed', active_job_id = null, updated_at = now()
        where id = $1
        "#,
    )
    .bind(thread_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_thread_idle(pool: &PgPool, thread_id: Uuid) -> Result<(), AppError> {
    query(
        r#"
        update threads
        set status = 'ready', active_job_id = null, updated_at = now()
        where id = $1
        "#,
    )
    .bind(thread_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_thread_codex_session(
    pool: &PgPool,
    thread_id: Uuid,
    codex_session_id: &str,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;

    query(
        r#"
        update threads
        set codex_session_id = $2, updated_at = now()
        where id = $1
        "#,
    )
    .bind(thread_id)
    .bind(codex_session_id)
    .execute(&mut *tx)
    .await?;

    query(
        r#"
        insert into agent_sessions (id, thread_id, codex_session_id)
        values ($1, $2, $3)
        on conflict (thread_id, codex_session_id)
        do update set last_used_at = now()
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(thread_id)
    .bind(codex_session_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn get_agent_session(
    pool: &PgPool,
    thread_id: Uuid,
) -> Result<Option<AgentSessionRecord>, AppError> {
    Ok(query_as::<_, AgentSessionRecord>(
        r#"
        select id, thread_id, codex_session_id, created_at, last_used_at
        from agent_sessions
        where thread_id = $1
        order by last_used_at desc
        limit 1
        "#,
    )
    .bind(thread_id)
    .fetch_optional(pool)
    .await?)
}

pub async fn list_messages(pool: &PgPool, thread_id: Uuid) -> Result<Vec<MessageRecord>, AppError> {
    Ok(query_as::<_, MessageRecord>(
        r#"
        select id, thread_id, role, content, raw_event_ref, created_at
        from messages
        where thread_id = $1
        order by created_at asc
        "#,
    )
    .bind(thread_id)
    .fetch_all(pool)
    .await?)
}

pub async fn create_message(
    pool: &PgPool,
    thread_id: Uuid,
    role: &str,
    content: &str,
    raw_event_ref: Option<&str>,
) -> Result<MessageRecord, AppError> {
    Ok(query_as::<_, MessageRecord>(
        r#"
        insert into messages (id, thread_id, role, content, raw_event_ref)
        values ($1, $2, $3, $4, $5)
        returning id, thread_id, role, content, raw_event_ref, created_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(thread_id)
    .bind(role)
    .bind(content)
    .bind(raw_event_ref)
    .fetch_one(pool)
    .await?)
}

pub async fn create_job(
    pool: &PgPool,
    kind: JobKind,
    target_type: TargetType,
    target_id: Uuid,
    log_path: &str,
) -> Result<JobRecord, AppError> {
    Ok(query_as::<_, JobRecord>(
        r#"
        insert into jobs (id, kind, target_type, target_id, status, log_path, started_at)
        values ($1, $2, $3, $4, 'pending', $5, now())
        returning id, kind, target_type, target_id, status, log_path, error_json, started_at, finished_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(kind.as_str())
    .bind(target_type.as_str())
    .bind(target_id)
    .bind(log_path)
    .fetch_one(pool)
    .await?)
}

pub async fn get_job(pool: &PgPool, job_id: Uuid) -> Result<JobRecord, AppError> {
    query_as::<_, JobRecord>(
        r#"
        select id, kind, target_type, target_id, status, log_path, error_json, started_at, finished_at
        from jobs
        where id = $1
        "#,
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("job {job_id} not found")))
}

pub async fn mark_job_running(pool: &PgPool, job_id: Uuid) -> Result<JobRecord, AppError> {
    Ok(query_as::<_, JobRecord>(
        r#"
        update jobs
        set status = 'running'
        where id = $1
        returning id, kind, target_type, target_id, status, log_path, error_json, started_at, finished_at
        "#,
    )
    .bind(job_id)
    .fetch_one(pool)
    .await?)
}

pub async fn mark_job_succeeded(pool: &PgPool, job_id: Uuid) -> Result<JobRecord, AppError> {
    Ok(query_as::<_, JobRecord>(
        r#"
        update jobs
        set status = 'succeeded', finished_at = now()
        where id = $1
        returning id, kind, target_type, target_id, status, log_path, error_json, started_at, finished_at
        "#,
    )
    .bind(job_id)
    .fetch_one(pool)
    .await?)
}

pub async fn mark_job_failed(
    pool: &PgPool,
    job_id: Uuid,
    error: &str,
) -> Result<JobRecord, AppError> {
    Ok(query_as::<_, JobRecord>(
        r#"
        update jobs
        set status = 'failed',
            error_json = $2,
            finished_at = now()
        where id = $1
        returning id, kind, target_type, target_id, status, log_path, error_json, started_at, finished_at
        "#,
    )
    .bind(job_id)
    .bind(json!({ "message": error }))
    .fetch_one(pool)
    .await?)
}

fn map_unique(error: sqlx::Error) -> AppError {
    match error {
        sqlx::Error::Database(ref db_error) if db_error.is_unique_violation() => {
            AppError::Conflict(db_error.message().to_owned())
        }
        other => AppError::Internal(other.to_string()),
    }
}
