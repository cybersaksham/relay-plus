use std::{ffi::OsString, fs::OpenOptions, path::Path, process::Stdio};

use tokio::{fs, process::Command};
use walkdir::WalkDir;

pub async fn git_clone(url: &str, destination: &Path, log_path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).await?;
    }
    let mut command = Command::new("git");
    command
        .arg("clone")
        .arg(url)
        .arg(destination)
        .current_dir(destination.parent().unwrap());
    run_command(command, log_path).await
}

pub async fn git_pull(repo_path: &Path, log_path: &Path) -> anyhow::Result<()> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(repo_path)
        .arg("pull")
        .arg("--ff-only");
    run_command(command, log_path).await
}

pub async fn git_current_commit(repo_path: &Path) -> anyhow::Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("rev-parse")
        .arg("HEAD")
        .output()
        .await?;

    if !output.status.success() {
        anyhow::bail!("git rev-parse failed");
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

pub async fn run_shell_script(
    label: &str,
    script: &str,
    working_directory: &Path,
    log_path: &Path,
    extra_env: &[(&str, String)],
) -> anyhow::Result<()> {
    if script.trim().is_empty() {
        return Ok(());
    }

    append_line(log_path, &format!("\n== {} script ==\n{}\n", label, script))?;

    let mut command = Command::new("sh");
    command
        .arg("-lc")
        .arg(script)
        .current_dir(working_directory);
    for (key, value) in extra_env {
        command.env(key, value);
    }

    run_command(command, log_path).await
}

pub async fn copy_recursively(
    source: impl AsRef<Path>,
    destination: impl AsRef<Path>,
) -> anyhow::Result<()> {
    let source = source.as_ref().to_path_buf();
    let destination = destination.as_ref().to_path_buf();
    tokio::task::spawn_blocking(move || copy_recursively_blocking(&source, &destination)).await??;
    Ok(())
}

fn copy_recursively_blocking(source: &Path, destination: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(destination)?;

    for entry in WalkDir::new(source).follow_links(false) {
        let entry = entry?;
        let path = entry.path();
        let relative = path.strip_prefix(source)?;
        let target = destination.join(relative);

        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target)?;
            continue;
        }

        if entry.file_type().is_symlink() {
            let link_target = std::fs::read_link(path)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(link_target, &target)?;
            continue;
        }

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(path, target)?;
    }

    Ok(())
}

pub fn append_line(log_path: &Path, line: &str) -> anyhow::Result<()> {
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;
    use std::io::Write;
    file.write_all(line.as_bytes())?;
    Ok(())
}

pub async fn run_command(mut command: Command, log_path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;
    let stderr = stdout.try_clone()?;
    command
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    let rendered: OsString = command.as_std().get_program().to_owned();
    append_line(
        log_path,
        &format!(
            "$ {:?} {:?}\n",
            rendered,
            command.as_std().get_args().collect::<Vec<_>>()
        ),
    )?;

    let status = command.spawn()?.wait().await?;
    if !status.success() {
        anyhow::bail!("command failed with status {}", status);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::copy_recursively_blocking;

    #[test]
    fn copies_nested_workspaces() {
        let source = TempDir::new().unwrap();
        let destination = TempDir::new().unwrap();

        fs::create_dir_all(source.path().join("nested")).unwrap();
        fs::write(source.path().join("nested/file.txt"), "hello").unwrap();

        copy_recursively_blocking(source.path(), &destination.path().join("copy")).unwrap();

        assert_eq!(
            fs::read_to_string(destination.path().join("copy/nested/file.txt")).unwrap(),
            "hello"
        );
    }
}
