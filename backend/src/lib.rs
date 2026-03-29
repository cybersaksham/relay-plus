pub mod config;
pub mod domain;
pub mod error;
pub mod handlers;
pub mod services;
pub mod state;
pub mod store;

use axum::{Router, routing::get};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{config::Config, handlers::health_check, state::AppState};

pub fn build_app(state: AppState, _config: &Config) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .merge(handlers::router())
        .layer(CorsLayer::very_permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
