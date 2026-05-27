import { invoke, convertFileSrc } from '@tauri-apps/api/core'

import type { BookInfo, BookMeta, Chapter, CommitInfo } from '../types'

export function listBooks(): Promise<BookInfo[]> {
  return invoke('list_books')
}

export function newBook(title: string, bookDir?: string): Promise<BookInfo> {
  return invoke('new_book', { title, bookDir })
}

export function deleteBook(bookPath: string): Promise<void> {
  return invoke('delete_book', { bookPath })
}

export function renameBook(
  bookPath: string,
  newTitle: string,
): Promise<BookInfo> {
  return invoke('rename_book', { bookPath, newTitle })
}

export function getBooksDir(): Promise<string> {
  return invoke('get_books_dir_info')
}

export function setBooksDir(dir: string): Promise<string> {
  return invoke('set_books_dir', { dir })
}

export function importBook(folderPath: string): Promise<BookInfo> {
  return invoke('import_book', { folderPath })
}

export function getBookMeta(bookPath: string): Promise<BookMeta> {
  return invoke('get_book_meta', { bookPath })
}

export function readChapter(
  bookPath: string,
  chapterId: string,
): Promise<string> {
  return invoke('read_chapter', { bookPath, chapterId })
}

export function writeChapter(
  bookPath: string,
  chapterId: string,
  content: string,
): Promise<void> {
  return invoke('write_chapter', { bookPath, chapterId, content })
}

export function newChapter(
  bookPath: string,
  parentId: string | null,
  title: string,
): Promise<Chapter> {
  return invoke('new_chapter', { bookPath, parentId, title })
}

export function deleteChapter(
  bookPath: string,
  chapterId: string,
): Promise<void> {
  return invoke('delete_chapter', { bookPath, chapterId })
}

export function renameChapter(
  bookPath: string,
  chapterId: string,
  newTitle: string,
): Promise<void> {
  return invoke('rename_chapter', { bookPath, chapterId, newTitle })
}

export function moveChapter(
  bookPath: string,
  chapterId: string,
  targetId: string | null,
  position: 'inner' | 'before' | 'after',
): Promise<void> {
  return invoke('move_chapter', { bookPath, chapterId, targetId, position })
}

export function moveChapterUp(
  bookPath: string,
  chapterId: string,
): Promise<void> {
  return invoke('move_chapter_up', { bookPath, chapterId })
}

export function moveChapterDown(
  bookPath: string,
  chapterId: string,
): Promise<void> {
  return invoke('move_chapter_down', { bookPath, chapterId })
}

export function gitStatus(bookPath: string): Promise<string> {
  return invoke('git_status', { bookPath })
}

export function gitCommit(bookPath: string, message: string): Promise<void> {
  return invoke('git_commit', { bookPath, message })
}

export function gitLog(
  bookPath: string,
  maxCount?: number,
): Promise<CommitInfo[]> {
  return invoke('git_log', { bookPath, maxCount })
}

export function gitRemoteUrl(bookPath: string): Promise<string | null> {
  return invoke('git_remote_url', { bookPath })
}

export function gitRemoteSetUrl(bookPath: string, url: string): Promise<void> {
  return invoke('git_remote_set_url', { bookPath, url })
}

export function gitFetch(bookPath: string): Promise<string> {
  return invoke('git_fetch', { bookPath })
}

export function gitPull(bookPath: string): Promise<string> {
  return invoke('git_pull', { bookPath })
}

export function gitPush(bookPath: string): Promise<string> {
  return invoke('git_push', { bookPath })
}

export function gitAheadBehind(bookPath: string): Promise<[number, number]> {
  return invoke('git_ahead_behind', { bookPath })
}

export function gitUserConfig(bookPath: string): Promise<[string, string]> {
  return invoke('git_user_config', { bookPath })
}

export function gitSetUserConfig(
  bookPath: string,
  name: string,
  email: string,
): Promise<void> {
  return invoke('git_set_user_config', { bookPath, name, email })
}

export function gitGetProxy(bookPath: string): Promise<string> {
  return invoke('git_get_proxy', { bookPath })
}

export function gitSetProxy(bookPath: string, proxy: string): Promise<void> {
  return invoke('git_set_proxy', { bookPath, proxy })
}

export function getGlobalGitUser(): Promise<[string, string]> {
  return invoke('get_global_git_user')
}

export function setGlobalGitUser(name: string, email: string): Promise<void> {
  return invoke('set_global_git_user', { name, email })
}

export function getProxySetting(): Promise<string> {
  return invoke('get_proxy_setting')
}

export function setProxySetting(proxy: string): Promise<void> {
  return invoke('set_proxy_setting', { proxy })
}

export function gitListConflicted(bookPath: string): Promise<string[]> {
  return invoke('git_list_conflicted', { bookPath })
}

export function attemptMerge(bookPath: string): Promise<string> {
  return invoke('attempt_merge', { bookPath })
}

export function resolveConflict(
  bookPath: string,
  filePath: string,
  useTheirs: boolean,
): Promise<string> {
  return invoke('resolve_conflict', { bookPath, filePath, useTheirs })
}

export function revealInFinder(path: string): Promise<void> {
  return invoke('reveal_in_finder', { path })
}

export function downloadImageUrl(
  bookPath: string,
  url: string,
): Promise<string> {
  return invoke('download_image_url', { bookPath, url })
}

export function pathExists(path: string): Promise<boolean> {
  return invoke('path_exists', { path })
}

export function readFileBase64(path: string): Promise<string> {
  return invoke('read_file_base64', { path })
}

export async function getAssetUrl(
  bookPath: string,
  relPath: string,
): Promise<string> {
  const absolutePath = (await invoke('get_asset_url', {
    bookPath,
    relPath,
  })) as string
  return convertFileSrc(absolutePath)
}

export interface LogEntry {
  t: string
  e: string
  d: string
}

export function readLogs(limit: number): Promise<LogEntry[]> {
  return invoke('read_logs', { limit })
}
