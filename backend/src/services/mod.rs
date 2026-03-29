pub mod codex;
pub mod fs;

use serde_json::json;
use uuid::Uuid;

use crate::{state::AppState, store};

pub fn spawn_environment_create(state: AppState, environment_id: Uuid, job_id: Uuid) {
    tokio::spawn(async move {
        if let Err(error) = sync_environment(state.clone(), environment_id, job_id, false).await {
            let _ = store::mark_environment_failed(state.pool(), environment_id).await;
            let _ = store::mark_job_failed(state.pool(), job_id, &error.to_string()).await;
        }
    });
}

pub fn spawn_environment_refresh(state: AppState, environment_id: Uuid, job_id: Uuid) {
    tokio::spawn(async move {
        if let Err(error) = sync_environment(state.clone(), environment_id, job_id, true).await {
            let _ = store::mark_environment_failed(state.pool(), environment_id).await;
            let _ = store::mark_job_failed(state.pool(), job_id, &error.to_string()).await;
        }
    });
}

pub fn spawn_thread_prepare(
    state: AppState,
    thread_id: Uuid,
    job_id: Uuid,
    environment_ids: Vec<Uuid>,
) {
    tokio::spawn(async move {
        if let Err(error) =
            prepare_thread_workspace(state.clone(), thread_id, job_id, environment_ids).await
        {
            let _ = store::mark_thread_failed(state.pool(), thread_id).await;
            let _ = store::mark_job_failed(state.pool(), job_id, &error.to_string()).await;
            state.broadcast(
                "thread.prepare.failed",
                Some(thread_id),
                Some(job_id),
                json!({ "message": error.to_string() }),
            );
        }
    });
}

pub fn spawn_message_run(
    state: AppState,
    thread_id: Uuid,
    job_id: Uuid,
    _user_message_id: Uuid,
    prompt: String,
) {
    tokio::spawn(async move {
        if let Err(error) = run_message(state.clone(), thread_id, job_id, prompt).await {
            let _ = store::mark_thread_idle(state.pool(), thread_id).await;
            let _ = store::mark_job_failed(state.pool(), job_id, &error.to_string()).await;
            state.broadcast(
                "thread.run.failed",
                Some(thread_id),
                Some(job_id),
                json!({ "message": error.to_string() }),
            );
        }
    });
}

async fn sync_environment(
    state: AppState,
    environment_id: Uuid,
    job_id: Uuid,
    refresh: bool,
) -> anyhow::Result<()> {
    let environment = store::get_environment(state.pool(), environment_id).await?;
    let previous_commit = environment.last_synced_commit.clone();
    let log_path = state.log_path(job_id);

    store::mark_job_running(state.pool(), job_id).await?;
    store::mark_environment_running(state.pool(), environment_id, job_id).await?;
    state.broadcast(
        if refresh {
            "environment.refresh.started"
        } else {
            "environment.create.started"
        },
        None,
        Some(job_id),
        json!({ "environmentId": environment_id }),
    );

    let repo_path = state.paths().environment_source_repo(environment_id);
    if refresh {
        fs::git_pull(&repo_path, &log_path).await?;
    } else {
        if repo_path.exists() {
            tokio::fs::remove_dir_all(&repo_path).await.ok();
        }
        fs::git_clone(&environment.git_ssh_url, &repo_path, &log_path).await?;
    }

    fs::run_shell_script(
        "setup",
        &environment.setup_script,
        &repo_path,
        &log_path,
        &[
            (
                "PROJECT_BASE_DATA_DIRECTORY",
                state.paths().base.display().to_string(),
            ),
            ("RELAY_PLUS_ENVIRONMENT_ID", environment_id.to_string()),
        ],
    )
    .await?;

    let commit = fs::git_current_commit(&repo_path).await?;
    store::mark_environment_ready(
        state.pool(),
        environment_id,
        &repo_path.display().to_string(),
        &commit,
    )
    .await?;
    store::insert_environment_sync(
        state.pool(),
        environment_id,
        job_id,
        "succeeded",
        previous_commit.as_deref(),
        Some(&commit),
    )
    .await?;
    store::mark_job_succeeded(state.pool(), job_id).await?;

    state.broadcast(
        if refresh {
            "environment.refresh.succeeded"
        } else {
            "environment.create.succeeded"
        },
        None,
        Some(job_id),
        json!({ "environmentId": environment_id, "commit": commit }),
    );

    Ok(())
}

