use std::fs;
use std::path::PathBuf;

use tauri::Manager;
use uuid::Uuid;

use crate::git;
use crate::models::{BookInfo, BookMeta, Chapter, CommitInfo};

const META_FILE: &str = "gtbook.yaml";
const CHAPTERS_DIR: &str = "chapters";

fn get_books_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let books_dir = data_dir.join("books");
    fs::create_dir_all(&books_dir).map_err(|e| format!("Failed to create books dir: {}", e))?;
    Ok(books_dir)
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
pub fn list_books(app_handle: tauri::AppHandle) -> Result<Vec<BookInfo>, String> {
    let books_dir = get_books_dir(&app_handle)?;
    let mut books = Vec::new();

    let entries = fs::read_dir(&books_dir).map_err(|e| format!("Failed to read books dir: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let meta_path = path.join(META_FILE);
        if !meta_path.exists() {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();
        match load_meta(&path_str) {
            Ok(meta) => books.push(BookInfo {
                title: meta.title,
                path: path_str,
                created_time: meta.created_time,
                updated_time: meta.updated_time,
            }),
            Err(_) => continue,
        }
    }

    books.sort_by(|a, b| b.updated_time.cmp(&a.updated_time));
    Ok(books)
}

#[tauri::command]
pub fn new_book(title: String, app_handle: tauri::AppHandle) -> Result<BookInfo, String> {
    let books_dir = get_books_dir(&app_handle)?;
    let folder_name = title
        .to_lowercase()
        .replace(' ', "-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>();
    let book_path = books_dir.join(&folder_name);

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
    Ok(BookInfo {
        title,
        path: path_str,
        created_time: now,
        updated_time: now,
    })
}

#[tauri::command]
pub fn delete_book(book_path: String) -> Result<(), String> {
    let path = PathBuf::from(&book_path);
    if !path.exists() {
        return Err("Book not found".to_string());
    }
    fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete book: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn rename_book(book_path: String, new_title: String) -> Result<BookInfo, String> {
    let mut meta = load_meta(&book_path)?;
    meta.title = new_title;
    save_meta(&book_path, &meta)?;

    let path_str = PathBuf::from(&book_path).to_string_lossy().to_string();
    Ok(BookInfo {
        title: meta.title.clone(),
        path: path_str,
        created_time: meta.created_time,
        updated_time: meta.updated_time,
    })
}

#[tauri::command]
pub fn import_book(folder_path: String) -> Result<BookInfo, String> {
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

    Ok(chapter)
}

#[tauri::command]
pub fn delete_chapter(book_path: String, chapter_id: String) -> Result<(), String> {
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

    Ok(())
}

#[tauri::command]
pub fn rename_chapter(book_path: String, chapter_id: String, new_title: String) -> Result<(), String> {
    let mut meta = load_meta(&book_path)?;
    if let Some(chapter) = find_chapter_mut(&mut meta.chapters, &chapter_id) {
        chapter.title = new_title;
        chapter.updated_time = current_timestamp();
    } else {
        return Err("Chapter not found".to_string());
    }
    save_meta(&book_path, &meta)?;
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
pub fn git_commit(book_path: String, message: String) -> Result<(), String> {
    git::git_commit(&book_path, &message)
}

#[tauri::command]
pub fn git_log(book_path: String, max_count: Option<u32>) -> Result<Vec<CommitInfo>, String> {
    git::git_log(&book_path, max_count.unwrap_or(20))
}
