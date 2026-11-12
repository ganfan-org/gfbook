use std::fs;
use std::path::PathBuf;

use tauri::{Emitter, Manager};
use uuid::Uuid;

use crate::git;
use crate::models::{BookInfo, BookMeta, Chapter, CommitInfo, flatten_chapters};

const META_FILE: &str = "gfbook.yaml";
const CHAPTERS_DIR: &str = "chapters";
const CONFIG_FILE: &str = "gfbook-config.json";

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
    PathBuf::from(home).join("gfbooks")
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
        schema_version: 1,
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
            "No gfbook.yaml found in '{}'",
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

// ═══════════════════════════════════════════
// Markdown 目录导入
// ═══════════════════════════════════════════
const MARKDOWN_EXTS: &[&str] = &["md", "markdown"];
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "tif", "tiff"];

#[derive(serde::Serialize)]
pub struct MdScanFile {
    pub path: String,
    pub title: String,
    pub is_index: bool,
}

#[derive(serde::Serialize)]
pub struct MdScanDir {
    pub path: String,
    pub name: String,
    pub files: Vec<MdScanFile>,
    pub children: Vec<MdScanDir>,
    /// 含子目录的累计数量
    pub md_count: usize,
    pub image_count: usize,
}

#[derive(serde::Serialize)]
pub struct MdScan {
    pub root_name: String,
    pub root_path: String,
    pub md_count: usize,
    pub image_count: usize,
    pub tree: MdScanDir,
}

fn is_markdown_file(path: &PathBuf) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_image_file(path: &PathBuf) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_index_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower == "index.md" || lower == "readme.md" || lower == "index.markdown" || lower == "readme.markdown"
}

fn is_ignored_dir_name(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

fn file_name_of(path: &PathBuf) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn natural_key(name: &str) -> (u64, String) {
    let digits: String = name.chars().take_while(|c| c.is_ascii_digit()).collect();
    let num = digits.parse::<u64>().unwrap_or(u64::MAX);
    (num, name.to_lowercase())
}

/// 去掉文件名开头的序号（如 `01-`、`2.`、`3_`），得到更干净的标题
fn tidy_title(raw: &str) -> String {
    let trimmed = raw.trim();
    let stripped = trimmed
        .trim_start_matches(|c: char| c.is_ascii_digit())
        .trim_start_matches(|c: char| c == '-' || c == '_' || c == '.' || c == '、' || c.is_whitespace());
    let title = if stripped.is_empty() { trimmed } else { stripped };
    title.trim().to_string()
}

/// 取 Markdown 第一个 H1 作为标题，跳过 YAML front matter
fn extract_md_title(content: &str) -> Option<String> {
    let mut in_front_matter = false;
    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if index == 0 && trimmed == "---" {
            in_front_matter = true;
            continue;
        }
        if in_front_matter {
            if trimmed == "---" {
                in_front_matter = false;
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("# ") {
            let title = rest.trim().trim_end_matches('#').trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }
    None
}

fn sorted_md_files(dir: &PathBuf) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_file() && is_markdown_file(p))
                .collect()
        })
        .unwrap_or_default();
    files.sort_by(|a, b| {
        let an = file_name_of(a);
        let bn = file_name_of(b);
        is_index_name(&bn)
            .cmp(&is_index_name(&an))
            .then_with(|| natural_key(&an).cmp(&natural_key(&bn)))
    });
    files
}

fn raw_subdirs(dir: &PathBuf) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir() && !is_ignored_dir_name(&file_name_of(p)))
                .collect()
        })
        .unwrap_or_default();
    dirs.sort_by(|a, b| natural_key(&file_name_of(a)).cmp(&natural_key(&file_name_of(b))));
    dirs
}

/// 目录（含子目录）里是否有 Markdown；纯图片目录不生成章节
fn dir_has_markdown(dir: &PathBuf) -> bool {
    if !sorted_md_files(dir).is_empty() {
        return true;
    }
    raw_subdirs(dir).iter().any(|sub| dir_has_markdown(sub))
}

