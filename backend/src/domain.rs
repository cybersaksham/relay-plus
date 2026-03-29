use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Copy)]
pub enum JobKind {
    EnvironmentCreate,
    EnvironmentRefresh,
    ThreadPrepare,
    MessageRun,
}

impl JobKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::EnvironmentCreate => "environment_create",
            Self::EnvironmentRefresh => "environment_refresh",
            Self::ThreadPrepare => "thread_prepare",
            Self::MessageRun => "message_run",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TargetType {
    Environment,
    Thread,
}

impl TargetType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Environment => "environment",
            Self::Thread => "thread",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppEvent {
    pub event_type: String,
    pub thread_id: Option<Uuid>,
    pub job_id: Option<Uuid>,
    pub data: Value,
    pub emitted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationRecord {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub slug: String,
    pub git_ssh_url: String,
    pub setup_script: String,
    pub workspace_script: String,
    pub source_path: String,
    pub status: String,
    pub last_synced_commit: Option<String>,
    pub last_sync_at: Option<DateTime<Utc>>,
    pub active_job_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub title: String,
    pub workspace_root: String,
    pub status: String,
    pub codex_session_id: Option<String>,
    pub active_job_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ThreadEnvironmentRecord {
    pub thread_id: Uuid,
    pub environment_id: Uuid,
    pub workspace_path: String,
    pub materialization_status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    pub id: Uuid,
    pub thread_id: Uuid,
    pub role: String,
    pub content: String,
    pub raw_event_ref: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRecord {
    pub id: Uuid,
    pub thread_id: Uuid,
    pub codex_session_id: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: Uuid,
    pub kind: String,
    pub target_type: String,
    pub target_id: Uuid,
    pub status: String,
    pub log_path: String,
    pub error_json: Option<Value>,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResponse<T> {
    pub data: T,
    pub job: Option<JobRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDetailDto {
    pub thread: ThreadRecord,
    pub environments: Vec<EnvironmentRecord>,
    pub thread_environments: Vec<ThreadEnvironmentRecord>,
    pub active_job: Option<JobRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageMutationResponse {
    pub user_message: MessageRecord,
    pub job: JobRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOrganizationInput {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOrganizationInput {
    pub name: Option<String>,
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEnvironmentInput {
    pub name: String,
    pub git_ssh_url: String,
    pub setup_script: String,
    pub workspace_script: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateThreadInput {
    pub organization_id: Uuid,
    pub title: String,
    pub environment_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub content: String,
}

pub fn slugify(input: &str) -> String {
    let mut slug = String::with_capacity(input.len());
    let mut last_dash = false;

    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }

    slug.trim_matches('-').to_owned()
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugifies_names() {
        assert_eq!(slugify("My Primary Repo"), "my-primary-repo");
        assert_eq!(slugify("alpha___beta"), "alpha-beta");
    }
}
