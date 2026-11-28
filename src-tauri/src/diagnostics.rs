use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::book_fs::{chapter_file_path, load_meta, CHAPTERS_DIR, META_FILE};
use crate::models::{BookKind, BookMeta, BookProblems, Chapter, Problem};

const KNOWN_SCHEMA_VERSION: u32 = 1;

struct Entry<'a> {
    chapter: &'a Chapter,
    /// 同层分组键：根层为空字符串，子层为父章节 id。
    parent: String,
}

pub fn scan_book(book_path: &str) -> BookProblems {
    let root = Path::new(book_path);
    let folder_title = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Book")
        .to_string();

    match load_meta(book_path) {
        Ok(meta) => scan_meta(book_path, root, meta),
        Err(error) => {
            let mut problem = make_problem("meta_parse", "error", "Failed to parse the book metadata");
            problem.detail = Some(error.user_message());
            problem.file = Some(META_FILE.to_string());
            let mut problems = vec![problem];
            collect_conflicts(root, &HashMap::new(), &mut problems);
            sort_problems(&mut problems);
            BookProblems {
                book_path: book_path.to_string(),
                book_title: folder_title,
                problems,
            }
        }
    }
}

fn scan_meta(book_path: &str, root: &Path, meta: BookMeta) -> BookProblems {
    let mut problems = Vec::new();

    if meta.schema_version != KNOWN_SCHEMA_VERSION {
        let mut problem = make_problem("schema_version", "warning", "Unknown schema_version");
        problem.detail = Some(meta.schema_version.to_string());
        problem.file = Some(META_FILE.to_string());
        problems.push(problem);
    }

    let mut entries = Vec::new();
    collect_entries(&meta.chapters, "", &mut entries);

    for entry in &entries {
        if entry.chapter.title.trim().is_empty() {
            let mut problem = make_problem("empty_title", "warning", "Chapter title is empty");
            attach_chapter(&mut problem, entry.chapter);
            problems.push(problem);
        }
    }

    if meta.kind != BookKind::Diary {
        let mut groups: BTreeMap<(String, String), Vec<&Entry>> = BTreeMap::new();
        for entry in &entries {
            let title = entry.chapter.title.trim();
            if title.is_empty() {
                continue;
            }
            groups
                .entry((entry.parent.clone(), title.to_string()))
                .or_default()
                .push(entry);
        }
        for ((_, title), group) in groups {
            if group.len() < 2 {
                continue;
            }
            let duplicate = group[1];
            let mut problem = make_problem("duplicate_title", "warning", "Duplicate title at the same level");
            problem.detail = Some(title);
            attach_chapter(&mut problem, duplicate.chapter);
            problems.push(problem);
        }
    }

    let mut expected = HashSet::new();
    let mut id_by_file = HashMap::new();
    for entry in &entries {
        let file = format!("{}/{}.md", CHAPTERS_DIR, entry.chapter.id);
        expected.insert(file.clone());
        id_by_file.insert(file.clone(), entry.chapter.id.clone());

        let path = chapter_file_path(book_path, &entry.chapter.id);
        if !path.is_file() {
            let mut problem = make_problem("meta_missing_file", "error", "Chapter file is missing");
            problem.detail = Some(file.clone());
            problem.file = Some(file.clone());
            attach_chapter(&mut problem, entry.chapter);
            problems.push(problem);
            continue;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        if let Some(heading) = first_heading(&content) {
            if heading != entry.chapter.title.trim() {
                let mut problem = make_problem(
                    "title_mismatch",
                    "warning",
                    "Chapter title does not match the first heading",
                );
                problem.detail = Some(heading);
                problem.file = Some(file.clone());
                attach_chapter(&mut problem, entry.chapter);
                problems.push(problem);
            }
        }

        for target in image_targets(&content) {
            if image_exists(root, &target) {
                continue;
            }
            let mut problem = make_problem("missing_image", "error", "Referenced image is missing");
            problem.detail = Some(target);
            problem.file = Some(file.clone());
            attach_chapter(&mut problem, entry.chapter);
            problems.push(problem);
        }
    }

    let mut files = Vec::new();
    collect_chapter_files(root, &mut files);
    for file in files {
        if expected.contains(&file) {
            continue;
        }
        let mut problem = make_problem("orphan_file", "warning", "Chapter file is not registered in metadata");
        problem.detail = Some(file.clone());
        problem.file = Some(file);
        problems.push(problem);
    }

    collect_conflicts(root, &id_by_file, &mut problems);

    if meta.kind == BookKind::Diary {
        for chapter in &meta.chapters {
            match chapter.date.as_deref() {
                None => {
                    let mut problem = make_problem("diary_date_missing", "error", "Diary entry is missing a date");
                    attach_chapter(&mut problem, chapter);
                    problems.push(problem);
                }
                Some(date) => {
                    let id_date = chrono::NaiveDate::parse_from_str(&chapter.id, "%Y-%m-%d")
                        .ok()
                        .map(|parsed| parsed.format("%Y-%m-%d").to_string());
                    let date_valid = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_ok();
                    let mismatch = match &id_date {
                        Some(id_date) => id_date != date,
                        None => !date_valid,
                    };
                    if mismatch {
                        let mut problem =
                            make_problem("diary_date_mismatch", "error", "Diary entry date does not match its id");
                        problem.detail = Some(format!("date={}, id={}", date, chapter.id));
                        attach_chapter(&mut problem, chapter);
                        problems.push(problem);
                    }
                }
            }
        }
    }

    sort_problems(&mut problems);
    BookProblems {
        book_path: book_path.to_string(),
        book_title: meta.title,
        problems,
    }
}

fn collect_entries<'a>(chapters: &'a [Chapter], parent: &str, out: &mut Vec<Entry<'a>>) {
    for chapter in chapters {
        out.push(Entry {
            chapter,
            parent: parent.to_string(),
        });
        collect_entries(&chapter.chapters, &chapter.id, out);
    }
}

