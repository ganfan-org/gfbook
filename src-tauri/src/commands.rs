use std::fs;
use std::path::PathBuf;

use tauri::{Emitter, Manager};
use uuid::Uuid;

use crate::git;
use crate::models::{BookInfo, BookMeta, Chapter, CommitInfo, flatten_chapters};

const META_FILE: &str = "gtbook.yaml";
const CHAPTERS_DIR: &str = "chapters";
const CONFIG_FILE: &str = "gtbook-config.json";

fn get_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(data_dir.join(CONFIG_FILE))
}

fn load_config(app_handle: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config_path = get_config_path(app_handle)?;
    if config_path.exists() {
        let content =
            fs::read_to_string(&config_path).map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
    } else {
        Ok(serde_json::json!({}))
    }
}

fn save_config(app_handle: &tauri::AppHandle, config: &serde_json::Value) -> Result<(), String> {
    let config_path = get_config_path(app_handle)?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, &content).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

fn default_books_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join("gtbooks")
}

fn read_book_list(app_handle: &tauri::AppHandle) -> Result<Vec<BookInfo>, String> {
    let config = load_config(app_handle).unwrap_or_default();
    let paths: Vec<String> = config
        .get("books")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let mut books: Vec<BookInfo> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for p in &paths {
        let meta_path = PathBuf::from(p).join(META_FILE);
        if !meta_path.exists() {
            continue;
        }
        if let Ok(meta) = load_meta(p) {
            seen.insert(p.clone());
            books.push(BookInfo {
                title: meta.title,
                path: p.clone(),
                created_time: meta.created_time,
                updated_time: meta.updated_time,
            });
        }
    }

    // Also scan default dir for any books not yet in config
    let default_dir = default_books_dir();
    if default_dir.exists() {
        if let Ok(entries) = fs::read_dir(&default_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let path_str = path.to_string_lossy().to_string();
                if seen.contains(&path_str) {
                    continue;
                }
                let meta_path = path.join(META_FILE);
                if !meta_path.exists() {
                    continue;
                }
                if let Ok(meta) = load_meta(&path_str) {
                    books.push(BookInfo {
                        title: meta.title,
                        path: path_str.clone(),
                        created_time: meta.created_time,
                        updated_time: meta.updated_time,
                    });
                    seen.insert(path_str);
                }
            }
        }
    }

    books.sort_by(|a, b| b.updated_time.cmp(&a.updated_time));
    Ok(books)
}

fn add_to_book_list(app_handle: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let mut config = load_config(app_handle).unwrap_or_default();
    let mut books: Vec<String> = config
        .get("books")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    if !books.iter().any(|b| b == path) {
        books.push(path.to_string());
    }
    config["books"] = serde_json::json!(books);
    save_config(app_handle, &config)
}

fn remove_from_book_list(app_handle: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let mut config = load_config(app_handle).unwrap_or_default();
    let mut books: Vec<String> = config
        .get("books")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    books.retain(|b| b != path);
    config["books"] = serde_json::json!(books);
    save_config(app_handle, &config)
}

