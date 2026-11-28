use std::path::Path;

use git2::{
    build::CheckoutBuilder, ConfigLevel, Cred, DiffFormat, DiffOptions, ErrorCode, FetchOptions, PushOptions,
    RemoteCallbacks, Repository, Signature,
};

use crate::error::AppError;
use crate::models::{BookIdentity, CommitInfo, FileDiff, RepoFileStatus, RepoState, RepoSummary};

// ═══════════════════════════════════════════
// 仓库基础
// ═══════════════════════════════════════════

pub fn git_init(book_path: &str) -> Result<(), AppError> {
    Repository::init(book_path)
        .map(|_| ())
        .map_err(|e| git_error("Failed to init Git repo", e))
}

/// 为书籍启用版本管理：初始化仓库并用当前生效身份创建初始提交。
/// 没有任何可用身份时返回 `E_NO_IDENTITY`，不会留下没有提交的半成品仓库。
/// 返回 `true` 表示本次新建了仓库或初始提交。
pub fn enable_version_control(book_path: &str) -> Result<bool, AppError> {
    let no_identity = || {
        AppError::new(
            "E_NO_IDENTITY",
            "Set a Git user name and email before enabling version control",
        )
    };

    if !is_repo(book_path) {
        if global_identity().is_none() {
            return Err(no_identity());
        }
        git_init(book_path)?;
        git_commit(book_path, "chore: enable version control")?;
        return Ok(true);
    }

    let repo = open_repo(book_path)?;
    let has_commit = repo.head().ok().and_then(|head| head.peel_to_commit().ok()).is_some();
    if has_commit {
        return Ok(false);
    }
    if !initial_commit_if_identity(book_path, "chore: enable version control")? {
        return Err(no_identity());
    }
    Ok(true)
}

pub fn is_repo(book_path: &str) -> bool {
    Repository::open(book_path).is_ok()
}

fn open_repo(book_path: &str) -> Result<Repository, AppError> {
    Repository::open(book_path).map_err(|e| {
        if e.code() == ErrorCode::NotFound {
            AppError::new("E_NO_REPO", "This book is not a Git repository")
        } else {
            git_error("Failed to open Git repo", e)
        }
    })
}

fn git_error(context: &str, error: git2::Error) -> AppError {
    let code = match error.code() {
        ErrorCode::NotFound => "E_NOT_FOUND",
        ErrorCode::Auth => "E_AUTH",
        ErrorCode::NotFastForward => "E_NOT_FAST_FORWARD",
        ErrorCode::MergeConflict | ErrorCode::Conflict | ErrorCode::Unmerged => "E_CONFLICT",
        ErrorCode::BareRepo => "E_BARE_REPO",
        ErrorCode::UnbornBranch => "E_UNBORN_BRANCH",
        ErrorCode::InvalidSpec => "E_INVALID_SPEC",
        ErrorCode::Locked => "E_LOCKED",
        ErrorCode::Timeout => "E_TIMEOUT",
        _ => "E_GIT",
    };
    AppError::new(code, context).with_detail(error.message().to_string())
}

fn current_branch(repo: &Repository) -> Option<String> {
    if let Ok(head) = repo.head() {
        if head.is_branch() {
            return head.shorthand().map(|s| s.to_string());
        }
        return None;
    }
    // 尚未提交（unborn branch）时，HEAD 仍是符号引用
    repo.find_reference("HEAD")
        .ok()
        .and_then(|r| r.symbolic_target().map(|t| t.to_string()))
        .and_then(|target| target.strip_prefix("refs/heads/").map(|name| name.to_string()))
}

fn tracking_ref(repo: &Repository, branch: &str) -> Option<String> {
    repo.branch_upstream_name(&format!("refs/heads/{}", branch))
        .ok()
        .and_then(|buf| buf.as_str().map(|s| s.to_string()))
        .filter(|name| !name.is_empty())
}

fn commit_info(commit: &git2::Commit<'_>) -> CommitInfo {
    let hash = commit.id().to_string();
    let short_hash = hash.chars().take(7).collect();
    CommitInfo {
        hash,
        short_hash,
        message: commit.message().unwrap_or("").trim().to_string(),
        author: commit.author().name().unwrap_or("").to_string(),
        email: commit.author().email().unwrap_or("").to_string(),
        timestamp: commit.time().seconds().max(0) as u64,
    }
}

// ═══════════════════════════════════════════
// 身份：本地覆盖 > 全局
// ═══════════════════════════════════════════

fn read_identity(config: &git2::Config) -> Option<(String, String)> {
    let name = config.get_string("user.name").ok()?.trim().to_string();
    let email = config.get_string("user.email").ok()?.trim().to_string();
    if name.is_empty() || email.is_empty() {
        None
    } else {
        Some((name, email))
    }
}

fn local_identity_config(repo: &Repository) -> Result<git2::Config, AppError> {
    repo.config()
        .and_then(|config| config.open_level(ConfigLevel::Local))
        .map_err(|e| git_error("Failed to read local Git config", e))
}

fn global_identity_config() -> Option<git2::Config> {
    let path = global_config_path()?;
    git2::Config::open(&path).ok()
}

/// 全局 Git 配置路径。显式处理 `GIT_CONFIG_GLOBAL`，既不依赖 libgit2 的
/// 默认搜索路径缓存，也让测试可以用临时文件完全隔离。
fn global_config_path() -> Option<std::path::PathBuf> {
    if let Ok(path) = std::env::var("GIT_CONFIG_GLOBAL") {
        if !path.trim().is_empty() {
            return Some(std::path::PathBuf::from(path));
        }
    }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        let candidate = std::path::PathBuf::from(xdg).join("git").join("config");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    std::env::var("HOME")
        .ok()
        .map(|home| std::path::PathBuf::from(home).join(".gitconfig"))
}

