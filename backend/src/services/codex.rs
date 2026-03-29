use std::{
    fs::OpenOptions,
    path::{Path, PathBuf},
    process::Stdio,
};

use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};

use super::fs::append_line;

pub struct CodexRunner {
    codex_home: PathBuf,
}

pub struct CodexTurnResult {
    pub session_id: Option<String>,
    pub assistant_text: String,
}

pub struct ParsedCodexEvent {
    pub event_name: String,
    pub payload: Value,
    pub assistant_delta: Option<String>,
}

#[derive(Default)]
struct Extraction {
    session_id: Option<String>,
    delta: Option<String>,
    full_text: Option<String>,
}

impl CodexRunner {
    pub fn new(codex_home: PathBuf) -> Self {
        Self { codex_home }
    }

    pub async fn run_turn<F>(
        &self,
        workspace_root: &str,
        session_id: Option<&str>,
        prompt: &str,
        log_path: &Path,
        mut on_event: F,
    ) -> anyhow::Result<CodexTurnResult>
    where
        F: FnMut(ParsedCodexEvent),
    {
        let mut command = Command::new("codex");
        command.env("CODEX_HOME", &self.codex_home);
        command.arg("exec");
        command
            .arg("--json")
            .arg("--skip-git-repo-check")
            .arg("-C")
            .arg(workspace_root)
            .arg("-s")
            .arg("workspace-write")
            .arg("-c")
            .arg("approval_policy=\"never\"");

        if let Some(session_id) = session_id {
            command.arg("resume").arg(session_id);
        }

        command.arg(prompt).stdout(Stdio::piped()).stderr(Stdio::piped());

        if let Some(parent) = log_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        append_line(
            log_path,
            &format!("\n== codex turn ==\n$ {:?}\n", command.as_std()),
        )?;

        let mut child = command.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("missing codex stdout"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("missing codex stderr"))?;
        let stderr_log = log_path.to_path_buf();
        let stdout_log = log_path.to_path_buf();

        let stderr_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Some(line) = reader.next_line().await? {
                append_line(&stderr_log, &format!("[stderr] {line}\n"))?;
            }
            Ok::<(), anyhow::Error>(())
        });

        let mut reader = BufReader::new(stdout).lines();
        let mut captured_session_id = session_id.map(ToOwned::to_owned);
        let mut assistant_text = String::new();
        let mut fallback_message = None;
        let mut raw_log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&stdout_log)?;

        use std::io::Write;

        while let Some(line) = reader.next_line().await? {
            writeln!(raw_log, "{line}")?;
            if let Ok(payload) = serde_json::from_str::<Value>(&line) {
                let extracted = extract_fields(&payload);
                if captured_session_id.is_none() {
                    captured_session_id = extracted.session_id;
                }
                if let Some(delta) = extracted.delta.clone() {
                    assistant_text.push_str(&delta);
                }
                if let Some(full_text) = extracted.full_text.clone() {
                    fallback_message = Some(full_text);
                }

                on_event(ParsedCodexEvent {
                    event_name: payload
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or("codex.event")
                        .to_owned(),
                    payload,
                    assistant_delta: extracted.delta,
                });
            } else {
                on_event(ParsedCodexEvent {
                    event_name: "codex.raw".to_owned(),
                    payload: json!({ "line": line }),
                    assistant_delta: None,
                });
            }
        }

        let status = child.wait().await?;
        stderr_task.await??;
        if !status.success() {
            anyhow::bail!("codex exited with status {}", status);
        }

        Ok(CodexTurnResult {
            session_id: captured_session_id,
            assistant_text: if assistant_text.trim().is_empty() {
                fallback_message.unwrap_or_default()
            } else {
                assistant_text
            },
        })
    }
}

fn extract_fields(payload: &Value) -> Extraction {
    let mut extraction = Extraction::default();

    if let Some(thread_id) = payload.get("thread_id").and_then(Value::as_str) {
        extraction.session_id = Some(thread_id.to_owned());
    }
    if extraction.session_id.is_none() {
        extraction.session_id = find_string(
            payload,
            &["thread_id", "threadId", "session_id", "sessionId"],
        );
    }

    let event_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if event_type.contains("delta") {
        extraction.delta = find_string(payload, &["delta", "text"]);
    } else if event_type.contains("message") || event_type.contains("response") {
        extraction.full_text = find_string(payload, &["text", "content", "message"]);
    } else if matches_agent_message_completion(payload) {
        extraction.full_text = find_string(payload, &["text", "content", "message"]);
    }

    extraction
}

fn matches_agent_message_completion(payload: &Value) -> bool {
    payload
        .get("type")
        .and_then(Value::as_str)
        .map(|value| value == "item.completed")
        .unwrap_or(false)
        && payload
            .get("item")
            .and_then(|item| item.get("type"))
            .and_then(Value::as_str)
            .map(|value| value == "agent_message")
            .unwrap_or(false)
}

fn find_string(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(value) = map.get(*key).and_then(Value::as_str) {
                    if !value.trim().is_empty() {
                        return Some(value.to_owned());
                    }
                }
            }

            for value in map.values() {
                if let Some(found) = find_string(value, keys) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(values) => values.iter().find_map(|item| find_string(item, keys)),
        _ => None,
    }
}