fn make_problem(kind: &str, severity: &str, message: &str) -> Problem {
    Problem {
        kind: kind.to_string(),
        severity: severity.to_string(),
        message: message.to_string(),
        detail: None,
        chapter_id: None,
        chapter_title: None,
        file: None,
        line: None,
    }
}

fn attach_chapter(problem: &mut Problem, chapter: &Chapter) {
    problem.chapter_id = Some(chapter.id.clone());
    problem.chapter_title = Some(chapter.title.clone());
    if problem.file.is_none() {
        problem.file = Some(format!("{}/{}.md", CHAPTERS_DIR, chapter.id));
    }
}

fn first_heading(content: &str) -> Option<String> {
    let line = content.lines().next()?.trim();
    let hashes = line.chars().take_while(|ch| *ch == '#').count();
    if !(1..=6).contains(&hashes) || line.len() <= hashes {
        return None;
    }
    if !line[hashes..].starts_with(' ') {
        return None;
    }
    let heading = line[hashes..].trim();
    if heading.is_empty() {
        return None;
    }
    Some(heading.trim_end_matches('#').trim().to_string())
}

fn image_targets(content: &str) -> Vec<String> {
    let mut targets = Vec::new();
    for line in content.lines() {
        let mut cursor = line;
        while let Some(start) = cursor.find("![") {
            let after = &cursor[start + 2..];
            let Some(close) = after.find("](") else {
                break;
            };
            let inner = &after[close + 2..];
            let Some(end) = inner.find(')') else {
                break;
            };
            if let Some(target) = clean_image_target(&inner[..end]) {
                targets.push(target);
            }
            cursor = &inner[end + 1..];
        }
        if let Some(target) = html_image_target(line) {
            targets.push(target);
        }
    }
    targets
}

fn clean_image_target(raw: &str) -> Option<String> {
    let mut value = raw.trim();
    if let Some(rest) = value.strip_prefix('<') {
        value = rest.split('>').next()?.trim();
    } else {
        value = value.split_whitespace().next()?;
    }
    let value = value.trim_matches(|ch| ch == '"' || ch == '\'').trim();
    if value.is_empty()
        || value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("data:")
        || value.starts_with("asset:")
        || value.starts_with("mailto:")
        || value.starts_with("//")
        || value.starts_with('#')
    {
        return None;
    }
    Some(value.to_string())
}

fn html_image_target(line: &str) -> Option<String> {
    let lower = line.to_ascii_lowercase();
    let img = lower.find("<img")?;
    let src = lower[img..].find("src=")? + img + 4;
    let rest = line[src..].trim_start();
    let quote = rest.chars().next().filter(|ch| *ch == '"' || *ch == '\'')?;
    let rest = &rest[1..];
    let end = rest.find(quote)?;
    let value = rest[..end].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn image_exists(root: &Path, target: &str) -> bool {
    let clean = target.split(['?', '#']).next().unwrap_or(target);
    let path = Path::new(clean);
    if !path.is_relative() {
        return true;
    }
    // 含 .. 的引用不在这里判断，避免越界与误报
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return true;
    }
    root.join(path).is_file()
}

