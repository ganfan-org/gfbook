use std::path::Path;

use git2::{Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository, Signature};

use crate::models::CommitInfo;

pub fn git_init(book_path: &str) -> Result<(), String> {
    Repository::init(book_path)
        .map_err(|e| format!("Failed to init git repo: {}", e))?;
    Ok(())
}

fn open_repo(book_path: &str) -> Result<Repository, String> {
    Repository::open(book_path).map_err(|e| format!("Failed to open git repo: {}", e))
}

pub fn git_status(book_path: &str) -> Result<String, String> {
    let repo = open_repo(book_path)?;
    let statuses = repo
        .statuses(None)
        .map_err(|e| format!("Failed to get git status: {}", e))?;

    if statuses.is_empty() {
        return Ok(String::new());
    }

    let lines: Vec<String> = statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path()?;
            let code = match entry.status() {
                s if s.contains(git2::Status::WT_MODIFIED) => " M",
                s if s.contains(git2::Status::WT_NEW) => "??",
                s if s.contains(git2::Status::WT_DELETED) => " D",
                s if s.contains(git2::Status::INDEX_MODIFIED) => "M ",
                s if s.contains(git2::Status::INDEX_NEW) => "A ",
                s if s.contains(git2::Status::INDEX_DELETED) => "D ",
                s if s.contains(git2::Status::CONFLICTED) => "UU",
                _ => return None,
            };
            Some(format!("{} {}", code, path))
        })
        .collect();

    Ok(lines.join("\n"))
}

pub fn git_add_all(book_path: &str) -> Result<(), String> {
    let repo = open_repo(book_path)?;
    let mut index = repo
        .index()
        .map_err(|e| format!("Failed to open index: {}", e))?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Failed to add files: {}", e))?;
    index
        .write()
        .map_err(|e| format!("Failed to write index: {}", e))?;
    Ok(())
}

fn get_signature(repo: &Repository) -> Result<Signature<'static>, String> {
    // Try repo config first
    if let Ok(config) = repo.config() {
        let name = config.get_string("user.name").ok();
        let email = config.get_string("user.email").ok();
        if let (Some(n), Some(e)) = (name, email) {
            return Signature::now(&n, &e).map_err(|e| format!("Bad signature: {}", e));
        }
    }
    // Try global git config
    if let Ok(config) = git2::Config::open_default() {
        let name = config.get_string("user.name").ok();
        let email = config.get_string("user.email").ok();
        if let (Some(n), Some(e)) = (name, email) {
            return Signature::now(&n, &e).map_err(|e| format!("Bad signature: {}", e));
        }
    }
    Err("Git user.name and user.email not configured. Set them in Git panel.".to_string())
}

pub fn git_commit(book_path: &str, message: &str) -> Result<(), String> {
    let repo = open_repo(book_path)?;
    git_add_all(book_path)?;

    let signature = get_signature(&repo)?;

    let mut index = repo
        .index()
        .map_err(|e| format!("Failed to open index: {}", e))?;
    let tree_id = index
        .write_tree()
        .map_err(|e| format!("Failed to write tree: {}", e))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("Failed to find tree: {}", e))?;

    let parent_commit = repo.head().ok().and_then(|head| {
        head.peel_to_commit().ok()
    });

    match parent_commit {
        Some(parent) => {
            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                message,
                &tree,
                &[&parent],
            )
        }
        None => {
            repo.commit(Some("HEAD"), &signature, &signature, message, &tree, &[])
        }
    }
    .map_err(|e| format!("Failed to commit: {}", e))?;

    Ok(())
}

pub fn git_log(book_path: &str, max_count: u32) -> Result<Vec<CommitInfo>, String> {
    let repo = open_repo(book_path)?;
    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("Failed to create revwalk: {}", e))?;
    revwalk
        .push_head()
        .map_err(|e| format!("Failed to push head: {}", e))?;
    revwalk
        .set_sorting(git2::Sort::TIME)
        .map_err(|e| format!("Failed to set sorting: {}", e))?;

    let mut commits = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i as u32 >= max_count {
            break;
        }
        let oid = oid.map_err(|e| format!("Failed to get oid: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Failed to find commit: {}", e))?;
        commits.push(CommitInfo {
            hash: oid.to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            timestamp: commit.time().seconds() as u64,
        });
    }

    Ok(commits)
}

