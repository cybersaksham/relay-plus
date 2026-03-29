use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

use crate::{
    domain::{CreateOrganizationInput, OrganizationRecord, UpdateOrganizationInput},
    error::AppError,
    state::AppState,
    store,
};

pub async fn list_organizations(
    State(state): State<AppState>,
) -> Result<Json<Vec<OrganizationRecord>>, AppError> {
    Ok(Json(store::list_organizations(state.pool()).await?))
}

pub async fn create_organization(
    State(state): State<AppState>,
    Json(payload): Json<CreateOrganizationInput>,
) -> Result<Json<OrganizationRecord>, AppError> {
    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest(
            "organization name is required".to_owned(),
        ));
    }

    Ok(Json(
        store::create_organization(
            state.pool(),
            CreateOrganizationInput {
                name: payload.name.trim().to_owned(),
            },
        )
        .await?,
    ))
}

pub async fn update_organization(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
    Json(payload): Json<UpdateOrganizationInput>,
) -> Result<Json<OrganizationRecord>, AppError> {
    if let Some(name) = payload.name.as_ref() {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest(
                "organization name cannot be empty".to_owned(),
            ));
        }
    }

    Ok(Json(
        store::update_organization(
            state.pool(),
            organization_id,
            UpdateOrganizationInput {
                name: payload.name.map(|item| item.trim().to_owned()),
                archived: payload.archived,
            },
        )
        .await?,
    ))
}