fn slugify(title: &str) -> String {
    title
        .to_lowercase()
        .replace(' ', "-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

fn load_meta(book_path: &str) -> Result<BookMeta, String> {
    let meta_path = PathBuf::from(book_path).join(META_FILE);
    let content =
        fs::read_to_string(&meta_path).map_err(|e| format!("Failed to read meta file: {}", e))?;
    let meta: BookMeta =
        serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse meta file: {}", e))?;
    Ok(meta)
}

fn save_meta(book_path: &str, meta: &BookMeta) -> Result<(), String> {
    let mut meta = meta.clone();
    meta.updated_time = current_timestamp();
    let content =
        serde_yaml::to_string(&meta).map_err(|e| format!("Failed to serialize meta: {}", e))?;
    let meta_path = PathBuf::from(book_path).join(META_FILE);
    fs::write(&meta_path, &content).map_err(|e| format!("Failed to write meta file: {}", e))?;
    Ok(())
}

fn chapter_file_path(book_path: &str, chapter_id: &str) -> PathBuf {
    PathBuf::from(book_path)
        .join(CHAPTERS_DIR)
        .join(format!("{}.md", chapter_id))
}


fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn collect_chapter_ids(chapters: &[Chapter]) -> Vec<String> {
    let mut ids = Vec::new();
    for ch in chapters {
        ids.push(ch.id.clone());
        ids.extend(collect_chapter_ids(&ch.chapters));
    }
    ids
}

fn remove_chapter_from_list(chapters: &mut Vec<Chapter>, chapter_id: &str) -> bool {
    if let Some(pos) = chapters.iter().position(|c| c.id == chapter_id) {
        chapters.remove(pos);
        return true;
    }
    for ch in chapters.iter_mut() {
        if remove_chapter_from_list(&mut ch.chapters, chapter_id) {
            return true;
        }
    }
    false
}

fn find_parent<'a>(chapters: &'a mut [Chapter], target_id: &str) -> Option<&'a mut Vec<Chapter>> {
    for ch in chapters.iter_mut() {
        if ch.chapters.iter().any(|c| c.id == target_id) {
            return Some(&mut ch.chapters);
        }
        if let Some(result) = find_parent(&mut ch.chapters, target_id) {
            return Some(result);
        }
    }
    None
}

fn find_chapter_mut<'a>(chapters: &'a mut [Chapter], id: &str) -> Option<&'a mut Chapter> {
    for ch in chapters.iter_mut() {
        if ch.id == id {
            return Some(ch);
        }
        if let Some(found) = find_chapter_mut(&mut ch.chapters, id) {
            return Some(found);
        }
    }
    None
}

#[tauri::command]
pub fn get_books_dir_info(_app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = default_books_dir();
    fs::create_dir_all(&dir).ok();
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_books_dir(app_handle: tauri::AppHandle, dir: String) -> Result<String, String> {
    let path = PathBuf::from(&dir);
    if !path.is_absolute() {
        return Err("Path must be absolute".to_string());
    }
    let mut config = load_config(&app_handle)?;
    config["books_dir"] = serde_json::json!(dir);
    save_config(&app_handle, &config)?;
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))?;
    crate::logger::log_event(&app_handle, "set_books_dir", &format!("changed books directory to {}", dir));
    Ok("".to_string())
}

#[tauri::command]
pub fn list_books(app_handle: tauri::AppHandle) -> Result<Vec<BookInfo>, String> {
    read_book_list(&app_handle)
}

fn validate_folder_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Folder name is empty".to_string());
    }
    if name.contains(|c: char| c.is_ascii_control() || c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|') {
        return Err("Folder name contains invalid characters".to_string());
    }
    if name.starts_with('.') || name.ends_with('.') {
        return Err("Folder name cannot start or end with a dot".to_string());
    }
    if name.len() > 255 {
        return Err("Folder name too long".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn new_book(title: String, app_handle: tauri::AppHandle, book_dir: Option<String>) -> Result<BookInfo, String> {
    let folder_name = slugify(&title);
    let book_path = match &book_dir {
        Some(dir) => {
            let p = PathBuf::from(dir);
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                validate_folder_name(name)?;
            }
            p
        }
        None => default_books_dir().join(&folder_name),
    };

    if book_path.exists() {
        return Err(format!("Book '{}' already exists", title));
    }

    fs::create_dir_all(&book_path)
        .map_err(|e| format!("Failed to create book directory: {}", e))?;

    let now = current_timestamp();
    let meta = BookMeta {
        title: title.clone(),
        created_time: now,
        updated_time: now,
        chapters: vec![],
    };

    let meta_content =
        serde_yaml::to_string(&meta).map_err(|e| format!("Failed to serialize meta: {}", e))?;
    fs::write(book_path.join(META_FILE), &meta_content)
        .map_err(|e| format!("Failed to write meta file: {}", e))?;

    fs::create_dir_all(book_path.join(CHAPTERS_DIR))
        .map_err(|e| format!("Failed to create chapters dir: {}", e))?;

    if let Err(e) = git::git_init(&book_path.to_string_lossy()) {
        eprintln!("Warning: git init failed: {}", e);
    }

    let path_str = book_path.to_string_lossy().to_string();
    add_to_book_list(&app_handle, &path_str)?;

    crate::logger::log_book_event(&app_handle, "create_book", &format!("created '{}'", title), &path_str);

    Ok(BookInfo {
        title,
        path: path_str,
        created_time: now,
        updated_time: now,
    })
}

#[tauri::command]
pub fn delete_book(book_path: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    remove_from_book_list(&app_handle, &book_path)?;
    let path = PathBuf::from(&book_path);
    if path.exists() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete book: {}", e))?;
    }
    crate::logger::log_book_event(&app_handle, "delete_book", &format!("deleted '{}'", book_path), &book_path);
    Ok(())
}

