use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use crate::error::{io_error, AppError};
use crate::models::{BookKind, BookMeta, Chapter};

pub const META_FILE: &str = "gfbook.yaml";
pub const CHAPTERS_DIR: &str = "chapters";

// ═══════════════════════════════════════════
// 按书路径串行化写入
// ═══════════════════════════════════════════

type BookLock = Arc<Mutex<()>>;
static BOOK_LOCKS: OnceLock<Mutex<HashMap<PathBuf, BookLock>>> = OnceLock::new();

fn book_locks() -> &'static Mutex<HashMap<PathBuf, BookLock>> {
    BOOK_LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_key(book_path: &str) -> PathBuf {
    let path = PathBuf::from(book_path);
    if let Ok(canonical) = fs::canonicalize(&path) {
        return canonical;
    }
    // 目录尚不存在时（如新建书），用规范化后的父目录 + 目录名作为 key，
    // 保证创建前后拿到同一把锁。
    if let (Some(parent), Some(name)) = (path.parent(), path.file_name()) {
        if let Ok(canonical_parent) = fs::canonicalize(parent) {
            return canonical_parent.join(name);
        }
    }
    path
}

/// 同一本书的写操作（章节、元数据、改名、删除）串行执行，避免
/// `gfbook.yaml` 的 read-modify-write 互相覆盖。
pub fn with_book_lock<T>(book_path: &str, f: impl FnOnce() -> Result<T, AppError>) -> Result<T, AppError> {
    let key = lock_key(book_path);
    let lock = {
        let mut map = book_locks().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        map.entry(key).or_insert_with(|| Arc::new(Mutex::new(()))).clone()
    };
    let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    f()
}

// ═══════════════════════════════════════════
// 元数据
// ═══════════════════════════════════════════

pub fn slugify(title: &str) -> String {
    title
        .to_lowercase()
        .replace(' ', "-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

pub fn load_meta(book_path: &str) -> Result<BookMeta, AppError> {
    let meta_path = Path::new(book_path).join(META_FILE);
    let content =
        fs::read_to_string(&meta_path).map_err(|e| io_error(&format!("Failed to read {}", meta_path.display()), e))?;
    let mut meta: BookMeta = serde_yaml::from_str(&content)
        .map_err(|e| AppError::new("E_META", "Failed to parse meta file").with_detail(e.to_string()))?;
    normalize_legacy_diary_dates(&mut meta);
    Ok(meta)
}

/// 兼容旧日记数据：当条目没有 `date`、但 `id` 本身就是合法日期时，补上 `date`。
/// 只在内存中补全，不在读取时写盘，避免打开书就产生变更。
pub fn normalize_legacy_diary_dates(meta: &mut BookMeta) {
    if meta.kind != BookKind::Diary {
        return;
    }
    for chapter in &mut meta.chapters {
        if chapter.date.is_none() {
            if let Ok(date) = chrono::NaiveDate::parse_from_str(&chapter.id, "%Y-%m-%d") {
                chapter.date = Some(date.format("%Y-%m-%d").to_string());
            }
        }
    }
}

pub fn save_meta(book_path: &str, meta: &BookMeta) -> Result<(), AppError> {
    let mut meta = meta.clone();
    meta.updated_time = current_timestamp();
    let content = serde_yaml::to_string(&meta)
        .map_err(|e| AppError::new("E_META", "Failed to serialize meta file").with_detail(e.to_string()))?;
    let meta_path = Path::new(book_path).join(META_FILE);
    fs::write(&meta_path, content).map_err(|e| io_error(&format!("Failed to write {}", meta_path.display()), e))
}

pub fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ═══════════════════════════════════════════
// 章节文件
// ═══════════════════════════════════════════

pub fn chapter_file_path(book_path: &str, chapter_id: &str) -> PathBuf {
    Path::new(book_path)
        .join(CHAPTERS_DIR)
        .join(format!("{}.md", chapter_id))
}

pub fn read_chapter_file(book_path: &str, chapter_id: &str) -> Result<String, AppError> {
    let file_path = chapter_file_path(book_path, chapter_id);
    if !file_path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&file_path).map_err(|e| io_error(&format!("Failed to read {}", file_path.display()), e))
}

pub fn write_chapter_file(book_path: &str, chapter_id: &str, content: &str) -> Result<(), AppError> {
    let file_path = chapter_file_path(book_path, chapter_id);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| io_error(&format!("Failed to create {}", parent.display()), e))?;
    }
    fs::write(&file_path, content).map_err(|e| io_error(&format!("Failed to write {}", file_path.display()), e))
}

