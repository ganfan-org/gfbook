import { invoke } from '@tauri-apps/api/core';

import type { BookInfo, BookMeta, Chapter, CommitInfo } from '../types';

export function listBooks(): Promise<BookInfo[]> {
  return invoke('list_books');
}

export function newBook(title: string): Promise<BookInfo> {
  return invoke('new_book', { title });
}

export function deleteBook(bookPath: string): Promise<void> {
  return invoke('delete_book', { bookPath });
}

export function renameBook(bookPath: string, newTitle: string): Promise<BookInfo> {
  return invoke('rename_book', { bookPath, newTitle });
}

export function importBook(folderPath: string): Promise<BookInfo> {
  return invoke('import_book', { folderPath });
}

export function getBookMeta(bookPath: string): Promise<BookMeta> {
  return invoke('get_book_meta', { bookPath });
}

export function readChapter(bookPath: string, chapterId: string): Promise<string> {
  return invoke('read_chapter', { bookPath, chapterId });
}

export function writeChapter(bookPath: string, chapterId: string, content: string): Promise<void> {
  return invoke('write_chapter', { bookPath, chapterId, content });
}

export function newChapter(bookPath: string, parentId: string | null, title: string): Promise<Chapter> {
  return invoke('new_chapter', { bookPath, parentId, title });
}

export function deleteChapter(bookPath: string, chapterId: string): Promise<void> {
  return invoke('delete_chapter', { bookPath, chapterId });
}

export function renameChapter(bookPath: string, chapterId: string, newTitle: string): Promise<void> {
  return invoke('rename_chapter', { bookPath, chapterId, newTitle });
}

export function moveChapter(bookPath: string, chapterId: string, targetId: string | null, position: 'inner' | 'before' | 'after'): Promise<void> {
  return invoke('move_chapter', { bookPath, chapterId, targetId, position });
}

export function moveChapterUp(bookPath: string, chapterId: string): Promise<void> {
  return invoke('move_chapter_up', { bookPath, chapterId });
}

export function moveChapterDown(bookPath: string, chapterId: string): Promise<void> {
  return invoke('move_chapter_down', { bookPath, chapterId });
}

export function gitStatus(bookPath: string): Promise<string> {
  return invoke('git_status', { bookPath });
}

export function gitCommit(bookPath: string, message: string): Promise<void> {
  return invoke('git_commit', { bookPath, message });
}

export function gitLog(bookPath: string, maxCount?: number): Promise<CommitInfo[]> {
  return invoke('git_log', { bookPath, maxCount });
}
