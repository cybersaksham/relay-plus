use std::{path::PathBuf, sync::Arc};

use chrono::Utc;
use dashmap::DashMap;
use serde_json::Value;
use sqlx::{PgPool, migrate::Migrator, postgres::PgPoolOptions};
use tokio::sync::{Mutex, broadcast};
use uuid::Uuid;

use crate::{
    config::{Config, ProjectPaths},
    domain::AppEvent,
};

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    pub config: Config,
    pub paths: ProjectPaths,
    pub pool: PgPool,
    pub events: broadcast::Sender<AppEvent>,
    pub thread_locks: DashMap<Uuid, Arc<Mutex<()>>>,
}

impl AppState {
    pub async fn bootstrap(config: Config) -> anyhow::Result<Self> {
        let paths = config.project_paths();
        paths.ensure()?;

        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(&config.database_url)
            .await?;

        MIGRATOR.run(&pool).await?;

        let (events, _) = broadcast::channel(1024);

        Ok(Self {
            inner: Arc::new(AppStateInner {
                config,
                paths,
                pool,
                events,
                thread_locks: DashMap::new(),
            }),
        })
    }

    pub fn config(&self) -> &Config {
        &self.inner.config
    }

    pub fn paths(&self) -> &ProjectPaths {
        &self.inner.paths
    }

    pub fn pool(&self) -> &PgPool {
        &self.inner.pool
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AppEvent> {
        self.inner.events.subscribe()
    }

    pub fn broadcast(
        &self,
        event_type: impl Into<String>,
        thread_id: Option<Uuid>,
        job_id: Option<Uuid>,
        data: Value,
    ) {
        let _ = self.inner.events.send(AppEvent {
            event_type: event_type.into(),
            thread_id,
            job_id,
            data,
            emitted_at: Utc::now(),
        });
    }

    pub fn thread_lock(&self, thread_id: Uuid) -> Arc<Mutex<()>> {
        self.inner
            .thread_locks
            .entry(thread_id)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    pub fn log_path(&self, job_id: Uuid) -> PathBuf {
        self.paths().job_log_path(job_id)
    }
}