pub fn is_git_repo(book_path: &str) -> bool {
    Repository::open(book_path).is_ok()
}

pub fn git_remote_url(book_path: &str) -> Result<Option<String>, String> {
    let repo = open_repo(book_path)?;
    let url = repo
        .find_remote("origin")
        .ok()
        .and_then(|r| r.url().map(|s| s.to_string()));
    Ok(url)
}

pub fn git_remote_set_url(book_path: &str, url: &str) -> Result<(), String> {
    let repo = open_repo(book_path)?;

    // Check if remote "origin" exists
    if repo.find_remote("origin").is_ok() {
        repo.remote_set_url("origin", url)
            .map_err(|e| format!("Failed to set remote URL: {}", e))?;
    } else {
        repo.remote("origin", url)
            .map_err(|e| format!("Failed to add remote: {}", e))?;
    }
    Ok(())
}

fn default_callbacks() -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    let home = std::env::var("HOME").unwrap_or_default();

    callbacks.credentials(move |_url, username_from_url, allowed_types| {
        let user = username_from_url.unwrap_or("git");
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            // Try SSH agent first
            if let Ok(cred) = Cred::ssh_key_from_agent(user) {
                return Ok(cred);
            }
            // Try default SSH key files
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
            return Err(git2::Error::from_str("Need username/password. Use HTTPS URL with token."));
        }
        Err(git2::Error::from_str("No auth method available for this URL"))
    });
    callbacks
}

pub fn git_fetch(book_path: &str) -> Result<String, String> {
    let repo = open_repo(book_path)?;
    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("No remote 'origin' configured: {}", e))?;

    let mut fo = FetchOptions::new();
    fo.remote_callbacks(default_callbacks());

    remote
        .fetch(&["refs/heads/*:refs/heads/*"], Some(&mut fo), None)
        .map_err(|e| format!("Fetch failed: {}", e))?;

    Ok("Fetch completed".to_string())
}

fn get_branch_ref(book_path: &str) -> Result<(String, String), String> {
    let repo = open_repo(book_path)?;
    let head = repo.head().map_err(|e| format!("No HEAD: {}", e))?;
    let shorthand = head
        .shorthand()
        .ok_or_else(|| "No branch name".to_string())?
        .to_string();
    let full_ref = head.name().ok_or_else(|| "No ref".to_string())?.to_string();
    Ok((shorthand, full_ref))
}

pub fn git_pull(book_path: &str) -> Result<String, String> {
    let repo = open_repo(book_path)?;

    // Auto-commit local changes first
    let statuses = repo
        .statuses(None)
        .map_err(|e| format!("Failed to read git status: {}", e))?;
    if statuses.iter().any(|s| s.status() != git2::Status::CURRENT) {
        git_commit(book_path, "auto-save before pull")?;
    }

    // Fetch
    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("No remote 'origin': {}", e))?;
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(default_callbacks());
    remote
        .fetch(&["refs/heads/*:refs/heads/*"], Some(&mut fo), None)
        .map_err(|e| format!("Fetch failed: {}", e))?;

    // Get fetch head
    let fetch_head = repo
        .find_reference("FETCH_HEAD")
        .map_err(|e| format!("No FETCH_HEAD: {}", e))?;
    let fetch_oid = fetch_head.target().ok_or_else(|| "No fetch target".to_string())?;

    let head = repo.head().map_err(|e| format!("No HEAD: {}", e))?;
    let head_oid = head.target().ok_or_else(|| "No HEAD target".to_string())?;

    if fetch_oid == head_oid {
        return Ok("Already up to date.".to_string());
    }

    // Fast-forward check
    let merge_base = repo
        .merge_base(head_oid, fetch_oid)
        .map_err(|_| {
            // Divergent histories = conflict
            let (branch, _) = get_branch_ref(book_path).unwrap_or_default();
            format!(
                "Local and remote have diverged. To resolve:\n\
                 1. Open the conflicted files in editor\n\
                 2. Edit to keep the content you want\n\
                 3. Commit the merge manually\n\
                 Branch: {}",
                branch
            )
        })?;

    if merge_base == head_oid {
        // Fast-forward possible
        repo.set_head_detached(fetch_oid)
            .map_err(|e| format!("Failed to detach HEAD: {}", e))?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .map_err(|e| format!("Checkout failed: {}", e))?;
        let (branch, full_ref) = get_branch_ref(book_path)?;
        repo.reference(&full_ref, fetch_oid, true, "")
            .map_err(|e| format!("Failed to update branch: {}", e))?;
        repo.set_head(&full_ref).ok();
        Ok("Pulled (fast-forward).".to_string())
    } else {
        // Need merge or rebase
        Err("Local and remote have diverged. Commit local changes then pull again (or push first).".to_string())
    }
}

