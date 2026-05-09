use std::fs;
use std::path::PathBuf;

use crate::models::SyncConfig;

/// Write config content to the sync path (iCloud or other)
pub fn sync_to_path(config: &SyncConfig, content: &str) -> Result<(), String> {
    let path = PathBuf::from(&config.path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create sync directory: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write to sync path: {}", e))?;
    Ok(())
}

/// Read config content from the sync path
pub fn sync_from_path(config: &SyncConfig) -> Result<Option<String>, String> {
    let path = PathBuf::from(&config.path);
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read from sync path: {}", e))?;
    Ok(Some(content))
}

/// Merge two config JSON values:
/// - Union of `books` arrays, deduped by path
/// - Keep all other keys from local (local takes precedence for non-books keys)
pub fn merge_configs(local: &serde_json::Value, remote: &serde_json::Value) -> serde_json::Value {
    let mut result = local.clone();

    // Merge books arrays: union, dedup by path
    let local_books = local
        .get("books")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let remote_books = remote
        .get("books")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut merged_books = local_books.clone();
    let local_paths: std::collections::HashSet<String> = local_books
        .iter()
        .filter_map(|b| b.as_str().map(|s| s.to_string()))
        .collect();

    for book in &remote_books {
        if let Some(path_str) = book.as_str() {
            if !local_paths.contains(path_str) {
                merged_books.push(book.clone());
            }
        }
    }

    result["books"] = serde_json::json!(merged_books);

    // For other keys, keep remote value if local doesn't have it
    if let Some(obj) = remote.as_object() {
        for (key, val) in obj {
            if key != "books" && !result.get(key).map(|v| !v.is_null()).unwrap_or(false) {
                result[key] = val.clone();
            }
        }
    }

    result
}
