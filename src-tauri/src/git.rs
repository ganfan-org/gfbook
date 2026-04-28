use std::process::Command;

use crate::models::CommitInfo;

pub fn git_init(book_path: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["init"])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git init: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git init failed: {}", stderr));
    }
    Ok(())
}

pub fn git_status(book_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout.trim().to_string())
}

pub fn git_add_all(book_path: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["add", "."])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git add failed: {}", stderr));
    }
    Ok(())
}

pub fn git_commit(book_path: &str, message: &str) -> Result<(), String> {
    git_add_all(book_path)?;
    let output = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git commit: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git commit failed: {}", stderr));
    }
    Ok(())
}

pub fn git_log(book_path: &str, max_count: u32) -> Result<Vec<CommitInfo>, String> {
    let output = Command::new("git")
        .args([
            "log",
            &format!("--max-count={}", max_count),
            "--format=%H|||%s|||%an|||%ct",
        ])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;
    if !output.status.success() {
        return Ok(vec![]);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits = stdout
        .trim()
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split("|||").collect();
            if parts.len() < 4 {
                return None;
            }
            Some(CommitInfo {
                hash: parts[0].to_string(),
                message: parts[1].to_string(),
                author: parts[2].to_string(),
                timestamp: parts[3].parse().unwrap_or(0),
            })
        })
        .collect();
    Ok(commits)
}

#[allow(dead_code)]
pub fn is_git_repo(book_path: &str) -> bool {
    Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(book_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
