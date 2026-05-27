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
    let entry = json!({
        "t": chrono::Utc::now().to_rfc3339(),
        "e": event_type,
        "d": detail,
    });

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path(app))
    {
        let _ = writeln!(file, "{}", entry);
    }
}

pub fn read_logs(app: &tauri::AppHandle, limit: usize) -> Vec<serde_json::Value> {
    let path = log_path(app);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let mut lines: Vec<serde_json::Value> = content
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    let start = if lines.len() > limit {
        lines.len() - limit
    } else {
        0
    };
    lines.drain(..start);
    lines
}