pub fn create_chapter_file(book_path: &str, chapter_id: &str, title: &str) -> Result<(), AppError> {
    write_chapter_file(book_path, chapter_id, &format!("# {}\n", title))
}

pub fn delete_chapter_file(book_path: &str, chapter_id: &str) -> Result<(), AppError> {
    let file_path = chapter_file_path(book_path, chapter_id);
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| io_error(&format!("Failed to delete {}", file_path.display()), e))?;
    }
    Ok(())
}

// ═══════════════════════════════════════════
// 章节树操作
// ═══════════════════════════════════════════

pub fn collect_chapter_ids(chapters: &[Chapter]) -> Vec<String> {
    let mut ids = Vec::new();
    for ch in chapters {
        ids.push(ch.id.clone());
        ids.extend(collect_chapter_ids(&ch.chapters));
    }
    ids
}

pub fn remove_chapter_from_list(chapters: &mut Vec<Chapter>, chapter_id: &str) -> bool {
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

pub fn find_chapter_mut<'a>(chapters: &'a mut [Chapter], id: &str) -> Option<&'a mut Chapter> {
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

pub fn find_sibling_list_and_index<'a>(
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

/// 判断 `target_id` 是否位于 `chapter` 的子树中（不含自身）。
pub fn subtree_contains(chapter: &Chapter, target_id: &str) -> bool {
    chapter
        .chapters
        .iter()
        .any(|child| child.id == target_id || subtree_contains(child, target_id))
}

pub fn remove_chapter_tree(chapters: &mut Vec<Chapter>, chapter_id: &str) -> Result<Vec<String>, AppError> {
    let mut ids = Vec::new();
    {
        let chapter =
            find_chapter_mut(chapters, chapter_id).ok_or_else(|| AppError::new("E_NOT_FOUND", "Chapter not found"))?;
        ids.push(chapter.id.clone());
        ids.extend(collect_chapter_ids(&chapter.chapters));
    }
    remove_chapter_from_list(chapters, chapter_id);
    Ok(ids)
}

pub fn move_chapter(
    chapters: &mut Vec<Chapter>,
    chapter_id: &str,
    target_id: Option<&str>,
    position: &str,
) -> Result<(), AppError> {
    let chapter = find_chapter_mut(chapters, chapter_id)
        .ok_or_else(|| AppError::new("E_NOT_FOUND", "Chapter not found"))?
        .clone();

    if let Some(target) = target_id {
        if target == chapter_id || subtree_contains(&chapter, target) {
            return Err(AppError::new(
                "E_INVALID_MOVE",
                "Cannot move a chapter into its own subtree",
            ));
        }
    }

    remove_chapter_from_list(chapters, chapter_id);

    match position {
        "before" | "after" => {
            let insert_before = position == "before";
            if let Some(target) = target_id {
                let (sibling_list, sibling_idx) = find_sibling_list_and_index(chapters, target)
                    .ok_or_else(|| AppError::new("E_NOT_FOUND", "Target chapter not found"))?;
                let idx = if insert_before { sibling_idx } else { sibling_idx + 1 };
                sibling_list.insert(idx.min(sibling_list.len()), chapter);
            } else if insert_before {
                chapters.insert(0, chapter);
            } else {
                chapters.push(chapter);
            }
        }
        _ => {
            if let Some(target) = target_id {
                let parent = find_chapter_mut(chapters, target)
                    .ok_or_else(|| AppError::new("E_NOT_FOUND", "Target chapter not found"))?;
                parent.chapters.push(chapter);
            } else {
                chapters.push(chapter);
            }
        }
    }
    Ok(())
}

pub fn move_chapter_up(chapters: &mut Vec<Chapter>, chapter_id: &str) -> Result<(), AppError> {
    if let Some((siblings, pos)) = find_sibling_list_and_index(chapters, chapter_id) {
        if pos > 0 {
            siblings.swap(pos, pos - 1);
        }
    }
    Ok(())
}

