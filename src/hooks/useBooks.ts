import { useState, useCallback, useEffect } from 'react';

import type { BookInfo, SyncConfig } from '../types';
import { listBooks, newBook as apiNewBook, deleteBook as apiDeleteBook, renameBook as apiRenameBook, importBook as apiImportBook, getBooksDir as apiGetBooksDir, setBooksDir as apiSetBooksDir, getSyncConfig as apiGetSyncConfig, setSyncConfig as apiSetSyncConfig, syncNow as apiSyncNow } from '../utils/commands';

export function useBooks() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listBooks();
      setBooks(result);
    } catch (e) {
      console.error('Failed to list books:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createBook = useCallback(async (title: string): Promise<BookInfo> => {
    const book = await apiNewBook(title);
    await refresh();
    return book;
  }, [refresh]);

  const removeBook = useCallback(async (bookPath: string) => {
    await apiDeleteBook(bookPath);
    await refresh();
  }, [refresh]);

  const importExternalBook = useCallback(async (folderPath: string): Promise<BookInfo> => {
    const book = await apiImportBook(folderPath);
    await refresh();
    return book;
  }, [refresh]);

  const changeBookName = useCallback(async (bookPath: string, newTitle: string): Promise<BookInfo> => {
    const book = await apiRenameBook(bookPath, newTitle);
    await refresh();
    return book;
  }, [refresh]);

  const getBooksDirectory = useCallback(async (): Promise<string> => {
    return apiGetBooksDir();
  }, []);

  const changeBooksDirectory = useCallback(async (dir: string): Promise<void> => {
    await apiSetBooksDir(dir);
  }, []);

  const getSyncConfig = useCallback(async (): Promise<SyncConfig | null> => {
    return apiGetSyncConfig();
  }, []);

  const updateSyncConfig = useCallback(async (enabled: boolean, path: string): Promise<SyncConfig> => {
    const config = await apiSetSyncConfig(enabled, path);
    return config;
  }, []);

  const syncNow = useCallback(async (): Promise<string> => {
    const result = await apiSyncNow();
    await refresh();
    return result;
  }, [refresh]);

  return { books, loading, refresh, createBook, removeBook, changeBookName, importExternalBook, getSyncConfig, updateSyncConfig, syncNow };
}
