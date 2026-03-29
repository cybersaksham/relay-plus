mod environments;
mod organizations;
mod threads;

use axum::{
    Json, Router,
    routing::{get, patch, post},
};
use serde_json::json;

use crate::state::AppState;

pub use environments::{create_environment, get_job, list_environments, refresh_environment};
pub use organizations::{create_organization, list_organizations, update_organization};
pub use threads::{
    create_thread, get_thread, list_messages, list_threads, send_message, thread_stream,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/organizations",
            get(list_organizations).post(create_organization),
        )
        .route("/organizations/{id}", patch(update_organization))
        .route(
            "/organizations/{id}/environments",
            get(list_environments).post(create_environment),
        )
        .route("/environments/{id}/refresh", post(refresh_environment))
        .route("/organizations/{id}/threads", get(list_threads))
        .route("/threads", post(create_thread))
        .route("/threads/{id}", get(get_thread))
        .route(
            "/threads/{id}/messages",
            get(list_messages).post(send_message),
        )
        .route("/threads/{id}/stream", get(thread_stream))
        .route("/jobs/{id}", get(get_job))
}

pub async fn health_check() -> Json<serde_json::Value> {
    Json(json!({ "ok": true }))
}
