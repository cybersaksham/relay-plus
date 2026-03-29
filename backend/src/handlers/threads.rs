use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
};
use futures::{Stream, stream};
use serde_json::json;
use tokio_stream::{StreamExt, wrappers::BroadcastStream};
use uuid::Uuid;

use crate::{
    domain::{
        CreateThreadInput, MutationResponse, SendMessageInput, TargetType,
        ThreadMessageMutationResponse,
    },
    error::AppError,
    services,
    state::AppState,
    store,
};

pub async fn list_threads(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<Vec<crate::domain::ThreadRecord>>, AppError> {
    store::get_organization(state.pool(), organization_id).await?;
    Ok(Json(
        store::list_threads(state.pool(), organization_id).await?,
    ))
}

pub async fn create_thread(
    State(state): State<AppState>,
    Json(payload): Json<CreateThreadInput>,
) -> Result<
    (
        StatusCode,
        Json<MutationResponse<crate::domain::ThreadRecord>>,
    ),
    AppError,
> {
    if payload.title.trim().is_empty() {
        return Err(AppError::BadRequest("thread title is required".to_owned()));
    }
    if payload.environment_ids.is_empty() {
        return Err(AppError::BadRequest(
            "select at least one environment".to_owned(),
        ));
    }

    store::get_organization(state.pool(), payload.organization_id).await?;
    for environment_id in &payload.environment_ids {
        let environment = store::get_environment(state.pool(), *environment_id).await?;
        if environment.organization_id != payload.organization_id {
            return Err(AppError::BadRequest(
                "all selected environments must belong to the same organization".to_owned(),
            ));
        }
    }

    let thread_id = Uuid::new_v4();
    let job_id = Uuid::new_v4();
    let workspace_root = state.paths().thread_workspace_root(thread_id);
    let log_path = state.log_path(job_id);
    let job = store::create_job(
        state.pool(),
        crate::domain::JobKind::ThreadPrepare,
        TargetType::Thread,
        thread_id,
        &log_path.display().to_string(),
    )
    .await?;
    let thread = store::create_thread(
        state.pool(),
        thread_id,
        &payload,
        &workspace_root.display().to_string(),
        job.id,
    )
    .await?;

    services::spawn_thread_prepare(state.clone(), thread.id, job.id, payload.environment_ids);

    Ok((
        StatusCode::ACCEPTED,
        Json(MutationResponse {
            data: store::get_thread(state.pool(), thread.id).await?,
            job: Some(store::get_job(state.pool(), job.id).await?),
        }),
    ))
}

pub async fn get_thread(
    State(state): State<AppState>,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<crate::domain::ThreadDetailDto>, AppError> {
    Ok(Json(
        store::get_thread_detail(state.pool(), thread_id).await?,
    ))
}

pub async fn list_messages(
    State(state): State<AppState>,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<Vec<crate::domain::MessageRecord>>, AppError> {
    store::get_thread(state.pool(), thread_id).await?;
    Ok(Json(store::list_messages(state.pool(), thread_id).await?))
}

pub async fn send_message(
    State(state): State<AppState>,
    Path(thread_id): Path<Uuid>,
    Json(payload): Json<SendMessageInput>,
) -> Result<(StatusCode, Json<ThreadMessageMutationResponse>), AppError> {
    if payload.content.trim().is_empty() {
        return Err(AppError::BadRequest(
            "message content is required".to_owned(),
        ));
    }

    let thread = store::get_thread(state.pool(), thread_id).await?;
    if !matches!(thread.status.as_str(), "ready" | "running") {
        return Err(AppError::Conflict(
            "thread is not ready to accept messages yet".to_owned(),
        ));
    }

    let user_message = store::create_message(
        state.pool(),
        thread_id,
        "user",
        payload.content.trim(),
        None,
    )
    .await?;
    let job_id = Uuid::new_v4();
    let log_path = state.log_path(job_id);
    let job = store::create_job(
        state.pool(),
        crate::domain::JobKind::MessageRun,
        TargetType::Thread,
        thread_id,
        &log_path.display().to_string(),
    )
    .await?;

    services::spawn_message_run(
        state.clone(),
        thread_id,
        job.id,
        user_message.id,
        payload.content.trim().to_owned(),
    );

    Ok((
        StatusCode::ACCEPTED,
        Json(ThreadMessageMutationResponse {
            user_message,
            job: store::get_job(state.pool(), job.id).await?,
        }),
    ))
}

pub async fn thread_stream(
    State(state): State<AppState>,
    Path(thread_id): Path<Uuid>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, AppError> {
    store::get_thread(state.pool(), thread_id).await?;

    let receiver = state.subscribe();
    let stream = BroadcastStream::new(receiver).filter_map(move |event| match event {
        Ok(payload) if payload.thread_id == Some(thread_id) => Some(Ok(Event::default()
            .event("relay-event")
            .data(serde_json::to_string(&payload).unwrap_or_else(|_| {
                json!({ "eventType": "stream.serialization_error" }).to_string()
            })))),
        _ => None,
    });

    let bootstrap = stream::once(async move {
        Ok(Event::default().event("relay-event").data(
            json!({
                "eventType": "stream.connected",
                "threadId": thread_id,
            })
            .to_string(),
        ))
    });

    Ok(Sse::new(bootstrap.chain(stream)).keep_alive(KeepAlive::default()))
}