fn open_global_config_for_write() -> Result<git2::Config, AppError> {
    let path =
        global_config_path().ok_or_else(|| AppError::new("E_NO_HOME", "Cannot resolve global Git config path"))?;
    if !path.exists() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| crate::error::io_error("Failed to create Git config dir", e))?;
        }
        std::fs::write(&path, "").map_err(|e| crate::error::io_error("Failed to create Git config", e))?;
    }
    git2::Config::open(&path).map_err(|e| git_error("Failed to open global Git config", e))
}

pub fn global_user_config() -> Result<(String, String), AppError> {
    let Some(config) = global_identity_config() else {
        return Ok((String::new(), String::new()));
    };
    let name = config.get_string("user.name").unwrap_or_default();
    let email = config.get_string("user.email").unwrap_or_default();
    Ok((name, email))
}

pub fn set_global_user_config(name: &str, email: &str) -> Result<(), AppError> {
    let mut config = open_global_config_for_write()?;
    config
        .set_str("user.name", name)
        .map_err(|e| git_error("Failed to set global user.name", e))?;
    config
        .set_str("user.email", email)
        .map_err(|e| git_error("Failed to set global user.email", e))?;
    Ok(())
}

pub fn set_global_proxy(proxy: &str) -> Result<(), AppError> {
    let mut config = open_global_config_for_write()?;
    if proxy.is_empty() {
        let _ = config.remove("http.proxy");
    } else {
        config
            .set_str("http.proxy", proxy)
            .map_err(|e| git_error("Failed to set global http.proxy", e))?;
    }
    Ok(())
}

pub fn global_identity() -> Option<(String, String)> {
    let config = global_identity_config()?;
    read_identity(&config)
}

pub fn get_book_identity(book_path: &str) -> Result<BookIdentity, AppError> {
    let repo = open_repo(book_path)?;
    let local = read_identity(&local_identity_config(&repo)?);
    let global = global_identity();

    let (effective, source) = if let Some(local) = &local {
        (Some(local.clone()), "book")
    } else if let Some(global) = &global {
        (Some(global.clone()), "global")
    } else {
        (None, "none")
    };

    Ok(BookIdentity {
        local_name: local.as_ref().map(|v| v.0.clone()),
        local_email: local.as_ref().map(|v| v.1.clone()),
        global_name: global.as_ref().map(|v| v.0.clone()),
        global_email: global.as_ref().map(|v| v.1.clone()),
        effective_name: effective.as_ref().map(|v| v.0.clone()),
        effective_email: effective.as_ref().map(|v| v.1.clone()),
        source: source.to_string(),
    })
}

/// 设置本书提交身份。`name` 与 `email` 同时为空表示删除本地覆盖、跟随全局。
/// 只允许「两者都有」或「两者都空」，避免写入半个签名。
pub fn set_book_identity(book_path: &str, name: &str, email: &str) -> Result<(), AppError> {
    let name = name.trim();
    let email = email.trim();
    if name.is_empty() != email.is_empty() {
        return Err(AppError::new(
            "E_INVALID_IDENTITY",
            "Name and email must be set together",
        ));
    }

    let repo = open_repo(book_path)?;
    let mut config = local_identity_config(&repo)?;
    if name.is_empty() {
        // 本地本来就没有覆盖时，删除失败等价于目标状态已达成
        let _ = config.remove("user.name");
        let _ = config.remove("user.email");
    } else {
        config
            .set_str("user.name", name)
            .map_err(|e| git_error("Failed to set user.name", e))?;
        config
            .set_str("user.email", email)
            .map_err(|e| git_error("Failed to set user.email", e))?;
    }
    Ok(())
}

fn get_signature(repo: &Repository) -> Result<Signature<'static>, AppError> {
    let identity = read_identity(&local_identity_config(repo)?).or_else(global_identity);
    let (name, email) =
        identity.ok_or_else(|| AppError::new("E_NO_IDENTITY", "Git user.name and user.email are not configured"))?;
    Signature::now(&name, &email).map_err(|e| git_error("Invalid Git signature", e))
}

// ═══════════════════════════════════════════
// 提交与历史
// ═══════════════════════════════════════════

fn add_all(book_path: &str) -> Result<(), AppError> {
    let repo = open_repo(book_path)?;
    let mut index = repo.index().map_err(|e| git_error("Failed to open index", e))?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| git_error("Failed to add files", e))?;
    index.write().map_err(|e| git_error("Failed to write index", e))?;
    Ok(())
}

pub fn git_commit(book_path: &str, message: &str) -> Result<(), AppError> {
    let repo = open_repo(book_path)?;
    add_all(book_path)?;

    let signature = get_signature(&repo)?;
    let mut index = repo.index().map_err(|e| git_error("Failed to open index", e))?;
    let tree_id = index.write_tree().map_err(|e| git_error("Failed to write tree", e))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| git_error("Failed to find tree", e))?;

    let parent_commit = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
    match parent_commit {
        Some(parent) => repo.commit(Some("HEAD"), &signature, &signature, message, &tree, &[&parent]),
        None => repo.commit(Some("HEAD"), &signature, &signature, message, &tree, &[]),
    }
    .map_err(|e| git_error("Failed to commit", e))?;

    Ok(())
}

/// 有可用身份时创建初始提交；没有身份时返回 `Ok(false)`，由调用方决定是否提示。
pub fn initial_commit_if_identity(book_path: &str, message: &str) -> Result<bool, AppError> {
    let repo = open_repo(book_path)?;
    match get_signature(&repo) {
        Ok(_) => {}
        Err(error) if error.code == "E_NO_IDENTITY" => return Ok(false),
        Err(error) => return Err(error),
    }
    git_commit(book_path, message)?;
    Ok(true)
}

