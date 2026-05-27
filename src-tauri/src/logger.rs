use std::fs::OpenOptions;
use std::io::Write;

use serde_json::json;
use tauri::Manager;

fn log_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let cache = app
        .path()
        .app_cache_dir()
        .expect("failed to get cache dir");
    cache.join("events.log")
}

pub fn log_event(app: &tauri::AppHandle, event_type: &str, detail: &str) {
    log_event_with_book(app, event_type, detail, None);
}

pub fn log_book_event(
    app: &tauri::AppHandle,
    event_type: &str,
    detail: &str,
    book_path: &str,
) {
    log_event_with_book(app, event_type, detail, Some(book_path));
}

fn log_event_with_book(
    app: &tauri::AppHandle,
    event_type: &str,
    detail: &str,
    book_path: Option<&str>,
) {
    let mut entry = json!({
        "t": chrono::Utc::now().to_rfc3339(),
        "e": event_type,
        "d": detail,
    });
    if let Some(bp) = book_path {
        entry["b"] = json!(bp);
    }

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path(app))
    {
        let _ = writeln!(file, "{}", entry);
    }
}

pub fn read_logs(app: &tauri::AppHandle, limit: usize) -> Vec<serde_json::Value> {
    read_logs_filtered(app, limit, None)
}

pub fn read_book_logs(
    app: &tauri::AppHandle,
    limit: usize,
    book_path: &str,
) -> Vec<serde_json::Value> {
    read_logs_filtered(app, limit, Some(book_path))
}

fn read_logs_filtered(
    app: &tauri::AppHandle,
    limit: usize,
    book_path: Option<&str>,
) -> Vec<serde_json::Value> {
    let path = log_path(app);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let lines: Vec<serde_json::Value> = content
        .lines()
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .filter(|v: &serde_json::Value| {
            if let Some(bp) = book_path {
                v.get("b").and_then(|b| b.as_str()) == Some(bp)
            } else {
                true
            }
        })
        .collect();
    let start = if lines.len() > limit {
        lines.len() - limit
    } else {
        0
    };
    lines.into_iter().skip(start).collect()
}