fn sorted_subdirs(dir: &PathBuf) -> Vec<PathBuf> {
    raw_subdirs(dir)
        .into_iter()
        .filter(|sub| dir_has_markdown(sub))
        .collect()
}

fn join_rel(rel: &str, name: &str) -> String {
    if rel.is_empty() {
        name.to_string()
    } else {
        format!("{}/{}", rel, name)
    }
}

fn scan_dir_recursive(dir: &PathBuf, rel: &str) -> Result<MdScanDir, String> {
    let name = file_name_of(dir);
    let mut image_count = fs::read_dir(dir)
        .map(|entries| entries.flatten().filter(|e| is_image_file(&e.path())).count())
        .unwrap_or(0);
    let mut files = Vec::new();
    for file in sorted_md_files(dir) {
        let content = fs::read_to_string(&file).unwrap_or_default();
        let stem = file
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        files.push(MdScanFile {
            path: join_rel(rel, &file_name_of(&file)),
            title: extract_md_title(&content).unwrap_or_else(|| tidy_title(&stem)),
            is_index: is_index_name(&file_name_of(&file)),
        });
    }

    let mut children = Vec::new();
    let mut md_count = files.len();
    for sub in raw_subdirs(dir) {
        let sub_name = file_name_of(&sub);
        let child = scan_dir_recursive(&sub, &join_rel(rel, &sub_name))?;
        md_count += child.md_count;
        image_count += child.image_count;
        // 纯图片目录不出现在目录树里，但图片数仍然计入
        if child.md_count > 0 {
            children.push(child);
        }
    }

    Ok(MdScanDir {
        path: rel.to_string(),
        name,
        files,
        children,
        md_count,
        image_count,
    })
}