pub fn git_log(book_path: &str, max_count: u32) -> Result<Vec<CommitInfo>, AppError> {
    let repo = open_repo(book_path)?;
    log_commits(&repo, max_count)
}

fn log_commits(repo: &Repository, max_count: u32) -> Result<Vec<CommitInfo>, AppError> {
    let mut revwalk = repo.revwalk().map_err(|e| git_error("Failed to create revwalk", e))?;
    revwalk.push_head().map_err(|e| git_error("Failed to push head", e))?;
    revwalk
        .set_sorting(git2::Sort::TIME)
        .map_err(|e| git_error("Failed to set sorting", e))?;

    let mut commits = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i as u32 >= max_count {
            break;
        }
        let oid = oid.map_err(|e| git_error("Failed to get oid", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| git_error("Failed to find commit", e))?;
        commits.push(commit_info(&commit));
    }
    Ok(commits)
}

// ═══════════════════════════════════════════
// 工作区状态
// ═══════════════════════════════════════════

fn status_entries(repo: &Repository) -> Result<Vec<RepoFileStatus>, AppError> {
    let statuses = repo
        .statuses(None)
        .map_err(|e| git_error("Failed to read Git status", e))?;

    let mut entries = Vec::new();
    for entry in statuses.iter() {
        let Some(path) = entry.path() else { continue };
        let status = entry.status();
        let index_code = if status.contains(git2::Status::INDEX_NEW) {
            Some("A")
        } else if status.contains(git2::Status::INDEX_MODIFIED) {
            Some("M")
        } else if status.contains(git2::Status::INDEX_DELETED) {
            Some("D")
        } else if status.contains(git2::Status::INDEX_RENAMED) {
            Some("R")
        } else {
            None
        };
        let worktree_code = if status.contains(git2::Status::CONFLICTED) {
            Some("U")
        } else if status.contains(git2::Status::WT_NEW) {
            Some("?")
        } else if status.contains(git2::Status::WT_MODIFIED) {
            Some("M")
        } else if status.contains(git2::Status::WT_DELETED) {
            Some("D")
        } else if status.contains(git2::Status::WT_RENAMED) {
            Some("R")
        } else {
            None
        };
        let code = match (index_code, worktree_code) {
            (Some(index), Some(work)) => format!("{}{}", index, work),
            (Some(index), None) => format!("{} ", index),
            (None, Some(work)) => format!(" {}", work),
            (None, None) => continue,
        };
        entries.push(RepoFileStatus {
            path: path.to_string(),
            code,
            staged: index_code.is_some(),
        });
    }
    Ok(entries)
}

pub fn git_status(book_path: &str) -> Result<String, AppError> {
    let repo = open_repo(book_path)?;
    let entries = status_entries(&repo)?;
    Ok(entries
        .iter()
        .map(|entry| format!("{} {}", entry.code, entry.path))
        .collect::<Vec<_>>()
        .join("\n"))
}

fn ahead_behind_with_tracking(repo: &Repository) -> Result<(Option<String>, u32, u32), AppError> {
    let Some(branch) = current_branch(repo) else {
        return Ok((None, 0, 0));
    };
    let Some(tracking) = tracking_ref(repo, &branch) else {
        return Ok((None, 0, 0));
    };
    let head = repo.head().map_err(|e| git_error("Failed to read HEAD", e))?;
    let Some(head_oid) = head.target() else {
        return Ok((Some(tracking), 0, 0));
    };
    let Some(upstream_oid) = repo
        .find_reference(&tracking)
        .ok()
        .and_then(|reference| reference.target())
    else {
        return Ok((Some(tracking), 0, 0));
    };
    let (ahead, behind) = repo
        .graph_ahead_behind(head_oid, upstream_oid)
        .map_err(|e| git_error("Failed to count ahead/behind", e))?;
    Ok((Some(tracking), ahead as u32, behind as u32))
}

pub fn git_ahead_behind(book_path: &str) -> Result<(u32, u32), AppError> {
    let repo = open_repo(book_path)?;
    let (_, ahead, behind) = ahead_behind_with_tracking(&repo)?;
    Ok((ahead, behind))
}

/// 书架状态点用的轻量摘要：不读取提交列表、不计算同步时间。
pub fn repo_summary(book_path: &str) -> RepoSummary {
    let empty = RepoSummary {
        path: book_path.to_string(),
        initialized: false,
        dirty: 0,
        conflicted: 0,
        ahead: 0,
        behind: 0,
        has_remote: false,
    };

    let Ok(repo) = Repository::open(book_path) else {
        return empty;
    };

    let has_remote = repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().map(|url| !url.trim().is_empty()))
        .unwrap_or(false);
    let (dirty, conflicted) = status_entries(&repo)
        .map(|entries| {
            let conflicted = entries.iter().filter(|entry| entry.code.contains('U')).count() as u32;
            (entries.len() as u32 - conflicted, conflicted)
        })
        .unwrap_or((0, 0));
    let (_, ahead, behind) = ahead_behind_with_tracking(&repo).unwrap_or((None, 0, 0));

    RepoSummary {
        path: book_path.to_string(),
        initialized: true,
        dirty,
        conflicted,
        ahead,
        behind,
        has_remote,
    }
}