#[tauri::command]
pub fn rename_book(book_path: String, new_title: String, app_handle: tauri::AppHandle) -> Result<BookInfo, String> {
    let mut meta = load_meta(&book_path)?;
    let old_title = meta.title.clone();
    meta.title = new_title;
    save_meta(&book_path, &meta)?;

    crate::logger::log_book_event(&app_handle, "rename_book", &format!("renamed '{}' to '{}'", old_title, meta.title), &book_path);

    let path_str = PathBuf::from(&book_path).to_string_lossy().to_string();
    Ok(BookInfo {
        title: meta.title.clone(),
        path: path_str,
        created_time: meta.created_time,
        updated_time: meta.updated_time,
    })
}

#[tauri::command]
pub fn import_book(folder_path: String, app_handle: tauri::AppHandle) -> Result<BookInfo, String> {
    let path = PathBuf::from(&folder_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }
    let meta_path = path.join(META_FILE);
    if !meta_path.exists() {
        return Err(format!(
            "No gtbook.yaml found in '{}'",
            path.to_string_lossy()
        ));
    }
    let path_str = path.to_string_lossy().to_string();
    let meta = load_meta(&path_str)?;
    add_to_book_list(&app_handle, &path_str)?;
    Ok(BookInfo {
        title: meta.title,
        path: path_str,
        created_time: meta.created_time,
        updated_time: meta.updated_time,
    })
}

#[tauri::command]
pub fn get_book_meta(book_path: String) -> Result<BookMeta, String> {
    load_meta(&book_path)
}

#[tauri::command]
pub fn read_chapter(book_path: String, chapter_id: String) -> Result<String, String> {
    let file_path = chapter_file_path(&book_path, &chapter_id);
    if !file_path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read chapter: {}", e))
}

#[tauri::command]
pub fn write_chapter(book_path: String, chapter_id: String, content: String) -> Result<(), String> {
    let file_path = chapter_file_path(&book_path, &chapter_id);
    fs::create_dir_all(file_path.parent().unwrap())
        .map_err(|e| format!("Failed to create chapters dir: {}", e))?;
    fs::write(&file_path, &content).map_err(|e| format!("Failed to write chapter: {}", e))?;

    let mut meta = load_meta(&book_path)?;
    if let Some(chapter) = find_chapter_mut(&mut meta.chapters, &chapter_id) {
        chapter.updated_time = current_timestamp();
    }
    save_meta(&book_path, &meta)?;

    Ok(())
}

