import { useState, useCallback, useEffect } from 'react';

import type { BookInfo, BookKind } from '../types';
import { listBooks, newBook as apiNewBook, deleteBook as apiDeleteBook, renameBook as apiRenameBook, importBook as apiImportBook, importMarkdownDir as apiImportMarkdownDir, getBooksDir as apiGetBooksDir, setBooksDir as apiSetBooksDir, getGlobalGitUser, setGlobalGitUser, getProxySetting, setProxySetting } from '../utils/commands';

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

  const createBook = useCallback(async (title: string, kind?: BookKind, bookDir?: string): Promise<BookInfo> => {
    const book = await apiNewBook(title, bookDir, kind);
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

  const importMarkdownBook = useCallback(async (folderPath: string, title?: string): Promise<BookInfo> => {
    const book = await apiImportMarkdownDir(folderPath, title);
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

  const getGlobalSettings = useCallback(async () => {
    const [name, email] = await getGlobalGitUser();
    const proxy = await getProxySetting();
    return { name, email, proxy };
  }, []);

  const setGlobalSettings = useCallback(async (name: string, email: string, proxy: string) => {
    await setGlobalGitUser(name, email);
    await setProxySetting(proxy);
  }, []);

  return { books, loading, refresh, createBook, removeBook, changeBookName, importExternalBook, importMarkdownBook, getBooksDirectory, getGlobalSettings, setGlobalSettings };
}