fn last_sync_at(repo: &Repository) -> Option<u64> {
    let git_dir = repo.path().join("FETCH_HEAD");
    let modified = std::fs::metadata(git_dir).ok()?.modified().ok()?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

pub fn repo_state(book_path: &str) -> Result<RepoState, AppError> {
    let repo = match Repository::open(book_path) {
        Ok(repo) => repo,
        Err(_) => return Ok(RepoState::default()),
    };

    let branch = current_branch(&repo);
    let detached = repo.head_detached().unwrap_or(false);
    let remote_url = repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().map(|url| url.to_string()));
    let (tracking, ahead, behind) = ahead_behind_with_tracking(&repo)?;
    let dirty = status_entries(&repo)?;
    let mut conflicted: Vec<String> = dirty
        .iter()
        .filter(|entry| entry.code.contains('U'))
        .map(|entry| entry.path.clone())
        .collect();
    conflicted.sort();
    let head = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_commit().ok())
        .map(|commit| commit_info(&commit));
    let recent_commits = log_commits(&repo, 20).unwrap_or_default();

    Ok(RepoState {
        initialized: true,
        branch,
        detached,
        remote_url,
        tracking,
        ahead,
        behind,
        dirty,
        conflicted,
        head,
        recent_commits,
        last_sync_at: last_sync_at(&repo),
    })
}

/// 读取单个文件相对 HEAD 的文本差异（包含已暂存、未暂存与未跟踪改动）。
pub fn file_diff(book_path: &str, path: &str) -> Result<FileDiff, AppError> {
    let repo = open_repo(book_path)?;
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

    let mut opts = DiffOptions::new();
    opts.pathspec(path);
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    opts.show_untracked_content(true);

    let mut text = String::new();
    let mut binary = false;
    let mut truncated = false;

    // 已暂存改动：HEAD -> index
    if let Some(tree) = head_tree.as_ref() {
        let staged = repo
            .diff_tree_to_index(Some(tree), None, Some(&mut opts))
            .map_err(|e| git_error("Failed to read file diff", e))?;
        append_patch(&staged, &mut text, &mut binary, &mut truncated)?;
    }

    // 未暂存与未跟踪改动：index -> 工作区
    let unstaged = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| git_error("Failed to read file diff", e))?;
    append_patch(&unstaged, &mut text, &mut binary, &mut truncated)?;

    Ok(FileDiff {
        path: path.to_string(),
        diff: text,
        binary,
        truncated,
    })
}

fn append_patch(
    diff: &git2::Diff<'_>,
    text: &mut String,
    binary: &mut bool,
    truncated: &mut bool,
) -> Result<(), AppError> {
    const LIMIT: usize = 400_000;
    diff.print(DiffFormat::Patch, |delta, _hunk, line| {
        if delta.flags().is_binary() {
            *binary = true;
        }
        if line.origin() == 'B' {
            return true;
        }
        let mut piece = String::new();
        if matches!(line.origin(), '+' | '-' | ' ') {
            piece.push(line.origin());
        }
        piece.push_str(&String::from_utf8_lossy(line.content()));
        if text.len() + piece.len() > LIMIT {
            *truncated = true;
            return false;
        }
        text.push_str(&piece);
        true
    })
    .map_err(|e| git_error("Failed to read file diff", e))
}

// ═══════════════════════════════════════════
// 远程
// ═══════════════════════════════════════════

pub fn git_remote_url(book_path: &str) -> Result<Option<String>, AppError> {
    let repo = open_repo(book_path)?;
    Ok(repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().map(|url| url.to_string())))
}

pub fn git_remote_set_url(book_path: &str, url: &str) -> Result<(), AppError> {
    let repo = open_repo(book_path)?;
    if repo.find_remote("origin").is_ok() {
        repo.remote_set_url("origin", url)
            .map_err(|e| git_error("Failed to set remote URL", e))?;
    } else {
        repo.remote("origin", url)
            .map_err(|e| git_error("Failed to add remote", e))?;
    }
    Ok(())
}

fn default_callbacks() -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    let home = std::env::var("HOME").unwrap_or_default();

    callbacks.credentials(move |_url, username_from_url, allowed_types| {
        let user = username_from_url.unwrap_or("git");
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            if let Ok(cred) = Cred::ssh_key_from_agent(user) {
                return Ok(cred);
            }
            let key_paths = [
                std::path::PathBuf::from(&home).join(".ssh/id_ed25519"),
                std::path::PathBuf::from(&home).join(".ssh/id_rsa"),
                std::path::PathBuf::from(&home).join(".ssh/id_ecdsa"),
            ];
            for path in &key_paths {
                if path.exists() {
                    if let Ok(cred) = Cred::ssh_key(user, None, path, None) {
                        return Ok(cred);
                    }
                }
            }
        }
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            return Err(git2::Error::from_str(
                "Need username/password. Use HTTPS URL with token.",
            ));
        }
        Err(git2::Error::from_str("No auth method available for this URL"))
    });
    callbacks
}

pub fn git_fetch(book_path: &str) -> Result<String, AppError> {
    let repo = open_repo(book_path)?;
    let mut remote = repo.find_remote("origin").map_err(|e| {
        if e.code() == ErrorCode::NotFound {
            AppError::new("E_NO_REMOTE", "No remote 'origin' configured")
        } else {
            git_error("Failed to find remote", e)
        }
    })?;

    let mut options = FetchOptions::new();
    options.remote_callbacks(default_callbacks());
    remote
        .fetch(&["+refs/heads/*:refs/remotes/origin/*"], Some(&mut options), None)
        .map_err(|e| git_error("Fetch failed", e))?;

    Ok("Fetch completed".to_string())
}