#[tauri::command]
pub fn new_chapter(
    book_path: String,
    parent_id: Option<String>,
    title: String,
    app_handle: tauri::AppHandle,
) -> Result<Chapter, String> {
    let now = current_timestamp();
    let id = Uuid::new_v4().to_string();
    let chapter = Chapter {
        id: id.clone(),
        title: title.clone(),
        created_time: now,
        updated_time: now,
        chapters: vec![],
    };

    let mut meta = load_meta(&book_path)?;

    if let Some(pid) = &parent_id {
        if let Some(parent) = find_chapter_mut(&mut meta.chapters, pid) {
            parent.chapters.push(chapter.clone());
        } else {
            return Err("Parent chapter not found".to_string());
        }
    } else {
        meta.chapters.push(chapter.clone());
    }

    save_meta(&book_path, &meta)?;

    let content = format!("# {}\n", title);
    let file_path = chapter_file_path(&book_path, &id);
    fs::create_dir_all(file_path.parent().unwrap())
        .map_err(|e| format!("Failed to create chapters dir: {}", e))?;
    fs::write(&file_path, &content).map_err(|e| format!("Failed to write chapter file: {}", e))?;

    crate::logger::log_book_event(&app_handle, "create_chapter", &format!("created '{}'", title), &book_path);

    Ok(chapter)
}

#[tauri::command]
pub fn delete_chapter(book_path: String, chapter_id: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut meta = load_meta(&book_path)?;

    let ids_to_delete = {
        let mut ids = Vec::new();
        if let Some(ch) = find_chapter_mut(&mut meta.chapters, &chapter_id) {
            ids.push(chapter_id.clone());
            ids.extend(collect_chapter_ids(&ch.chapters));
        }
        ids
    };

    if ids_to_delete.is_empty() {
        return Err("Chapter not found".to_string());
    }

    for id in &ids_to_delete {
        let file_path = chapter_file_path(&book_path, id);
        if file_path.exists() {
            let _ = fs::remove_file(&file_path);
        }
    }

    remove_chapter_from_list(&mut meta.chapters, &chapter_id);
    save_meta(&book_path, &meta)?;

    crate::logger::log_book_event(&app_handle, "delete_chapter", &format!("deleted chapter {}", chapter_id), &book_path);

    Ok(())
}

#[tauri::command]
pub fn rename_chapter(book_path: String, chapter_id: String, new_title: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut meta = load_meta(&book_path)?;
    if let Some(chapter) = find_chapter_mut(&mut meta.chapters, &chapter_id) {
        chapter.title = new_title;
        chapter.updated_time = current_timestamp();
    } else {
        return Err("Chapter not found".to_string());
    }
    save_meta(&book_path, &meta)?;
    crate::logger::log_book_event(&app_handle, "rename_chapter", &format!("renamed chapter {}", chapter_id), &book_path);
    Ok(())
}

#[tauri::command]
pub fn move_chapter(
    book_path: String,
    chapter_id: String,
    target_id: Option<String>,
    position: String,
) -> Result<(), String> {
    let mut meta = load_meta(&book_path)?;

    let chapter = {
        let mut found = None;
        if let Some(ch) = find_chapter_mut(&mut meta.chapters, &chapter_id) {
            found = Some(ch.clone());
        }
        found.ok_or_else(|| "Chapter not found".to_string())?
    };

    remove_chapter_from_list(&mut meta.chapters, &chapter_id);

    match position.as_str() {
        "before" | "after" => {
            let insert_before = position == "before";
            if let Some(tid) = &target_id {
                let (sibling_list, sibling_idx) =
                    find_sibling_list_and_index(&mut meta.chapters, tid)
                        .ok_or_else(|| "Target chapter not found".to_string())?;
                let idx = if insert_before {
                    sibling_idx
                } else {
                    sibling_idx + 1
                };
                sibling_list.insert(idx.min(sibling_list.len()), chapter);
            } else {
                if insert_before {
                    meta.chapters.insert(0, chapter);
                } else {
                    meta.chapters.push(chapter);
                }
            }
        }
        _ => {
            // default: "inner"
            if let Some(tid) = &target_id {
                if let Some(parent) = find_chapter_mut(&mut meta.chapters, tid) {
                    parent.chapters.push(chapter);
                } else {
                    return Err("Target chapter not found".to_string());
                }
            } else {
                meta.chapters.push(chapter);
            }
        }
    }

    save_meta(&book_path, &meta)?;
    Ok(())
}

