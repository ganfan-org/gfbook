mod commands;
mod git;
mod models;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_books,
            new_book,
            delete_book,
            import_book,
            get_book_meta,
            read_chapter,
            write_chapter,
            new_chapter,
            delete_chapter,
            rename_chapter,
            move_chapter,
            move_chapter_up,
            move_chapter_down,
            git_status,
            git_commit,
            git_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