/// 拉取远程更新：只处理 up-to-date / fast-forward，分叉交给独立的 merge 流程。
pub fn git_pull(book_path: &str) -> Result<String, AppError> {
    let repo = open_repo(book_path)?;

    let statuses = repo
        .statuses(None)
        .map_err(|e| git_error("Failed to read Git status", e))?;
    if statuses.iter().any(|status| status.status() != git2::Status::CURRENT) {
        git_commit(book_path, "auto-save before pull")?;
    }

    let branch =
        current_branch(&repo).ok_or_else(|| AppError::new("E_DETACHED", "Cannot pull in detached HEAD state"))?;

    git_fetch(book_path)?;

    let local_ref = format!("refs/heads/{}", branch);
    let upstream = match tracking_ref(&repo, &branch) {
        Some(name) => name,
        None => {
            let candidate = format!("refs/remotes/origin/{}", branch);
            if repo.find_reference(&candidate).is_err() {
                return Err(AppError::new(
                    "E_NO_UPSTREAM",
                    format!("No upstream configured for branch '{}'", branch),
                ));
            }
            let mut config = repo.config().map_err(|e| git_error("Failed to read Git config", e))?;
            config
                .set_str(&format!("branch.{}.remote", branch), "origin")
                .map_err(|e| git_error("Failed to set branch remote", e))?;
            config
                .set_str(&format!("branch.{}.merge", branch), &local_ref)
                .map_err(|e| git_error("Failed to set branch merge", e))?;
            candidate
        }
    };

    let upstream_ref = repo
        .find_reference(&upstream)
        .map_err(|e| git_error("Failed to find upstream ref", e))?;
    let annotated = repo
        .reference_to_annotated_commit(&upstream_ref)
        .map_err(|e| git_error("Failed to analyze upstream", e))?;
    let (analysis, _) = repo
        .merge_analysis(&[&annotated])
        .map_err(|e| git_error("Failed to analyze merge", e))?;

    if analysis.is_up_to_date() {
        return Ok("Already up to date.".to_string());
    }
    if analysis.is_fast_forward() {
        let target = annotated.id();
        {
            let mut local = repo
                .find_reference(&local_ref)
                .map_err(|e| git_error("Failed to find local branch", e))?;
            local
                .set_target(target, "pull: fast-forward")
                .map_err(|e| git_error("Failed to update local branch", e))?;
        }
        repo.set_head(&local_ref)
            .map_err(|e| git_error("Failed to update HEAD", e))?;
        let mut checkout = CheckoutBuilder::new();
        checkout.force();
        repo.checkout_head(Some(&mut checkout))
            .map_err(|e| git_error("Checkout failed", e))?;
        return Ok("Pulled (fast-forward).".to_string());
    }

    Err(AppError::new(
        "E_DIVERGED",
        "Local and remote have diverged. Commit local changes, then merge or push.",
    ))
}

pub fn git_push(book_path: &str) -> Result<String, AppError> {
    let repo = open_repo(book_path)?;
    let branch =
        current_branch(&repo).ok_or_else(|| AppError::new("E_DETACHED", "Cannot push in detached HEAD state"))?;

    let mut remote = repo.find_remote("origin").map_err(|e| {
        if e.code() == ErrorCode::NotFound {
            AppError::new("E_NO_REMOTE", "No remote 'origin' configured")
        } else {
            git_error("Failed to find remote", e)
        }
    })?;

    let refspec = format!("refs/heads/{0}:refs/heads/{0}", branch);
    let mut options = PushOptions::new();
    options.remote_callbacks(default_callbacks());
    remote
        .push(&[refspec.as_str()], Some(&mut options))
        .map_err(|e| git_error("Push failed", e))?;

    // 首次推送后写入 upstream，后续 ahead/behind 才有依据
    let mut config = repo.config().map_err(|e| git_error("Failed to read Git config", e))?;
    config
        .set_str(&format!("branch.{}.remote", branch), "origin")
        .map_err(|e| git_error("Failed to set branch remote", e))?;
    config
        .set_str(&format!("branch.{}.merge", branch), &format!("refs/heads/{}", branch))
        .map_err(|e| git_error("Failed to set branch merge", e))?;

    Ok(format!("Pushed branch '{}'.", branch))
}

// ═══════════════════════════════════════════
// 冲突与合并
// ═══════════════════════════════════════════

pub fn git_list_conflicted(book_path: &str) -> Result<Vec<String>, AppError> {
    let repo = open_repo(book_path)?;
    let statuses = repo
        .statuses(None)
        .map_err(|e| git_error("Failed to read Git status", e))?;
    Ok(statuses
        .iter()
        .filter(|entry| entry.status().contains(git2::Status::CONFLICTED))
        .filter_map(|entry| entry.path().map(|path| path.to_string()))
        .collect())
}