fn find_sibling_list_and_index<'a>(
    chapters: &'a mut Vec<Chapter>,
    target_id: &str,
) -> Option<(&'a mut Vec<Chapter>, usize)> {
    if let Some(idx) = chapters.iter().position(|c| c.id == target_id) {
        return Some((chapters, idx));
    }
    for ch in chapters.iter_mut() {
        if let Some(result) = find_sibling_list_and_index(&mut ch.chapters, target_id) {
            return Some(result);
        }
    }
    None
}

#[tauri::command]
pub fn move_chapter_up(book_path: String, chapter_id: String) -> Result<(), String> {
    let mut meta = load_meta(&book_path)?;

    let chapters_list = if let Some(parent) = find_parent(&mut meta.chapters, &chapter_id) {
        parent
    } else {
        &mut meta.chapters
    };

    let pos = chapters_list.iter().position(|c| c.id == chapter_id);
    if let Some(pos) = pos {
        if pos > 0 {
            chapters_list.swap(pos, pos - 1);
        }
    }

    save_meta(&book_path, &meta)?;
    Ok(())
}

#[tauri::command]
pub fn move_chapter_down(book_path: String, chapter_id: String) -> Result<(), String> {
    let mut meta = load_meta(&book_path)?;

    let chapters_list = if let Some(parent) = find_parent(&mut meta.chapters, &chapter_id) {
        parent
    } else {
        &mut meta.chapters
    };

    let pos = chapters_list.iter().position(|c| c.id == chapter_id);
    if let Some(pos) = pos {
        if pos < chapters_list.len() - 1 {
            chapters_list.swap(pos, pos + 1);
        }
    }

    save_meta(&book_path, &meta)?;
    Ok(())
}


#[tauri::command]
pub fn git_status(book_path: String) -> Result<String, String> {
    git::git_status(&book_path)
}

#[tauri::command]
pub fn git_commit(book_path: String, message: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    git::git_commit(&book_path, &message)?;
    crate::logger::log_book_event(&app_handle, "commit", &format!("committed: {}", message), &book_path);
    Ok(())
}

#[tauri::command]
pub fn git_log(book_path: String, max_count: Option<u32>) -> Result<Vec<CommitInfo>, String> {
    git::git_log(&book_path, max_count.unwrap_or(20))
}

#[tauri::command]
pub fn git_remote_url(book_path: String) -> Result<Option<String>, String> {
    git::git_remote_url(&book_path)
}

#[tauri::command]
pub fn git_remote_set_url(book_path: String, url: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    git::git_remote_set_url(&book_path, &url)?;
    crate::logger::log_book_event(&app_handle, "set_remote_url", &format!("set remote url to {}", url), &book_path);
    Ok(())
}