pub fn move_chapter_down(chapters: &mut Vec<Chapter>, chapter_id: &str) -> Result<(), AppError> {
    if let Some((siblings, pos)) = find_sibling_list_and_index(chapters, chapter_id) {
        if pos + 1 < siblings.len() {
            siblings.swap(pos, pos + 1);
        }
    }
    Ok(())
}

// ═══════════════════════════════════════════
// 日记
// ═══════════════════════════════════════════

pub fn validate_date(date: &str) -> Result<(), AppError> {
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| {
            AppError::new(
                "E_INVALID_DATE",
                format!("Invalid date '{}', expected YYYY-MM-DD", date),
            )
        })
}

/// 校验日记本的条目结构：顶层章节必须带合法日期，且不再嵌套子章节。
/// 同一天可以有多条，因此这里不再校验日期唯一。
pub fn validate_diary_chapters(chapters: &[Chapter]) -> Result<(), AppError> {
    for chapter in chapters {
        let date = chapter.date.as_deref().ok_or_else(|| {
            AppError::new(
                "E_INVALID_DIARY",
                format!("Diary entry '{}' is missing date", chapter.title),
            )
        })?;
        validate_date(date)?;
        if !chapter.chapters.is_empty() {
            return Err(AppError::new(
                "E_INVALID_DIARY",
                format!("Diary entry '{}' must not have sub-chapters", date),
            ));
        }
    }
    Ok(())
}

/// 日记条目排序：日期倒序；同一天内按创建时间正序。
pub fn sort_diary_entries(chapters: &mut [Chapter]) {
    chapters.sort_by(|a, b| b.date.cmp(&a.date).then_with(|| a.created_time.cmp(&b.created_time)));
}

/// 把正文首行的标题替换为新标题（仅当它等于候选值之一）。
fn replace_leading_heading(content: &str, candidates: &[&str], new_title: &str) -> Option<String> {
    let mut lines = content.lines();
    let first = lines.next()?.trim_end();
    if !candidates.iter().any(|c| first == format!("# {}", c)) {
        return None;
    }
    let mut rest: Vec<&str> = lines.collect();
    while rest.last().is_some_and(|line| line.trim().is_empty()) {
        rest.pop();
    }
    let mut out = format!("# {}", new_title);
    if !rest.is_empty() {
        out.push('\n');
        out.push_str(&rest.join("\n"));
    }
    out.push('\n');
    Some(out)
}