fn collect_chapter_files(root: &Path, out: &mut Vec<String>) {
    let mut stack = vec![root.join(CHAPTERS_DIR)];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
        paths.sort();
        for path in paths {
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                continue;
            }
            if let Ok(relative) = path.strip_prefix(root) {
                out.push(relative.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    out.sort();
}

fn collect_conflicts(root: &Path, id_by_file: &HashMap<String, String>, problems: &mut Vec<Problem>) {
    let mut files = Vec::new();
    collect_chapter_files(root, &mut files);
    for file in files {
        let Ok(content) = fs::read_to_string(root.join(&file)) else {
            continue;
        };
        let hit = content.lines().enumerate().find(|(_, line)| is_conflict_marker(line));
        let Some((index, _)) = hit else {
            continue;
        };
        let mut problem = make_problem("conflict_marker", "error", "Merge conflict marker found");
        problem.file = Some(file.clone());
        problem.line = Some((index + 1) as u32);
        problem.chapter_id = id_by_file.get(&file).cloned();
        problems.push(problem);
    }
}

fn is_conflict_marker(line: &str) -> bool {
    let line = line.trim_start();
    line.starts_with("<<<<<<<") || line.starts_with("=======") || line.starts_with(">>>>>>>")
}

fn sort_problems(problems: &mut [Problem]) {
    problems.sort_by(|a, b| {
        let rank = |severity: &str| if severity == "error" { 0 } else { 1 };
        rank(&a.severity)
            .cmp(&rank(&b.severity))
            .then_with(|| a.file.cmp(&b.file))
            .then_with(|| a.line.cmp(&b.line))
            .then_with(|| a.kind.cmp(&b.kind))
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book_fs::save_meta;

    fn chapter(id: &str, title: &str, date: Option<&str>, children: Vec<Chapter>) -> Chapter {
        Chapter {
            id: id.to_string(),
            title: title.to_string(),
            created_time: 0,
            updated_time: 0,
            date: date.map(|value| value.to_string()),
            chapters: children,
        }
    }

    fn write_file(dir: &Path, name: &str, content: &str) {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn detects_book_problems() {
        let dir = tempfile::tempdir().unwrap();
        let book_path = dir.path().to_string_lossy().to_string();
        let meta = BookMeta {
            title: "Test Book".to_string(),
            schema_version: 2,
            kind: BookKind::Book,
            created_time: 0,
            updated_time: 0,
            chapters: vec![
                chapter("a", "Alpha", None, vec![]),
                chapter("b", "", None, vec![]),
                chapter("c", "Same", None, vec![]),
                chapter("d", "Same", None, vec![]),
                chapter("p", "Parent", None, vec![chapter("e", "Parent", None, vec![])]),
            ],
        };
        save_meta(&book_path, &meta).unwrap();
        write_file(
            dir.path(),
            "chapters/a.md",
            "# Beta\n\n![cover](assets/missing.png)\n<<<<<<< HEAD\n",
        );
        write_file(dir.path(), "chapters/c.md", "# Same\n");
        write_file(dir.path(), "chapters/d.md", "# Same\n");
        write_file(dir.path(), "chapters/p.md", "# Parent\n");
        write_file(dir.path(), "chapters/e.md", "# Parent\n");
        write_file(dir.path(), "chapters/orphan.md", "# Orphan\n");

        let result = scan_book(&book_path);
        let kinds: Vec<&str> = result.problems.iter().map(|problem| problem.kind.as_str()).collect();
        for expected in [
            "schema_version",
            "title_mismatch",
            "empty_title",
            "duplicate_title",
            "meta_missing_file",
            "orphan_file",
            "missing_image",
            "conflict_marker",
        ] {
            assert!(kinds.contains(&expected), "missing problem kind: {}", expected);
        }
    }

    #[test]
    fn detects_diary_date_problems_without_duplicate_titles() {
        let dir = tempfile::tempdir().unwrap();
        let book_path = dir.path().to_string_lossy().to_string();
        let meta = BookMeta {
            title: "Diary".to_string(),
            schema_version: 1,
            kind: BookKind::Diary,
            created_time: 0,
            updated_time: 0,
            chapters: vec![
                chapter("2026-01-02", "2026-01-02", Some("2026-01-03"), vec![]),
                chapter("2026-01-04", "2026-01-04", Some("2026-01-04"), vec![]),
                chapter("5f0c2c4e", "Untitled", None, vec![]),
            ],
        };
        save_meta(&book_path, &meta).unwrap();
        for id in ["2026-01-02", "2026-01-04", "5f0c2c4e"] {
            write_file(dir.path(), &format!("chapters/{}.md", id), "# Entry\n");
        }

        let result = scan_book(&book_path);
        let kinds: Vec<&str> = result.problems.iter().map(|problem| problem.kind.as_str()).collect();
        assert!(kinds.contains(&"diary_date_mismatch"));
        assert!(kinds.contains(&"diary_date_missing"));
        assert!(!kinds.contains(&"duplicate_title"));
    }

    #[test]
    fn reports_meta_parse_failure() {
        let dir = tempfile::tempdir().unwrap();
        write_file(dir.path(), META_FILE, "title: [\n");
        let result = scan_book(&dir.path().to_string_lossy());
        assert_eq!(result.problems.len(), 1);
        assert_eq!(result.problems[0].kind, "meta_parse");
    }
}
