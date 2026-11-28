import { invoke, convertFileSrc } from '@tauri-apps/api/core'

import type {
  ActivityItem,
  BackendInfo,
  BookIdentity,
  BookInfo,
  BookKind,
  BookMeta,
  BookProblems,
  Chapter,
  CommitInfo,
  FileDiff,
  RepoState,
  RepoSummary,
} from '../types'

export function listBooks(): Promise<BookInfo[]> {
  return invoke('list_books')
}

export function newBook(
  title: string,
  bookDir?: string,
  kind?: BookKind,
): Promise<BookInfo> {
  return invoke('new_book', { title, bookDir, kind })
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

export interface MdScanFile {
  path: string
  title: string
  is_index: boolean
}

export interface MdScanDir {
  path: string
  name: string
  files: MdScanFile[]
  children: MdScanDir[]
  md_count: number
  image_count: number
}

export interface MdScan {
  root_name: string
  root_path: string
  md_count: number
  image_count: number
  tree: MdScanDir
}

/** 预览普通 Markdown 目录的章节结构与资源数量 */
export function scanMarkdownDir(sourcePath: string): Promise<MdScan> {
  return invoke('scan_markdown_dir', { sourcePath })
}

/** 把普通 Markdown 目录导入为一本新书 */
export function importMarkdownDir(
  sourcePath: string,
  title?: string,
): Promise<BookInfo> {
  return invoke('import_markdown_dir', { sourcePath, title })
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

/** 在日记本中新建某一天的条目（YYYY-MM-DD），同一天可以有多篇 */
export function newDiaryEntry(
  bookPath: string,
  date: string,
): Promise<Chapter> {
  return invoke('new_diary_entry', { bookPath, date })
}

/** 重命名日记条目：只改标题，不改日期 */
export function renameDiaryEntry(
  bookPath: string,
  chapterId: string,
  newTitle: string,
): Promise<Chapter> {
  return invoke('rename_diary_entry', { bookPath, chapterId, newTitle })
}

/** 修改日记条目的日期：标题保持原样，默认标题会跟随日期更新 */
export function updateDiaryDate(
  bookPath: string,
  chapterId: string,
  date: string,
): Promise<Chapter> {
  return invoke('update_diary_date', { bookPath, chapterId, date })
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

/** 统一的仓库状态：分支、远程、ahead/behind、工作区与最近提交 */
export function getRepoState(bookPath: string): Promise<RepoState> {
  return invoke('get_repo_state', { bookPath })
}

/** 为书籍启用版本管理：初始化仓库并用当前生效身份创建初始提交 */
export function enableVersionControl(bookPath: string): Promise<RepoState> {
  return invoke('enable_version_control', { bookPath })
}

/** 读取单个改动文件相对 HEAD 的差异 */
export function getFileDiff(bookPath: string, path: string): Promise<FileDiff> {
  return invoke('get_file_diff', { bookPath, path })
}

/** 扫描全库内容问题 */
export function scanLibraryProblems(): Promise<BookProblems[]> {
  return invoke('scan_library_problems')
}

/** 扫描单本书的内容问题 */
export function scanBookProblems(bookPath: string): Promise<BookProblems> {
  return invoke('scan_book_problems', { bookPath })
}

/** 前端要求的后端契约版本，必须与 src-tauri/src/commands.rs 的 BACKEND_API_LEVEL 一致 */
export const EXPECTED_BACKEND_API = 3

/** 读取后端版本信息，用于检测前端与旧二进制不匹配 */
export function getBackendInfo(): Promise<BackendInfo> {
  return invoke('get_backend_info')
}

/** 批量读取书架仓库状态 */
export function getRepoSummaries(bookPaths: string[]): Promise<RepoSummary[]> {
  return invoke('get_repo_summaries', { bookPaths })
}

/** 合并提交历史与应用事件，按时间倒序 */
export function getBookActivity(
  bookPath: string,
  limit?: number,
): Promise<ActivityItem[]> {
  return invoke('get_book_activity', { bookPath, limit })
}

/** 本书提交身份：区分本地覆盖与全局继承 */
export function getBookIdentity(bookPath: string): Promise<BookIdentity> {
  return invoke('get_book_identity', { bookPath })
}

/** 设置本书提交身份；姓名和邮箱都传空字符串表示跟随全局 */
export function setBookIdentity(
  bookPath: string,
  name: string,
  email: string,
): Promise<void> {
  return invoke('set_book_identity', { bookPath, name, email })
}

/** 把 Tauri 命令错误（字符串或 AppError 对象）统一成可展示文本 */
export function formatInvokeError(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; detail?: unknown; code?: unknown }
    if (typeof value.message === 'string' && value.message) {
      const detail = typeof value.detail === 'string' ? value.detail : ''
      return detail ? `${value.message}: ${detail}` : value.message
    }
    if (typeof value.code === 'string') return value.code
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
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
  b?: string
}

export function readLogs(limit: number): Promise<LogEntry[]> {
  return invoke('read_logs', { limit })
}

export function readBookLogs(
  limit: number,
  bookPath: string,
): Promise<LogEntry[]> {
  return invoke('read_book_logs', { limit, bookPath })
}

export interface SearchMatch {
  line: number
  text: string
}

export interface SearchProgressEvent {
  book_path: string
  book_title: string
  chapter_id: string
  chapter_title: string
  matches: SearchMatch[]
}

export function startSearch(
  bookPaths: string[],
  query: string,
): Promise<string> {
  return invoke('start_search', { bookPaths, query })
}

export interface ExportFile {
  path: string
  content: string
}

export interface ExportBinary {
  path: string
  data_base64: string
}

export interface ExportAsset {
  book_path: string
  src: string
  dest: string
}

export interface ExportSummary {
  files_written: number
  assets_copied: number
  missing_assets: string[]
}

export function exportSite(
  outputDir: string,
  files: ExportFile[],
  binaries: ExportBinary[],
  assets: ExportAsset[],
): Promise<ExportSummary> {
  return invoke('export_site', { outputDir, files, binaries, assets })
}

export interface SiteTemplates {
  chapter: string | null
  book: string | null
  home: string | null
  css: string | null
}

/** 读取书库根目录 `.gfbook/templates/` 下的自定义导出模板，缺失时为 null */
export function readSiteTemplates(): Promise<SiteTemplates> {
  return invoke('read_site_templates')
}

/** 安装内置示例模板到 `.gfbook/templates/`，返回安装目录 */
export function installExampleTemplates(): Promise<string> {
  return invoke('install_example_templates')
}
