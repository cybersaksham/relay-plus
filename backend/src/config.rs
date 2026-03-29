use std::{
    env,
    net::{Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
};

use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Debug, Clone)]
pub struct Config {
    pub host: Ipv4Addr,
    pub port: u16,
    pub database_url: String,
    pub project_base_data_directory: PathBuf,
    pub codex_home: PathBuf,
}

#[derive(Debug, Clone)]
pub struct ProjectPaths {
    pub base: PathBuf,
    pub sources: PathBuf,
    pub workspaces: PathBuf,
    pub logs: PathBuf,
    pub codex_home: PathBuf,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let host = env::var("BACKEND_HOST")
            .ok()
            .and_then(|raw| raw.parse().ok())
            .unwrap_or(Ipv4Addr::new(127, 0, 0, 1));
        let port = env::var("BACKEND_PORT")
            .ok()
            .and_then(|raw| raw.parse().ok())
            .unwrap_or(4000);
        let database_url =
            env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?;
        let project_base_data_directory = env::var("PROJECT_BASE_DATA_DIRECTORY")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                let home = env::var("HOME").unwrap_or_else(|_| ".".to_owned());
                Path::new(&home).join(".relay-plus")
            });
        let codex_home = env::var("CODEX_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| project_base_data_directory.join("codex-home"));

        Ok(Self {
            host,
            port,
            database_url,
            project_base_data_directory,
            codex_home,
        })
    }

    pub fn socket_addr(&self) -> SocketAddr {
        SocketAddr::from((self.host, self.port))
    }

    pub fn project_paths(&self) -> ProjectPaths {
        let base = self.project_base_data_directory.clone();
        ProjectPaths {
            sources: base.join("sources"),
            workspaces: base.join("workspaces"),
            logs: base.join("logs"),
            codex_home: self.codex_home.clone(),
            base,
        }
    }

    pub fn init_tracing(&self) {
        let filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("backend=info,tower_http=info,axum=info"));

        tracing_subscriber::registry()
            .with(filter)
            .with(fmt::layer().compact())
            .try_init()
            .ok();
    }
}

impl ProjectPaths {
    pub fn ensure(&self) -> anyhow::Result<()> {
        std::fs::create_dir_all(&self.base)?;
        std::fs::create_dir_all(&self.sources)?;
        std::fs::create_dir_all(&self.workspaces)?;
        std::fs::create_dir_all(&self.logs)?;
        std::fs::create_dir_all(&self.codex_home)?;
        Ok(())
    }

    pub fn environment_source_repo(&self, environment_id: uuid::Uuid) -> PathBuf {
        self.sources.join(environment_id.to_string()).join("repo")
    }

    pub fn thread_workspace_root(&self, thread_id: uuid::Uuid) -> PathBuf {
        self.workspaces.join(thread_id.to_string())
    }

    pub fn thread_environment_workspace(
        &self,
        thread_id: uuid::Uuid,
        environment_slug: &str,
    ) -> PathBuf {
        self.thread_workspace_root(thread_id).join(environment_slug)
    }

    pub fn job_log_path(&self, job_id: uuid::Uuid) -> PathBuf {
        self.logs.join(format!("{job_id}.log"))
    }
}

#[cfg(test)]
mod tests {
    use super::Config;
    use std::path::PathBuf;
    use uuid::Uuid;

    #[test]
    fn builds_expected_paths() {
        let config = Config {
            host: "127.0.0.1".parse().unwrap(),
            port: 4000,
            database_url: "postgres://localhost/relay_plus".to_owned(),
            project_base_data_directory: PathBuf::from("/tmp/relay-plus-test"),
            codex_home: PathBuf::from("/tmp/codex-home"),
        };

        let paths = config.project_paths();
        let environment_id = Uuid::nil();
        let thread_id = Uuid::nil();

        assert_eq!(
            paths.environment_source_repo(environment_id),
            PathBuf::from("/tmp/relay-plus-test/sources/00000000-0000-0000-0000-000000000000/repo")
        );
        assert_eq!(
            paths.thread_environment_workspace(thread_id, "alpha"),
            PathBuf::from(
                "/tmp/relay-plus-test/workspaces/00000000-0000-0000-0000-000000000000/alpha"
            )
        );
    }
}
