use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    domain::{CreateEnvironmentInput, MutationResponse, TargetType, slugify},
    error::AppError,
    services,
    state::AppState,
    store,
};

pub async fn list_environments(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<Vec<crate::domain::EnvironmentRecord>>, AppError> {
    store::get_organization(state.pool(), organization_id).await?;
    Ok(Json(
        store::list_environments(state.pool(), organization_id).await?,
    ))
}

pub async fn create_environment(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
    Json(payload): Json<CreateEnvironmentInput>,
) -> Result<
    (
        StatusCode,
        Json<MutationResponse<crate::domain::EnvironmentRecord>>,
    ),
    AppError,
> {
    store::get_organization(state.pool(), organization_id).await?;

    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest(
            "environment name is required".to_owned(),
        ));
    }
    if payload.git_ssh_url.trim().is_empty() {
        return Err(AppError::BadRequest("git SSH URL is required".to_owned()));
    }

    let slug = slugify(&payload.name);
    if slug.is_empty() {
        return Err(AppError::BadRequest(
            "environment name must contain letters or numbers".to_owned(),
        ));
    }

    let environment_id = Uuid::new_v4();
    let job_id = Uuid::new_v4();
    let log_path = state.log_path(job_id);
    let source_path = state.paths().environment_source_repo(environment_id);
    let job = store::create_job(
        state.pool(),
        crate::domain::JobKind::EnvironmentCreate,
        TargetType::Environment,
        environment_id,
        &log_path.display().to_string(),
    )
    .await?;
    let environment = store::create_environment(
        state.pool(),
        environment_id,
        organization_id,
        &payload,
        &slug,
        &source_path.display().to_string(),
        job.id,
    )
    .await?;

    services::spawn_environment_create(state.clone(), environment.id, job.id);

    Ok((
        StatusCode::ACCEPTED,
        Json(MutationResponse {
            data: store::get_environment(state.pool(), environment.id).await?,
            job: Some(job),
        }),
    ))
}

pub async fn refresh_environment(
    State(state): State<AppState>,
    Path(environment_id): Path<Uuid>,
) -> Result<
    (
        StatusCode,
        Json<MutationResponse<crate::domain::EnvironmentRecord>>,
    ),
    AppError,
> {
    let environment = store::get_environment(state.pool(), environment_id).await?;
    let job_id = Uuid::new_v4();
    let log_path = state.log_path(job_id);
    let job = store::create_job(
        state.pool(),
        crate::domain::JobKind::EnvironmentRefresh,
        TargetType::Environment,
        environment.id,
        &log_path.display().to_string(),
    )
    .await?;
    store::mark_environment_running(state.pool(), environment.id, job.id).await?;

    services::spawn_environment_refresh(state.clone(), environment.id, job.id);

    Ok((
        StatusCode::ACCEPTED,
        Json(MutationResponse {
            data: store::get_environment(state.pool(), environment.id).await?,
            job: Some(store::get_job(state.pool(), job.id).await?),
        }),
    ))
}

pub async fn get_job(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<crate::domain::JobRecord>, AppError> {
    Ok(Json(store::get_job(state.pool(), job_id).await?))
}
