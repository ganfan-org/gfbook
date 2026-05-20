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
            git_user_config,
            git_set_user_config,
            git_get_proxy,
            git_set_proxy,
            get_global_git_user,
            set_global_git_user,
            get_proxy_setting,
            set_proxy_setting,
            git_list_conflicted,
            read_file_base64,
            read_image_as_data_url,
            save_image_to_book,
            save_image_data,
            download_image_url,
            reveal_in_finder,
            path_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