/// 日记条目的标题已变化时，同步正文首行，避免正文与列表显示不一致。
pub fn sync_entry_heading(
    book_path: &str,
    chapter_id: &str,
    candidates: &[&str],
    new_title: &str,
) -> Result<(), AppError> {
    let path = chapter_file_path(book_path, chapter_id);
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(_) => return Ok(()),
    };
    if let Some(updated) = replace_leading_heading(&content, candidates, new_title) {
        fs::write(&path, updated).map_err(|e| io_error(&format!("Failed to write {}", path.display()), e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chapter(id: &str, title: &str, children: Vec<Chapter>) -> Chapter {
        Chapter {
            id: id.to_string(),
            title: title.to_string(),
            created_time: 0,
            updated_time: 0,
            date: None,
            chapters: children,
        }
    }

    fn sample_tree() -> Vec<Chapter> {
        vec![
            chapter(
                "a",
                "A",
                vec![
                    chapter("a1", "A1", vec![chapter("a1x", "A1X", vec![])]),
                    chapter("a2", "A2", vec![]),
                ],
            ),
            chapter("b", "B", vec![]),
        ]
    }

    fn ids(chapters: &[Chapter]) -> Vec<String> {
        collect_chapter_ids(chapters)
    }

    #[test]
    fn append_chapter_builds_tree() {
        let mut tree = sample_tree();
        tree.push(chapter("c", "C", vec![]));
        find_chapter_mut(&mut tree, "a")
            .unwrap()
            .chapters
            .push(chapter("a3", "A3", vec![]));
        assert_eq!(ids(&tree), vec!["a", "a1", "a1x", "a2", "a3", "b", "c"]);
    }

    #[test]
    fn move_chapter_into_child_is_rejected() {
        let mut tree = sample_tree();
        let error = move_chapter(&mut tree, "a", Some("a1"), "inner").unwrap_err();
        assert_eq!(error.code, "E_INVALID_MOVE");
        // 失败后树不能被破坏
        assert_eq!(ids(&tree), vec!["a", "a1", "a1x", "a2", "b"]);
    }

    #[test]
    fn move_chapter_before_and_after() {
        let mut tree = sample_tree();
        move_chapter(&mut tree, "b", Some("a"), "before").unwrap();
        assert_eq!(ids(&tree), vec!["b", "a", "a1", "a1x", "a2"]);

        let mut tree = sample_tree();
        move_chapter(&mut tree, "a1x", Some("a2"), "after").unwrap();
        assert_eq!(ids(&tree), vec!["a", "a1", "a2", "a1x", "b"]);
    }

    #[test]
    fn move_chapter_inner_reparents() {
        let mut tree = sample_tree();
        move_chapter(&mut tree, "a2", Some("b"), "inner").unwrap();
        assert_eq!(ids(&tree), vec!["a", "a1", "a1x", "b", "a2"]);
    }

    #[test]
    fn remove_chapter_tree_returns_descendants() {
        let mut tree = sample_tree();
        let removed = remove_chapter_tree(&mut tree, "a").unwrap();
        assert_eq!(removed, vec!["a", "a1", "a1x", "a2"]);
        assert_eq!(ids(&tree), vec!["b"]);
    }

    #[test]
    fn diary_entries_sort_by_date_desc_then_created_asc() {
        let mut entries = vec![
            Chapter {
                date: Some("2026-01-02".into()),
                created_time: 20,
                ..chapter("x", "X", vec![])
            },
            Chapter {
                date: Some("2026-01-03".into()),
                created_time: 30,
                ..chapter("y", "Y", vec![])
            },
            Chapter {
                date: Some("2026-01-02".into()),
                created_time: 10,
                ..chapter("z", "Z", vec![])
            },
        ];
        sort_diary_entries(&mut entries);
        let ordered: Vec<&str> = entries.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ordered, vec!["y", "z", "x"]);
    }

    #[test]
    fn diary_validation_rejects_missing_date_and_nested_children() {
        let mut missing = Chapter {
            date: None,
            ..chapter("2026-01-01", "Entry", vec![])
        };
        assert_eq!(
            validate_diary_chapters(&[missing.clone()]).unwrap_err().code,
            "E_INVALID_DIARY"
        );
        missing.date = Some("2026-01-01".into());
        assert!(validate_diary_chapters(&[missing.clone()]).is_ok());

        let nested = Chapter {
            date: Some("2026-01-02".into()),
            ..chapter("n", "Nested", vec![chapter("c", "Child", vec![])])
        };
        assert_eq!(validate_diary_chapters(&[nested]).unwrap_err().code, "E_INVALID_DIARY");
    }

    #[test]
    fn legacy_diary_ids_are_backfilled() {
        let mut meta = BookMeta {
            title: "Diary".into(),
            schema_version: 1,
            kind: BookKind::Diary,
            created_time: 0,
            updated_time: 0,
            chapters: vec![Chapter {
                date: None,
                ..chapter("2026-02-03", "Entry", vec![])
            }],
        };
        normalize_legacy_diary_dates(&mut meta);
        assert_eq!(meta.chapters[0].date.as_deref(), Some("2026-02-03"));

        meta.kind = BookKind::Book;
        meta.chapters[0].date = None;
        normalize_legacy_diary_dates(&mut meta);
        assert!(meta.chapters[0].date.is_none());
    }

    #[test]
    fn slugify_handles_spaces_and_symbols() {
        assert_eq!(slugify("My First Book"), "my-first-book");
        assert_eq!(slugify("Hello, 世界!"), "hello-世界");
        assert_eq!(slugify("___"), "___");
    }

    #[test]
    fn chapter_file_path_stays_under_chapters_dir() {
        let path = chapter_file_path("/tmp/book", "abc-123");
        assert!(path.ends_with("chapters/abc-123.md"));
    }

    #[test]
    fn replace_leading_heading_only_when_matching() {
        let updated = replace_leading_heading("# Old\n\nBody\n", &["Old"], "New").unwrap();
        assert_eq!(updated, "# New\n\nBody\n");
        assert!(replace_leading_heading("# Other\nBody\n", &["Old"], "New").is_none());
    }
}