pub fn git_attempt_merge(book_path: &str) -> Result<Vec<String>, AppError> {
    git_fetch(book_path)?;

    let repo = open_repo(book_path)?;
    let head = repo.head().map_err(|e| git_error("Failed to read HEAD", e))?;
    let head_oid = head
        .target()
        .ok_or_else(|| AppError::new("E_NO_HEAD", "No HEAD target"))?;
    let head_commit = repo
        .find_commit(head_oid)
        .map_err(|e| git_error("Failed to find HEAD commit", e))?;

    let branch =
        current_branch(&repo).ok_or_else(|| AppError::new("E_DETACHED", "Cannot merge in detached HEAD state"))?;
    let upstream = tracking_ref(&repo, &branch)
        .ok_or_else(|| AppError::new("E_NO_UPSTREAM", "No upstream configured for this branch"))?;
    let upstream_ref = repo
        .find_reference(&upstream)
        .map_err(|e| git_error("Failed to find upstream ref", e))?;
    let upstream_oid = upstream_ref
        .target()
        .ok_or_else(|| AppError::new("E_NO_UPSTREAM", "Upstream has no target"))?;
    let upstream_commit = repo
        .find_commit(upstream_oid)
        .map_err(|e| git_error("Failed to find upstream commit", e))?;

    let merge_base = repo
        .merge_base(head_oid, upstream_oid)
        .map_err(|_| AppError::new("E_DIVERGED", "Local and remote have diverged."))?;
    if merge_base == head_oid {
        return Err(AppError::new(
            "E_NOT_DIVERGED",
            "Already up to date or fast-forward possible. Pull first.",
        ));
    }

    let mut index = repo.index().map_err(|e| git_error("Failed to open index", e))?;
    let tree = head_commit.tree().map_err(|e| git_error("Failed to read tree", e))?;
    index
        .read_tree(&tree)
        .map_err(|e| git_error("Failed to read tree into index", e))?;
    index.write().map_err(|e| git_error("Failed to write index", e))?;

    let signature = get_signature(&repo)?;
    let mut checkout = CheckoutBuilder::new();
    checkout.force();
    repo.merge_commits(&head_commit, &upstream_commit, None)
        .map_err(|e| git_error("Merge failed", e))?;
    repo.checkout_index(None, Some(&mut checkout))
        .map_err(|e| git_error("Checkout after merge failed", e))?;

    let conflicted = git_list_conflicted(book_path)?;
    if conflicted.is_empty() {
        let mut index = repo.index().map_err(|e| git_error("Failed to open index", e))?;
        let tree_oid = index.write_tree().map_err(|e| git_error("Failed to write tree", e))?;
        let tree = repo
            .find_tree(tree_oid)
            .map_err(|e| git_error("Failed to find tree", e))?;
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "merge: Merge remote changes",
            &tree,
            &[&head_commit, &upstream_commit],
        )
        .map_err(|e| git_error("Failed to commit merge", e))?;
        repo.cleanup_state()
            .map_err(|e| git_error("Failed to clean merge state", e))?;
        Ok(vec![])
    } else {
        Ok(conflicted)
    }
}

pub fn git_resolve_conflict(book_path: &str, file_path: &str, use_theirs: bool) -> Result<String, AppError> {
    let repo = open_repo(book_path)?;
    let mut index = repo.index().map_err(|e| git_error("Failed to open index", e))?;

    let target_stage: u16 = if use_theirs { 3 } else { 2 };
    let chosen_entry = index
        .iter()
        .find(|entry| {
            let stage = (entry.flags >> 12) & 3;
            stage == target_stage && entry.path == file_path.as_bytes()
        })
        .ok_or_else(|| AppError::new("E_NOT_FOUND", "No matching stage entry found"))?;

    let content = repo
        .find_blob(chosen_entry.id)
        .map_err(|e| git_error("Failed to read blob", e))?
        .content()
        .to_vec();

    let work_path = repo
        .workdir()
        .ok_or_else(|| AppError::new("E_BARE_REPO", "No working directory"))?
        .join(file_path);
    if let Some(parent) = work_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| crate::error::io_error("Failed to create conflict directory", e))?;
    }
    std::fs::write(&work_path, &content).map_err(|e| crate::error::io_error("Failed to write resolved file", e))?;

    index
        .add_path(Path::new(file_path))
        .map_err(|e| git_error("Failed to add resolved file", e))?;
    index.write().map_err(|e| git_error("Failed to write index", e))?;

    Ok(format!("Resolved: {}", file_path))
}

// ═══════════════════════════════════════════
// 代理与兼容旧接口
// ═══════════════════════════════════════════

pub fn git_get_proxy(book_path: &str) -> Result<String, AppError> {
    let repo = open_repo(book_path)?;
    let config = repo.config().map_err(|e| git_error("Failed to read Git config", e))?;
    Ok(config.get_string("http.proxy").unwrap_or_default())
}

pub fn git_set_proxy(book_path: &str, proxy: &str) -> Result<(), AppError> {
    let repo = open_repo(book_path)?;
    let mut config = repo.config().map_err(|e| git_error("Failed to read Git config", e))?;
    if proxy.is_empty() {
        let _ = config.remove("http.proxy");
    } else {
        config
            .set_str("http.proxy", proxy)
            .map_err(|e| git_error("Failed to set http.proxy", e))?;
    }
    Ok(())
}

pub fn git_user_config(book_path: &str) -> Result<(String, String), AppError> {
    let identity = get_book_identity(book_path)?;
    Ok((
        identity.effective_name.unwrap_or_default(),
        identity.effective_email.unwrap_or_default(),
    ))
}

pub fn git_set_user_config(book_path: &str, name: &str, email: &str) -> Result<(), AppError> {
    set_book_identity(book_path, name, email)
}

