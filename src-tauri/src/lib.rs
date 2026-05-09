mod commands;
mod git;
mod library;
mod models;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            init_sync(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_books,
            new_book,
            delete_book,
            rename_book,
            import_book,
            get_books_dir_info,
            set_books_dir,
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
            git_remote_url,
            git_remote_set_url,
            git_fetch,
            git_pull,
            git_push,
            git_ahead_behind,
            get_sync_config,
            set_sync_config,
            sync_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