fn run_git_and_emit<F>(
    app_handle: tauri::AppHandle,
    op_type: &'static str,
    book_path: String,
    f: F,
) where
    F: FnOnce() -> Result<String, String> + Send + 'static,
{
    crate::logger::log_book_event(&app_handle, op_type, "started", &book_path);
    let book_path_clone = book_path.clone();
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            // Timeout after 30 seconds using a separate thread
            let (tx, rx) = std::sync::mpsc::channel();
            let handle = std::thread::spawn(move || {
                let _ = tx.send(f());
            });
            match rx.recv_timeout(std::time::Duration::from_secs(30)) {
                Ok(Ok(msg)) => {
                    crate::logger::log_book_event(&app_handle, op_type, &format!("ok: {}", msg), &book_path_clone);
                    let _ = app_handle.emit("git:done", serde_json::json!({"type": op_type, "ok": true, "message": msg, "book_path": book_path_clone}));
                }
                Ok(Err(e)) => {
                    crate::logger::log_book_event(&app_handle, op_type, &format!("failed: {}", e), &book_path_clone);
                    let _ = app_handle.emit("git:done", serde_json::json!({"type": op_type, "ok": false, "message": e, "book_path": book_path_clone}));
                }
                Err(_) => {
                    crate::logger::log_book_event(&app_handle, op_type, "timed out (30s)", &book_path_clone);
                    let _ = app_handle.emit("git:done", serde_json::json!({"type": op_type, "ok": false, "message": "Operation timed out (30s)", "book_path": book_path_clone}));
                }
            }
            let _ = handle.join();
        }));
        if result.is_err() {
            crate::logger::log_book_event(&app_handle, op_type, "crashed", &book_path_clone);
            let _ = app_handle.emit("git:done", serde_json::json!({"type": op_type, "ok": false, "message": "Internal error: operation crashed", "book_path": book_path_clone}));
        }
    });
}

#[tauri::command]
pub fn git_fetch(book_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let bp = book_path.clone();
    run_git_and_emit(app_handle, "fetch", book_path, move || {
        git::git_fetch(&bp)
    });
    Ok("started".to_string())
}

#[tauri::command]
pub fn git_pull(book_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let bp = book_path.clone();
    run_git_and_emit(app_handle, "pull", book_path, move || git::git_pull(&bp));
    Ok("started".to_string())
}

#[tauri::command]
pub fn git_push(book_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let bp = book_path.clone();
    run_git_and_emit(app_handle, "push", book_path, move || git::git_push(&bp));
    Ok("started".to_string())
}

#[tauri::command]
pub fn git_ahead_behind(book_path: String) -> Result<(u32, u32), String> {
    git::git_ahead_behind(&book_path)
}

#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let canonical = p
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    let home = std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .ok_or_else(|| "Cannot determine home directory".to_string())?;
    if !canonical.starts_with(&home) {
        return Err("Access denied: path is outside home directory".to_string());
    }
    let data = fs::read(&canonical).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64_encode(&data))
}

#[tauri::command]
pub fn get_asset_url(book_path: String, rel_path: String) -> Result<String, String> {
    let book_canonical = PathBuf::from(&book_path)
        .canonicalize()
        .map_err(|e| format!("Invalid book path: {}", e))?;
    let full_path = PathBuf::from(&book_path).join(&rel_path);
    let canonical = full_path
        .canonicalize()
        .map_err(|e| format!("Invalid image path: {}", e))?;
    if !canonical.starts_with(&book_canonical) {
        return Err("Access denied: image path is outside book directory".to_string());
    }
    Ok(canonical.to_string_lossy().to_string())
}