async fn prepare_thread_workspace(
    state: AppState,
    thread_id: Uuid,
    job_id: Uuid,
    environment_ids: Vec<Uuid>,
) -> anyhow::Result<()> {
    let log_path = state.log_path(job_id);
    store::mark_job_running(state.pool(), job_id).await?;
    state.broadcast(
        "thread.prepare.started",
        Some(thread_id),
        Some(job_id),
        json!({ "threadId": thread_id }),
    );

    let workspace_root = state.paths().thread_workspace_root(thread_id);
    tokio::fs::create_dir_all(&workspace_root).await?;

    for environment_id in environment_ids {
        let environment = store::get_environment(state.pool(), environment_id).await?;
        if environment.status != "ready" {
            anyhow::bail!("environment {} is not ready", environment.name);
        }

        let destination = state
            .paths()
            .thread_environment_workspace(thread_id, &environment.slug);

        if destination.exists() {
            tokio::fs::remove_dir_all(&destination).await.ok();
        }
        fs::copy_recursively(&environment.source_path, &destination).await?;
        store::mark_thread_environment_status(
            state.pool(),
            thread_id,
            environment_id,
            &destination.display().to_string(),
            "copying",
        )
        .await?;

        fs::run_shell_script(
            "workspace",
            &environment.workspace_script,
            &destination,
            &log_path,
            &[
                (
                    "PROJECT_BASE_DATA_DIRECTORY",
                    state.paths().base.display().to_string(),
                ),
                ("RELAY_PLUS_THREAD_ID", thread_id.to_string()),
                ("RELAY_PLUS_ENVIRONMENT_ID", environment_id.to_string()),
            ],
        )
        .await?;

        store::mark_thread_environment_status(
            state.pool(),
            thread_id,
            environment_id,
            &destination.display().to_string(),
            "ready",
        )
        .await?;
        state.broadcast(
            "thread.prepare.environment.ready",
            Some(thread_id),
            Some(job_id),
            json!({
                "threadId": thread_id,
                "environmentId": environment_id,
                "workspacePath": destination.display().to_string(),
            }),
        );
    }

    store::mark_thread_ready(state.pool(), thread_id).await?;
    store::mark_job_succeeded(state.pool(), job_id).await?;
    state.broadcast(
        "thread.prepare.succeeded",
        Some(thread_id),
        Some(job_id),
        json!({
            "threadId": thread_id,
            "workspaceRoot": workspace_root.display().to_string(),
        }),
    );

    Ok(())
}

async fn run_message(
    state: AppState,
    thread_id: Uuid,
    job_id: Uuid,
    prompt: String,
) -> anyhow::Result<()> {
    let lock = state.thread_lock(thread_id);
    let _guard = lock.lock().await;

    let thread = store::get_thread(state.pool(), thread_id).await?;
    let session = match thread.codex_session_id.clone() {
        Some(session_id) => Some(session_id),
        None => store::get_agent_session(state.pool(), thread_id)
            .await?
            .map(|item| item.codex_session_id),
    };
    let log_path = state.log_path(job_id);

    store::mark_job_running(state.pool(), job_id).await?;
    store::mark_thread_running(state.pool(), thread_id, job_id).await?;
    state.broadcast(
        "thread.run.started",
        Some(thread_id),
        Some(job_id),
        json!({ "threadId": thread_id, "jobId": job_id }),
    );

    let mut assistant_text = String::new();
    let result = codex::CodexRunner::new(state.paths().codex_home.clone())
        .run_turn(
            &thread.workspace_root,
            session.as_deref(),
            &prompt,
            &log_path,
            |parsed| {
                let assistant_delta = parsed.assistant_delta.clone();
                if let Some(delta) = assistant_delta.as_ref() {
                    assistant_text.push_str(&delta);
                }
                state.broadcast(
                    parsed.event_name,
                    Some(thread_id),
                    Some(job_id),
                    json!({
                        "assistantDelta": assistant_delta,
                        "raw": parsed.payload,
                    }),
                );
            },
        )
        .await?;

    let final_text = if assistant_text.trim().is_empty() {
        result.assistant_text
    } else {
        assistant_text
    };
    if let Some(session_id) = result.session_id {
        store::update_thread_codex_session(state.pool(), thread_id, &session_id).await?;
    }
    if !final_text.trim().is_empty() {
        let message = store::create_message(
            state.pool(),
            thread_id,
            "assistant",
            final_text.trim(),
            Some(&log_path.display().to_string()),
        )
        .await?;
        state.broadcast(
            "assistant.message.created",
            Some(thread_id),
            Some(job_id),
            json!({ "message": message }),
        );
    }

    store::mark_thread_idle(state.pool(), thread_id).await?;
    store::mark_job_succeeded(state.pool(), job_id).await?;
    state.broadcast(
        "thread.run.succeeded",
        Some(thread_id),
        Some(job_id),
        json!({ "threadId": thread_id, "jobId": job_id }),
    );

    Ok(())
}