pub fn git_list_conflicted(book_path: &str) -> Result<Vec<String>, String> {
    let repo = open_repo(book_path)?;
    let statuses = repo
        .statuses(None)
        .map_err(|e| format!("Status error: {}", e))?;
    let files: Vec<String> = statuses
        .iter()
        .filter(|e| e.status().contains(git2::Status::CONFLICTED))
        .filter_map(|e| e.path().map(|p| p.to_string()))
        .collect();
    Ok(files)
}

pub fn git_push(book_path: &str) -> Result<String, String> {
    let repo = open_repo(book_path)?;
    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("No remote 'origin' configured: {}", e))?;

    let mut po = PushOptions::new();
    po.remote_callbacks(default_callbacks());

    remote
        .push(&["refs/heads/main:refs/heads/main"], Some(&mut po))
        .or_else(|_| {
            remote.push(
                &["refs/heads/master:refs/heads/master"],
                Some(&mut po),
            )
        })
        .map_err(|e| format!("Push failed: {}", e))?;

    Ok("Push completed.".to_string())
}

pub fn git_user_config(book_path: &str) -> Result<(String, String), String> {
    let repo = open_repo(book_path)?;
    let config = repo.config().map_err(|e| format!("Config error: {}", e))?;
    let name = config.get_string("user.name").unwrap_or_default();
    let email = config.get_string("user.email").unwrap_or_default();
    Ok((name, email))
}

pub fn git_set_user_config(book_path: &str, name: &str, email: &str) -> Result<(), String> {
    let repo = open_repo(book_path)?;
    let mut config = repo.config().map_err(|e| format!("Config error: {}", e))?;
    config
        .set_str("user.name", name)
        .map_err(|e| format!("Failed to set user.name: {}", e))?;
    config
        .set_str("user.email", email)
        .map_err(|e| format!("Failed to set user.email: {}", e))?;
    Ok(())
}

pub fn git_get_proxy(book_path: &str) -> Result<String, String> {
    let repo = open_repo(book_path)?;
    let config = repo.config().map_err(|e| format!("Config error: {}", e))?;
    Ok(config.get_string("http.proxy").unwrap_or_default())
}

pub fn git_set_proxy(book_path: &str, proxy: &str) -> Result<(), String> {
    let repo = open_repo(book_path)?;
    let mut config = repo.config().map_err(|e| format!("Config error: {}", e))?;
    if proxy.is_empty() {
        let _ = config.remove("http.proxy");
    } else {
        config
            .set_str("http.proxy", proxy)
            .map_err(|e| format!("Failed to set http.proxy: {}", e))?;
    }
    Ok(())
}

pub fn git_ahead_behind(book_path: &str) -> Result<(u32, u32), String> {
    let repo = open_repo(book_path)?;

    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok((0, 0)),
    };
    let head_oid = head
        .target()
        .ok_or_else(|| "No HEAD".to_string())?;

    // Try main, then master
    let branch_names = ["refs/remotes/origin/main", "refs/remotes/origin/master"];
    for branch_name in &branch_names {
        if let Ok(branch_ref) = repo.find_reference(branch_name) {
            if let Some(branch_oid) = branch_ref.target() {
                let (ahead, behind) = repo
                    .graph_ahead_behind(head_oid, branch_oid)
                    .map_err(|e| format!("Failed to count ahead/behind: {}", e))?;
                return Ok((ahead as u32, behind as u32));
            }
        }
    }

    Ok((0, 0))
}