fn base64_encode(data: &[u8]) -> String {
    use std::fmt::Write;
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(&path).exists())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        // Open parent directory
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| format!("Failed to open: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn download_image_url(book_path: String, url: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let assets_dir = PathBuf::from(&book_path).join("assets");
    fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;

    let response = reqwest::blocking::get(&url)
        .map_err(|e| format!("Failed to download image: {}", e))?;

    // Determine extension from content-type or URL (before consuming response)
    let ext = {
        let ct_hint = response.headers().get("content-type").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
        if let Some(ct) = ct_hint {
            match ct.as_str() {
                s if s.contains("png") => "png".to_string(),
                s if s.contains("jpeg") || s.contains("jpg") => "jpg".to_string(),
                s if s.contains("gif") => "gif".to_string(),
                s if s.contains("webp") => "webp".to_string(),
                s if s.contains("svg") => "svg".to_string(),
                _ => "png".to_string(),
            }
        } else if let Ok(parsed) = url::Url::parse(&url) {
            let path = parsed.path().to_string();
            PathBuf::from(&path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png")
                .to_lowercase()
        } else {
            "png".to_string()
        }
    };

    let bytes = response
        .bytes()
        .map_err(|e| format!("Failed to read image data: {}", e))?;

    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let dest = assets_dir.join(&filename);
    fs::write(&dest, &bytes).map_err(|e| format!("Failed to write image: {}", e))?;

    crate::logger::log_book_event(&app_handle, "download_image", &format!("downloaded from {}", url), &book_path);
    Ok(format!("assets/{}", filename))
}

#[tauri::command]
pub fn save_image_data(book_path: String, data_base64: String, ext: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let assets_dir = PathBuf::from(&book_path).join("assets");
    fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;

    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let dest = assets_dir.join(&filename);

    let bytes = base64_decode(&data_base64)?;
    fs::write(&dest, &bytes).map_err(|e| format!("Failed to write image: {}", e))?;

    crate::logger::log_book_event(&app_handle, "paste_image", &format!("saved pasted image {}", filename), &book_path);
    Ok(format!("assets/{}", filename))
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let clean: String = input.chars().filter(|c| *c != '=' && !c.is_whitespace()).collect();
    let mut result = Vec::new();
    let bytes: Vec<u8> = clean.bytes().collect();
    for chunk in bytes.chunks(4) {
        if chunk.len() < 4 {
            break;
        }
        let mut val = 0u32;
        for &b in chunk {
            if let Some(pos) = CHARS.iter().position(|&c| c == b) {
                val = (val << 6) | pos as u32;
            }
        }
        let shift = (4 - chunk.len()) * 6;
        val >>= shift;
        result.push((val >> 16) as u8);
        if chunk.len() > 2 {
            result.push((val >> 8) as u8);
        }
        if chunk.len() > 3 {
            result.push(val as u8);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn save_image_to_book(book_path: String, source_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let assets_dir = PathBuf::from(&book_path).join("assets");
    fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;

    let ext = PathBuf::from(&source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let dest = assets_dir.join(&filename);

    fs::copy(&source_path, &dest)
        .map_err(|e| format!("Failed to copy image: {}", e))?;

    crate::logger::log_book_event(&app_handle, "import_image", &format!("imported image {}", filename), &book_path);
    Ok(format!("assets/{}", filename))
}

#[tauri::command]
pub fn git_get_proxy(book_path: String) -> Result<String, String> {
    git::git_get_proxy(&book_path)
}

#[tauri::command]
pub fn git_set_proxy(book_path: String, proxy: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    git::git_set_proxy(&book_path, &proxy)?;
    crate::logger::log_book_event(&app_handle, "set_proxy", &format!("set proxy to {}", proxy), &book_path);
    Ok(())
}

#[tauri::command]
pub fn git_user_config(book_path: String) -> Result<(String, String), String> {
    git::git_user_config(&book_path)
}

#[tauri::command]
pub fn git_set_user_config(book_path: String, name: String, email: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    git::git_set_user_config(&book_path, &name, &email)?;
    crate::logger::log_book_event(&app_handle, "set_git_config", &format!("set user: {} <{}>", name, email), &book_path);
    Ok(())
}

#[tauri::command]
pub fn get_global_git_user() -> Result<(String, String), String> {
    let config = git2::Config::open_default().map_err(|e| format!("Config error: {}", e))?;
    let name = config.get_string("user.name").unwrap_or_default();
    let email = config.get_string("user.email").unwrap_or_default();
    Ok((name, email))
}

#[tauri::command]
pub fn set_global_git_user(name: String, email: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut config = git2::Config::open_default().map_err(|e| format!("Config error: {}", e))?;
    config.set_str("user.name", &name).map_err(|e| format!("Failed to set user.name: {}", e))?;
    config.set_str("user.email", &email).map_err(|e| format!("Failed to set user.email: {}", e))?;
    crate::logger::log_event(&app_handle, "set_global_git_user", &format!("set git user: {} <{}>", name, email));
    Ok(())
}

#[tauri::command]
pub fn get_proxy_setting(app_handle: tauri::AppHandle) -> Result<String, String> {
    let config = load_config(&app_handle).unwrap_or_default();
    Ok(config.get("proxy").and_then(|v| v.as_str()).unwrap_or("").to_string())
}

#[tauri::command]
pub fn set_proxy_setting(app_handle: tauri::AppHandle, proxy: String) -> Result<(), String> {
    let mut config = load_config(&app_handle).unwrap_or_default();
    if proxy.is_empty() {
        config.as_object_mut().map(|m| m.remove("proxy"));
        // Also remove from git global config
        if let Ok(mut git_cfg) = git2::Config::open_default() {
            let _ = git_cfg.remove("http.proxy");
        }
    } else {
        config["proxy"] = serde_json::json!(proxy);
        // Also set in git global config so git2-rs picks it up
        if let Ok(mut git_cfg) = git2::Config::open_default() {
            let _ = git_cfg.set_str("http.proxy", &proxy);
        }
    }
    save_config(&app_handle, &config)?;
    crate::logger::log_event(&app_handle, "set_proxy_setting", &format!("proxy set to '{}'", if proxy.is_empty() { "none" } else { &proxy }));
    Ok(())
}

#[tauri::command]
pub fn git_list_conflicted(book_path: String) -> Result<Vec<String>, String> {
    git::git_list_conflicted(&book_path)
}

#[tauri::command]
pub fn attempt_merge(
    book_path: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let bp = book_path.clone();
    run_git_and_emit(app_handle, "merge", book_path, move || {
        let conflicted = git::git_attempt_merge(&bp)?;
        if conflicted.is_empty() {
            Ok("Merged successfully.".to_string())
        } else {
            Ok(format!("conflicts:{}", conflicted.join(",")))
        }
    });
    Ok("started".to_string())
}

#[tauri::command]
pub fn resolve_conflict(
    book_path: String,
    file_path: String,
    use_theirs: bool,
) -> Result<String, String> {
    git::git_resolve_conflict(&book_path, &file_path, use_theirs)
}

#[tauri::command]
pub fn read_logs(
    limit: usize,
    app_handle: tauri::AppHandle,
) -> Vec<serde_json::Value> {
    crate::logger::read_logs(&app_handle, limit)
}

#[tauri::command]
pub fn read_book_logs(
    limit: usize,
    book_path: String,
    app_handle: tauri::AppHandle,
) -> Vec<serde_json::Value> {
    crate::logger::read_book_logs(&app_handle, limit, &book_path)
}

#[tauri::command]
pub fn start_search(
    book_paths: Vec<String>,
    query: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    std::thread::spawn(move || {
        for book_path in &book_paths {
            // Read meta
            let meta = match load_meta(book_path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            for chapter in flatten_chapters(&meta.chapters) {
                let query_lower = query.to_lowercase();
                let mut matches = Vec::new();

                // Check chapter title
                if chapter.title.to_lowercase().contains(&query_lower) {
                    matches.push(crate::models::SearchLine {
                        line: 0,
                        text: format!("# {}", chapter.title),
                    });
                }

                // Check content
                let file_path = chapter_file_path(book_path, &chapter.id);
                if file_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&file_path) {
                        for (line_no, line) in content.lines().enumerate() {
                            if line.to_lowercase().contains(&query_lower) {
                                matches.push(crate::models::SearchLine {
                                    line: line_no + 1,
                                    text: line.trim().to_string(),
                                });
                            }
                        }
                    }
                }

                if !matches.is_empty() {
                    let _ = app_handle.emit(
                        "search:progress",
                        serde_json::json!({
                            "book_path": book_path,
                            "book_title": meta.title,
                            "chapter_id": chapter.id,
                            "chapter_title": chapter.title,
                            "matches": matches,
                        }),
                    );
                }
            }
        }
        let _ = app_handle.emit("search:done", serde_json::json!({}));
    });
    Ok("started".to_string())
}
