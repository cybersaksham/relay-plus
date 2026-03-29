use backend::{build_app, config::Config, state::AppState};
use tokio::net::TcpListener;
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let config = Config::from_env()?;
    config.init_tracing();

    let app_state = AppState::bootstrap(config.clone()).await?;
    let app = build_app(app_state, &config);

    let listener = TcpListener::bind(config.socket_addr()).await?;
    info!("relay-plus backend listening on {}", listener.local_addr()?);

    axum::serve(listener, app).await?;

    Ok(())
}