/// 预览一个普通 Markdown 目录：统计篇数/图片数并返回目录树
#[tauri::command]
pub fn scan_markdown_dir(source_path: String) -> Result<MdScan, String> {
    let root = PathBuf::from(&source_path);
    if !root.is_dir() {
        return Err("目录不存在".to_string());
    }
    let tree = scan_dir_recursive(&root, "")?;
    Ok(MdScan {
        root_name: file_name_of(&root),
        root_path: source_path,
        md_count: tree.md_count,
        image_count: tree.image_count,
        tree,
    })
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(value) = u8::from_str_radix(hex, 16) {
                    out.push(value);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn sanitize_asset_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-').to_string();
    if trimmed.is_empty() || trimmed == "." {
        "image".to_string()
    } else {
        trimmed
    }
}

struct ImportAssets {
    root: PathBuf,
    assets_dir: PathBuf,
    used: std::collections::HashSet<String>,
    copied: std::collections::HashMap<String, String>,
}

impl ImportAssets {
    fn new(root: &PathBuf, assets_dir: &PathBuf) -> Self {
        Self {
            root: root.clone(),
            assets_dir: assets_dir.clone(),
            used: std::collections::HashSet::new(),
            copied: std::collections::HashMap::new(),
        }
    }

    fn copy_image(&mut self, path: &PathBuf) -> Option<String> {
        let canonical = path.canonicalize().ok()?;
        let key = canonical.to_string_lossy().to_string();
        if let Some(existing) = self.copied.get(&key) {
            return Some(existing.clone());
        }
        let file_name = sanitize_asset_name(&file_name_of(&canonical));
        let (stem, ext) = match file_name.rfind('.') {
            Some(dot) if dot > 0 => (file_name[..dot].to_string(), file_name[dot..].to_string()),
            _ => (file_name.clone(), String::new()),
        };
        let mut name = file_name;
        let mut n = 2;
        while !self.used.insert(name.to_lowercase()) {
            name = format!("{}-{}{}", stem, n, ext);
            n += 1;
        }
        fs::create_dir_all(&self.assets_dir).ok()?;
        fs::copy(&canonical, self.assets_dir.join(&name)).ok()?;
        let rel = format!("assets/{}", name);
        self.copied.insert(key, rel.clone());
        Some(rel)
    }

    /// 把 Markdown 中的图片引用复制到 assets/ 并返回新的相对路径
    fn resolve_href(&mut self, href: &str, base_dir: &PathBuf) -> Option<String> {
        let href = href.trim();
        if href.is_empty() {
            return None;
        }
        let lower = href.to_lowercase();
        if lower.starts_with("http:")
            || lower.starts_with("https:")
            || lower.starts_with("data:")
            || lower.starts_with("mailto:")
            || lower.starts_with("//")
            || lower.starts_with('#')
        {
            return None;
        }
        let clean = href.split('#').next().unwrap_or("").split('?').next().unwrap_or("");
        if clean.is_empty() {
            return None;
        }
        let decoded = percent_decode(clean);
        let relative = decoded.trim_start_matches("./");
        if relative.starts_with('/') || relative.starts_with('\\') {
            return None;
        }
        let candidates = [base_dir.join(relative), self.root.join(relative)];
        for candidate in candidates.iter() {
            if candidate.is_file() && is_image_file(candidate) {
                return self.copy_image(candidate);
            }
        }
        None
    }
}

/// 改写 Markdown 图片语法 `![alt](src)` 中的 src
fn rewrite_md_img_syntax(
    tail: &str,
    base_dir: &PathBuf,
    assets: &mut ImportAssets,
) -> Option<(String, usize)> {
    let close_bracket = tail.find(']')?;
    if !tail[close_bracket + 1..].starts_with('(') {
        return None;
    }
    let inner_start = close_bracket + 2;
    let close_paren = inner_start + tail[inner_start..].find(')')?;
    let inner = &tail[inner_start..close_paren];
    let leading = inner.len() - inner.trim_start().len();
    let trimmed = inner.trim_start();
    if trimmed.is_empty() {
        return None;
    }
    let (href_start, href_end) = if trimmed.starts_with('<') {
        let end = trimmed.find('>')?;
        (inner_start + leading + 1, inner_start + leading + end)
    } else {
        let end = trimmed
            .find(|c: char| c.is_whitespace())
            .unwrap_or(trimmed.len());
        (inner_start + leading, inner_start + leading + end)
    };
    let href = &tail[href_start..href_end];
    let replaced = assets.resolve_href(href, base_dir)?;
    let mut piece = String::with_capacity(close_paren + 1);
    piece.push_str(&tail[..href_start]);
    piece.push_str(&replaced);
    piece.push_str(&tail[href_end..=close_paren]);
    Some((piece, close_paren + 1))
}

/// 改写 HTML `<img src="...">` 中的 src
fn rewrite_html_img_tag(
    tail: &str,
    base_dir: &PathBuf,
    assets: &mut ImportAssets,
) -> Option<(String, usize)> {
    let gt = tail.find('>')?;
    let tag = &tail[..gt];
    let src_pos = tag.to_lowercase().find("src=")?;
    let after = &tag[src_pos + 4..];
    let first = after.chars().next()?;
    let (value_start, value_end) = if first == '"' || first == '\'' {
        let rest = &after[first.len_utf8()..];
        let end = rest.find(first)?;
        (src_pos + 4 + first.len_utf8(), src_pos + 4 + first.len_utf8() + end)
    } else {
        let end = after
            .find(|c: char| c.is_whitespace() || c == '>' || c == '/')
            .unwrap_or(after.len());
        (src_pos + 4, src_pos + 4 + end)
    };
    let href = &tag[value_start..value_end];
    let replaced = assets.resolve_href(href, base_dir)?;
    let mut piece = String::with_capacity(gt + 1);
    piece.push_str(&tail[..value_start]);
    piece.push_str(&replaced);
    piece.push_str(&tail[value_end..=gt]);
    Some((piece, gt + 1))
}

fn rewrite_md_images(content: &str, base_dir: &PathBuf, assets: &mut ImportAssets) -> String {
    let mut out = String::with_capacity(content.len());
    let mut rest = content;
    loop {
        let next = match (rest.find("!["), rest.find("<img")) {
            (None, None) => {
                out.push_str(rest);
                break;
            }
            (Some(a), None) => (a, false),
            (None, Some(b)) => (b, true),
            (Some(a), Some(b)) => {
                if a <= b {
                    (a, false)
                } else {
                    (b, true)
                }
            }
        };
        let (pos, is_html) = next;
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let rewritten = if is_html {
            rewrite_html_img_tag(tail, base_dir, assets)
        } else {
            rewrite_md_img_syntax(tail, base_dir, assets)
        };
        match rewritten {
            Some((piece, consumed)) => {
                out.push_str(&piece);
                rest = &tail[consumed..];
            }
            None => {
                let ch = tail.chars().next().unwrap_or('\u{fffd}');
                out.push(ch);
                rest = &tail[ch.len_utf8()..];
            }
        }
    }
    out
}

fn write_imported_chapter(book_path: &PathBuf, id: &str, content: &str) -> Result<(), String> {
    let dir = book_path.join(CHAPTERS_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create chapters dir: {}", e))?;
    fs::write(dir.join(format!("{}.md", id)), content)
        .map_err(|e| format!("Failed to write chapter: {}", e))
}

fn make_chapter_from_file(
    book_path: &PathBuf,
    file: &PathBuf,
    base_dir: &PathBuf,
    now: u64,
    assets: &mut ImportAssets,
) -> Result<Chapter, String> {
    let raw = fs::read_to_string(file)
        .map_err(|e| format!("Failed to read {}: {}", file.display(), e))?;
    let stem = file
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let title = extract_md_title(&raw).unwrap_or_else(|| tidy_title(&stem));
    let mut content = rewrite_md_images(&raw, base_dir, assets);
    if !content.ends_with('\n') {
        content.push('\n');
    }
    let id = Uuid::new_v4().to_string();
    write_imported_chapter(book_path, &id, &content)?;
    Ok(Chapter {
        id,
        title,
        created_time: now,
        updated_time: now,
        chapters: vec![],
    })
}

fn import_markdown_tree(
    book_path: &PathBuf,
    src_dir: &PathBuf,
    is_root: bool,
    now: u64,
    assets: &mut ImportAssets,
) -> Result<Vec<Chapter>, String> {
    let md_files = sorted_md_files(src_dir);
    let mut chapters = Vec::new();

    if is_root {
        for file in &md_files {
            chapters.push(make_chapter_from_file(book_path, file, src_dir, now, assets)?);
        }
    } else {
        let dir_title = tidy_title(&file_name_of(src_dir));
        let index_file = md_files.iter().find(|f| is_index_name(&file_name_of(f))).cloned();

        let (title, mut content) = match &index_file {
            Some(file) => {
                let raw = fs::read_to_string(file).unwrap_or_default();
                let title = extract_md_title(&raw).unwrap_or_else(|| dir_title.clone());
                (title, rewrite_md_images(&raw, src_dir, assets))
            }
            None => (dir_title.clone(), format!("# {}\n", dir_title)),
        };
        if !content.ends_with('\n') {
            content.push('\n');
        }
        let id = Uuid::new_v4().to_string();
        write_imported_chapter(book_path, &id, &content)?;
        let mut group = Chapter {
            id,
            title,
            created_time: now,
            updated_time: now,
            chapters: vec![],
        };

        for file in &md_files {
            if Some(file) == index_file.as_ref() {
                continue;
            }
            group
                .chapters
                .push(make_chapter_from_file(book_path, file, src_dir, now, assets)?);
        }
        for sub in sorted_subdirs(src_dir) {
            group
                .chapters
                .extend(import_markdown_tree(book_path, &sub, false, now, assets)?);
        }
        chapters.push(group);
    }

    if is_root {
        for sub in sorted_subdirs(src_dir) {
            chapters.extend(import_markdown_tree(book_path, &sub, false, now, assets)?);
        }
    }

    Ok(chapters)
}

/// 把普通 Markdown 目录导入为新书：每个 .md 成为一个章节，子目录成为分组章节，图片复制到 assets/
#[tauri::command]
pub fn import_markdown_dir(
    source_path: String,
    title: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<BookInfo, String> {
    let src = PathBuf::from(&source_path);
    if !src.is_dir() {
        return Err("目录不存在".to_string());
    }
    if src.join(META_FILE).exists() {
        return Err("该目录已经是一本书（含 gfbook.yaml），请使用「导入书」".to_string());
    }

    let scan = scan_dir_recursive(&src, "")?;
    if scan.md_count == 0 {
        return Err("目录中没有找到 Markdown 文件".to_string());
    }

    let book_title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| {
            let name = file_name_of(&src);
            if name.is_empty() {
                "Imported Book".to_string()
            } else {
                name
            }
        });

    let mut slug = slugify(&book_title);
    if slug.is_empty() {
        slug = format!("book-{}", current_timestamp());
    }
    let book_path = default_books_dir().join(&slug);
    if book_path.exists() {
        return Err(format!("书库中已存在同名目录：{}", slug));
    }

    fs::create_dir_all(book_path.join(CHAPTERS_DIR))
        .map_err(|e| format!("Failed to create chapters dir: {}", e))?;
    fs::create_dir_all(book_path.join("assets"))
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;

    let now = current_timestamp();
    let mut assets = ImportAssets::new(&src, &book_path.join("assets"));

    // 导入中途失败时清理半成品目录，便于用户修正后重试
    let mut build_book = || -> Result<(), String> {
        let chapters = import_markdown_tree(&book_path, &src, true, now, &mut assets)?;
        let meta = BookMeta {
            title: book_title.clone(),
            schema_version: 1,
            created_time: now,
            updated_time: now,
            chapters,
        };
        let meta_content =
            serde_yaml::to_string(&meta).map_err(|e| format!("Failed to serialize meta: {}", e))?;
        fs::write(book_path.join(META_FILE), &meta_content)
            .map_err(|e| format!("Failed to write meta file: {}", e))?;
        Ok(())
    };
    if let Err(error) = build_book() {
        fs::remove_dir_all(&book_path).ok();
        return Err(error);
    }

    if let Err(e) = git::git_init(&book_path.to_string_lossy()) {
        eprintln!("Warning: git init failed: {}", e);
    }

    let path_str = book_path.to_string_lossy().to_string();
    add_to_book_list(&app_handle, &path_str)?;
    crate::logger::log_book_event(
        &app_handle,
        "import_markdown",
        &format!(
            "imported {} markdown files from {}",
            scan.md_count, source_path
        ),
        &path_str,
    );

    Ok(BookInfo {
        title: book_title,
        path: path_str,
        created_time: now,
        updated_time: now,
    })
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

// ═══════════════════════════════════════════
// 导出静态站点
// ═══════════════════════════════════════════
#[derive(serde::Deserialize)]
pub struct ExportFile {
    pub path: String,
    pub content: String,
}

#[derive(serde::Deserialize)]
pub struct ExportBinary {
    pub path: String,
    pub data_base64: String,
}

#[derive(serde::Deserialize)]
pub struct ExportAsset {
    pub book_path: String,
    pub src: String,
    pub dest: String,
}

#[derive(serde::Serialize)]
pub struct ExportSummary {
    pub files_written: usize,
    pub assets_copied: usize,
    pub missing_assets: Vec<String>,
}

/// 拒绝绝对路径与 `..`，确保写入不会逃出输出目录
fn safe_relative_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if path.is_absolute() {
        return Err(format!("Invalid export path: {}", raw));
    }
    for component in path.components() {
        match component {
            std::path::Component::Normal(_) => {}
            _ => return Err(format!("Invalid export path: {}", raw)),
        }
    }
    Ok(path)
}

fn write_export_file(root: &PathBuf, rel: &str, bytes: &[u8]) -> Result<(), String> {
    let dest = root.join(safe_relative_path(rel)?);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }
    fs::write(&dest, bytes).map_err(|e| format!("Failed to write {}: {}", dest.display(), e))
}

fn resolve_asset_source(book_path: &PathBuf, src: &str) -> Option<PathBuf> {
    let normalized = src.trim_start_matches("@/").trim_start_matches('/');
    let rel = PathBuf::from(normalized);
    let base = rel.file_name()?.to_string_lossy().to_string();
    let candidates = [
        book_path.join(&rel),
        book_path.join("assets").join(&base),
        book_path.join("chapters").join(&base),
        book_path.join("chapters").join(&rel),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

#[tauri::command]
pub fn export_site(
    output_dir: String,
    files: Vec<ExportFile>,
    binaries: Vec<ExportBinary>,
    assets: Vec<ExportAsset>,
) -> Result<ExportSummary, String> {
    let root = PathBuf::from(&output_dir);
    fs::create_dir_all(&root)
        .map_err(|e| format!("Failed to create output dir: {}", e))?;

    let mut files_written = 0;
    for file in &files {
        write_export_file(&root, &file.path, file.content.as_bytes())?;
        files_written += 1;
    }

    for binary in &binaries {
        let bytes = base64_decode(&binary.data_base64)?;
        write_export_file(&root, &binary.path, &bytes)?;
        files_written += 1;
    }

    let mut assets_copied = 0;
    let mut missing_assets: Vec<String> = Vec::new();
    for asset in &assets {
        let book_path = PathBuf::from(&asset.book_path);
        match resolve_asset_source(&book_path, &asset.src) {
            Some(source) => {
                let dest = root.join(safe_relative_path(&asset.dest)?);
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
                }
                fs::copy(&source, &dest).map_err(|e| {
                    format!("Failed to copy {}: {}", source.display(), e)
                })?;
                assets_copied += 1;
            }
            None => missing_assets.push(asset.src.clone()),
        }
    }

    Ok(ExportSummary {
        files_written,
        assets_copied,
        missing_assets,
    })
}

// ═══════════════════════════════════════════
// 导出模板（书库内 .gfbook/templates/ 可覆盖）
// ═══════════════════════════════════════════
#[derive(serde::Serialize, Default)]
pub struct SiteTemplates {
    pub chapter: Option<String>,
    pub book: Option<String>,
    pub home: Option<String>,
    pub css: Option<String>,
}

fn read_template(dir: &PathBuf, name: &str) -> Option<String> {
    fs::read_to_string(dir.join(name)).ok()
}

/// 读取书库根目录下 `.gfbook/templates/` 的自定义导出模板；缺失的文件返回 None，由前端回退到内置模板
#[tauri::command]
pub fn read_site_templates() -> SiteTemplates {
    let dir = default_books_dir().join(".gfbook").join("templates");
    SiteTemplates {
        chapter: read_template(&dir, "chapter.html"),
        book: read_template(&dir, "book.html"),
        home: read_template(&dir, "home.html"),
        css: read_template(&dir, "style.css"),
    }
}

const EXAMPLE_TEMPLATES: &[(&str, &str)] = &[
    ("chapter.html", include_str!("../templates/example/chapter.html")),
    ("book.html", include_str!("../templates/example/book.html")),
    ("home.html", include_str!("../templates/example/home.html")),
    ("style.css", include_str!("../templates/example/style.css")),
];

/// 安装内置示例模板到 `<书库>/.gfbook/templates/`；已有同名文件时拒绝覆盖
#[tauri::command]
pub fn install_example_templates() -> Result<String, String> {
    let dir = default_books_dir().join(".gfbook").join("templates");
    let existing: Vec<&str> = EXAMPLE_TEMPLATES
        .iter()
        .map(|(name, _)| *name)
        .filter(|name| dir.join(name).exists())
        .collect();
    if !existing.is_empty() {
        return Err(format!(
            "已存在模板文件：{}，请先备份或移走后再安装",
            existing.join("、")
        ));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create template dir: {}", e))?;
    for (name, content) in EXAMPLE_TEMPLATES {
        fs::write(dir.join(name), content)
            .map_err(|e| format!("Failed to write {}: {}", name, e))?;
    }
    Ok(dir.to_string_lossy().to_string())
}

