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

pub fn git_remote_url(book_path: &str) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git remote: {}", e))?;
    if !output.status.success() {
        return Ok(None);
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(Some(url))
}

pub fn git_remote_set_url(book_path: &str, url: &str) -> Result<(), String> {
    // Try set-url first, fall back to add
    let output = Command::new("git")
        .args(["remote", "set-url", "origin", url])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git remote: {}", e))?;
    if !output.status.success() {
        // Remote might not exist yet, try adding
        let output = Command::new("git")
            .args(["remote", "add", "origin", url])
            .current_dir(book_path)
            .output()
            .map_err(|e| format!("Failed to run git remote add: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git remote add failed: {}", stderr));
        }
    }
    Ok(())
}

pub fn git_fetch(book_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["fetch"])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git fetch: {}", e))?;
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(format!("git fetch failed: {}", stderr));
    }
    Ok(stderr)
}

pub fn git_pull(book_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["pull", "--rebase"])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git pull: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(format!("git pull failed: {}", stderr));
    }
    Ok(format!("{}{}", stdout, stderr))
}

pub fn git_push(book_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["push"])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git push: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(format!("git push failed: {}", stderr));
    }
    Ok(format!("{}{}", stdout, stderr))
}

pub fn git_ahead_behind(book_path: &str) -> Result<(u32, u32), String> {
    let output = Command::new("git")
        .args(["rev-list", "--left-right", "--count", "HEAD...origin/main"])
        .current_dir(book_path)
        .output()
        .map_err(|e| format!("Failed to run git rev-list: {}", e))?;
    if !output.status.success() {
        // Try master branch
        let output = Command::new("git")
            .args(["rev-list", "--left-right", "--count", "HEAD...origin/master"])
            .current_dir(book_path)
            .output()
            .map_err(|e| format!("Failed to run git rev-list: {}", e))?;
        if !output.status.success() {
            return Ok((0, 0));
        }
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let parts: Vec<&str> = stdout.trim().split_whitespace().collect();
        if parts.len() >= 2 {
            let ahead: u32 = parts[0].parse().unwrap_or(0);
            let behind: u32 = parts[1].parse().unwrap_or(0);
            return Ok((ahead, behind));
        }
        return Ok((0, 0));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let parts: Vec<&str> = stdout.trim().split_whitespace().collect();
    if parts.len() >= 2 {
        let ahead: u32 = parts[0].parse().unwrap_or(0);
        let behind: u32 = parts[1].parse().unwrap_or(0);
        Ok((ahead, behind))
    } else {
        Ok((0, 0))
    }
}