// ═══════════════════════════════════════════
// 测试
// ═══════════════════════════════════════════

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex, MutexGuard};

    use tempfile::TempDir;

    use super::*;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// 把 `GIT_CONFIG_GLOBAL` 指向临时文件，避免读写本机 `~/.gitconfig`；
    /// 同时串行化所有 Git 测试，避免环境变量互相干扰。
    struct IsolatedConfig {
        _dir: TempDir,
        path: std::path::PathBuf,
        _guard: MutexGuard<'static, ()>,
    }

    impl IsolatedConfig {
        fn new() -> Self {
            let guard = ENV_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("gitconfig");
            fs::write(&path, "").unwrap();
            std::env::set_var("GIT_CONFIG_GLOBAL", &path);
            std::env::set_var("GIT_CONFIG_NOSYSTEM", "1");
            Self {
                _dir: dir,
                path,
                _guard: guard,
            }
        }

        fn set_global(&self, name: &str, email: &str) {
            let mut config = git2::Config::open(&self.path).unwrap();
            config.set_str("user.name", name).unwrap();
            config.set_str("user.email", email).unwrap();
        }
    }

    impl Drop for IsolatedConfig {
        fn drop(&mut self) {
            std::env::remove_var("GIT_CONFIG_GLOBAL");
            std::env::remove_var("GIT_CONFIG_NOSYSTEM");
        }
    }

    fn write_file(dir: &Path, name: &str, content: &str) {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    fn commit(book_path: &Path, message: &str) {
        git_commit(&book_path.to_string_lossy(), message).unwrap();
    }

    fn path_str(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }

    fn bare_origin(dir: &Path) -> String {
        git2::Repository::init_bare(dir).unwrap();
        path_str(dir)
    }

    fn setup_repo_with_origin() -> (IsolatedConfig, TempDir, TempDir) {
        let isolated = IsolatedConfig::new();
        isolated.set_global("Global User", "global@example.com");
        let work = tempfile::tempdir().unwrap();
        git_init(&path_str(work.path())).unwrap();
        write_file(work.path(), "note.md", "hello\n");
        commit(work.path(), "initial");

        let origin = tempfile::tempdir().unwrap();
        let origin_url = bare_origin(origin.path());
        git_remote_set_url(&path_str(work.path()), &origin_url).unwrap();
        git_push(&path_str(work.path())).unwrap();
        (isolated, work, origin)
    }

    #[test]
    fn identity_prefers_book_override_and_clears_back_to_global() {
        let isolated = IsolatedConfig::new();
        isolated.set_global("Global User", "global@example.com");
        let dir = tempfile::tempdir().unwrap();
        git_init(&path_str(dir.path())).unwrap();

        let identity = get_book_identity(&path_str(dir.path())).unwrap();
        assert_eq!(identity.source, "global");
        assert_eq!(identity.effective_name.as_deref(), Some("Global User"));

        set_book_identity(&path_str(dir.path()), "Book User", "book@example.com").unwrap();
        let identity = get_book_identity(&path_str(dir.path())).unwrap();
        assert_eq!(identity.source, "book");
        assert_eq!(identity.local_email.as_deref(), Some("book@example.com"));

        set_book_identity(&path_str(dir.path()), "", "").unwrap();
        let identity = get_book_identity(&path_str(dir.path())).unwrap();
        assert_eq!(identity.source, "global");
        assert!(identity.local_name.is_none());
        assert!(identity.local_email.is_none());
    }

    #[test]
    fn set_book_identity_rejects_half_configured_identity() {
        let _isolated = IsolatedConfig::new();
        let dir = tempfile::tempdir().unwrap();
        git_init(&path_str(dir.path())).unwrap();
        let error = set_book_identity(&path_str(dir.path()), "Only Name", "").unwrap_err();
        assert_eq!(error.code, "E_INVALID_IDENTITY");
    }

    #[test]
    fn commit_and_log_include_author_email() {
        let isolated = IsolatedConfig::new();
        isolated.set_global("Global User", "global@example.com");
        let dir = tempfile::tempdir().unwrap();
        git_init(&path_str(dir.path())).unwrap();
        write_file(dir.path(), "note.md", "hello\n");
        commit(dir.path(), "first");

        let log = git_log(&path_str(dir.path()), 10).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].message, "first");
        assert_eq!(log[0].email, "global@example.com");
        assert_eq!(log[0].short_hash.len(), 7);
    }

    #[test]
    fn initial_commit_skips_without_identity_and_runs_with_identity() {
        let isolated = IsolatedConfig::new();
        let dir = tempfile::tempdir().unwrap();
        git_init(&path_str(dir.path())).unwrap();
        write_file(dir.path(), "note.md", "hello\n");
        assert!(!initial_commit_if_identity(&path_str(dir.path()), "init").unwrap());

        isolated.set_global("Global User", "global@example.com");
        assert!(initial_commit_if_identity(&path_str(dir.path()), "init").unwrap());
        assert_eq!(git_log(&path_str(dir.path()), 10).unwrap().len(), 1);
    }

    #[test]
    fn enable_version_control_requires_identity_then_creates_initial_commit() {
        let isolated = IsolatedConfig::new();
        let dir = tempfile::tempdir().unwrap();
        let path = path_str(dir.path());
        write_file(dir.path(), "note.md", "hello\n");

        // 没有身份时明确失败，且不留下没有提交的半成品仓库
        let error = enable_version_control(&path).unwrap_err();
        assert_eq!(error.code, "E_NO_IDENTITY");
        assert!(!is_repo(&path));

        isolated.set_global("Global User", "global@example.com");
        assert!(enable_version_control(&path).unwrap());
        let log = git_log(&path, 10).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].email, "global@example.com");

        // 已经有提交时重复启用是空操作
        assert!(!enable_version_control(&path).unwrap());
        assert_eq!(git_log(&path, 10).unwrap().len(), 1);
    }

    #[test]
    fn file_diff_reports_modified_and_untracked_files() {
        let isolated = IsolatedConfig::new();
        isolated.set_global("Global User", "global@example.com");
        let dir = tempfile::tempdir().unwrap();
        git_init(&path_str(dir.path())).unwrap();
        write_file(dir.path(), "note.md", "old line\n");
        commit(dir.path(), "initial");

        write_file(dir.path(), "note.md", "new line\n");
        let diff = file_diff(&path_str(dir.path()), "note.md").unwrap();
        assert!(!diff.binary);
        assert!(diff.diff.contains("-old line"));
        assert!(diff.diff.contains("+new line"));

        write_file(dir.path(), "draft.md", "fresh\n");
        let diff = file_diff(&path_str(dir.path()), "draft.md").unwrap();
        assert!(diff.diff.contains("+fresh"));
    }

    #[test]
    fn fetch_updates_ahead_behind_and_push_uses_current_branch() {
        let (_isolated, work, _origin) = setup_repo_with_origin();
        let repo = Repository::open(work.path()).unwrap();
        let branch = current_branch(&repo).expect("current branch");
        let (_, ahead, behind) = ahead_behind_with_tracking(&repo).unwrap();
        assert_eq!((ahead, behind), (0, 0));

        // push 必须推当前分支，而不是写死 main/master
        write_file(work.path(), "local.md", "local\n");
        commit(work.path(), "local change");
        git_push(&path_str(work.path())).unwrap();
        let bare =
            Repository::open_bare(PathBuf::from(git_remote_url(&path_str(work.path())).unwrap().unwrap())).unwrap();
        let pushed = bare
            .find_reference(&format!("refs/heads/{}", branch))
            .unwrap()
            .peel_to_commit()
            .unwrap();
        assert_eq!(pushed.message(), Some("local change"));

        // 另一个克隆在远程上新增一个提交，再把远程变化 fetch 回来
        let clone_parent = tempfile::tempdir().unwrap();
        let clone_path = clone_parent.path().join("clone");
        let origin_url = git_remote_url(&path_str(work.path())).unwrap().unwrap();
        Repository::clone(&origin_url, &clone_path).unwrap();
        write_file(&clone_path, "remote.md", "remote\n");
        commit(&clone_path, "remote change");
        git_push(&path_str(&clone_path)).unwrap();

        git_fetch(&path_str(work.path())).unwrap();
        let (_, ahead, behind) = ahead_behind_with_tracking(&repo).unwrap();
        assert_eq!((ahead, behind), (0, 1));

        write_file(work.path(), "diverge.md", "diverge\n");
        commit(work.path(), "local diverge");
        let (_, ahead, behind) = ahead_behind_with_tracking(&repo).unwrap();
        assert_eq!((ahead, behind), (1, 1));
    }

    #[test]
    fn pull_fast_forwards_without_detaching_head() {
        let (_isolated, work, _origin) = setup_repo_with_origin();

        let clone_parent = tempfile::tempdir().unwrap();
        let clone_path = clone_parent.path().join("clone");
        let origin_url = git_remote_url(&path_str(work.path())).unwrap().unwrap();
        Repository::clone(&origin_url, &clone_path).unwrap();
        write_file(&clone_path, "new.md", "new\n");
        commit(&clone_path, "remote change");
        git_push(&path_str(&clone_path)).unwrap();

        git_fetch(&path_str(work.path())).unwrap();
        let message = git_pull(&path_str(work.path())).unwrap();
        assert!(message.contains("fast-forward"));

        let repo = Repository::open(work.path()).unwrap();
        assert!(!repo.head_detached().unwrap());
        let branch = current_branch(&repo).unwrap();
        assert!(branch == "main" || branch == "master");
        assert!(work.path().join("new.md").exists());
    }

    #[test]
    fn pull_reports_diverged_history() {
        let (_isolated, work, _origin) = setup_repo_with_origin();

        let clone_parent = tempfile::tempdir().unwrap();
        let clone_path = clone_parent.path().join("clone");
        let origin_url = git_remote_url(&path_str(work.path())).unwrap().unwrap();
        Repository::clone(&origin_url, &clone_path).unwrap();
        write_file(&clone_path, "remote.md", "remote\n");
        commit(&clone_path, "remote change");
        git_push(&path_str(&clone_path)).unwrap();

        git_fetch(&path_str(work.path())).unwrap();
        write_file(work.path(), "local.md", "local\n");
        commit(work.path(), "local change");

        let error = git_pull(&path_str(work.path())).unwrap_err();
        assert_eq!(error.code, "E_DIVERGED");
    }

    #[test]
    fn repo_state_reports_branch_dirty_and_remote() {
        let (_isolated, work, _origin) = setup_repo_with_origin();
        write_file(work.path(), "draft.md", "draft\n");

        let state = repo_state(&path_str(work.path())).unwrap();
        assert!(state.initialized);
        assert!(state.branch.is_some());
        assert!(!state.detached);
        assert!(state.remote_url.is_some());
        assert!(state.dirty.iter().any(|entry| entry.path == "draft.md"));
        assert_eq!(state.ahead, 0);
        assert_eq!(state.behind, 0);
        assert_eq!(state.head.as_ref().unwrap().message, "initial");
    }

    #[test]
    fn repo_state_is_empty_for_non_repo_directory() {
        let dir = tempfile::tempdir().unwrap();
        let state = repo_state(&path_str(dir.path())).unwrap();
        assert!(!state.initialized);
        assert!(state.head.is_none());
        assert!(state.dirty.is_empty());
    }

    #[test]
    fn repo_summary_reports_dirty_and_remote_without_history() {
        let (_isolated, work, _origin) = setup_repo_with_origin();
        write_file(work.path(), "draft.md", "draft\n");

        let summary = repo_summary(&path_str(work.path()));
        assert!(summary.initialized);
        assert!(summary.has_remote);
        assert_eq!(summary.dirty, 1);
        assert_eq!(summary.conflicted, 0);
        assert_eq!(summary.ahead, 0);
    }

    #[test]
    fn repo_summary_marks_non_repo_directory() {
        let dir = tempfile::tempdir().unwrap();
        let summary = repo_summary(&path_str(dir.path()));
        assert!(!summary.initialized);
        assert!(!summary.has_remote);
        assert_eq!(summary.dirty, 0);
    }
}
