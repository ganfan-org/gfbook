import { useState, useCallback, useEffect } from 'react';

import type { BookMeta, Chapter, CommitInfo } from '../types';
import {
  getBookMeta,
  readChapter,
  writeChapter,
  newChapter as apiNewChapter,
  deleteChapter as apiDeleteChapter,
  renameChapter as apiRenameChapter,
  moveChapter as apiMoveChapter,
  moveChapterUp as apiMoveChapterUp,
  moveChapterDown as apiMoveChapterDown,
  gitStatus,
  gitCommit,
  gitLog,
  gitRemoteUrl,
  gitRemoteSetUrl,
  gitFetch,
  gitPull,
  gitPush,
  gitAheadBehind,
} from '../utils/commands';

export function useBook(bookPath: string | null) {
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState('');
  const [gitStatusText, setGitStatusText] = useState('');
  const [commits, setCommits] = useState<CommitInfo[]>([]);

  const refreshMeta = useCallback(async () => {
    if (!bookPath) return;
    setLoading(true);
    try {
      const m = await getBookMeta(bookPath);
      setMeta(m);
    } catch (e) {
      console.error('Failed to load book meta:', e);
    } finally {
      setLoading(false);
    }
  }, [bookPath]);

  const refreshGitStatus = useCallback(async () => {
    if (!bookPath) return;
    try {
      const status = await gitStatus(bookPath);
      setGitStatusText(status);
      const log = await gitLog(bookPath);
      setCommits(log);
    } catch {
      // git not available
    }
  }, [bookPath]);

  useEffect(() => {
    if (bookPath) {
      refreshMeta();
      refreshGitStatus();
    }
  }, [bookPath, refreshMeta, refreshGitStatus]);

  const selectChapter = useCallback(async (chapterId: string) => {
    if (!bookPath) return;
    try {
      const content = await readChapter(bookPath, chapterId);
      setChapterContent(content);
      setSelectedChapterId(chapterId);
    } catch (e) {
      console.error('Failed to read chapter:', e);
      setChapterContent('');
      setSelectedChapterId(chapterId);
    }
  }, [bookPath]);

  const saveChapter = useCallback(async (chapterId: string, content: string) => {
    if (!bookPath) return;
    await writeChapter(bookPath, chapterId, content);
    setChapterContent(content);
    await refreshMeta();
    await refreshGitStatus();
  }, [bookPath, refreshMeta, refreshGitStatus]);

  const createChapter = useCallback(async (parentId: string | null, title: string): Promise<Chapter> => {
    if (!bookPath) throw new Error('No book selected');
    const chapter = await apiNewChapter(bookPath, parentId, title);
    await refreshMeta();
    await refreshGitStatus();
    return chapter;
  }, [bookPath, refreshMeta, refreshGitStatus]);

  const removeChapter = useCallback(async (chapterId: string) => {
    if (!bookPath) throw new Error('No book selected');
    await apiDeleteChapter(bookPath, chapterId);
    if (selectedChapterId === chapterId) {
      setSelectedChapterId(null);
      setChapterContent('');
    }
    await refreshMeta();
    await refreshGitStatus();
  }, [bookPath, selectedChapterId, refreshMeta, refreshGitStatus]);

  const renameChapterById = useCallback(async (chapterId: string, newTitle: string) => {
    if (!bookPath) throw new Error('No book selected');
    await apiRenameChapter(bookPath, chapterId, newTitle);
    await refreshMeta();
  }, [bookPath, refreshMeta]);

  const moveChapterTo = useCallback(async (chapterId: string, targetId: string | null, position: 'inner' | 'before' | 'after' = 'inner') => {
    if (!bookPath) throw new Error('No book selected');
    console.log('[useBook] moveChapterTo calling API:', { bookPath, chapterId, targetId, position });
    await apiMoveChapter(bookPath, chapterId, targetId, position);
    console.log('[useBook] API succeeded, refreshing meta');
    await refreshMeta();
    await refreshGitStatus();
    console.log('[useBook] refresh done');
  }, [bookPath, refreshMeta, refreshGitStatus]);

  const moveUp = useCallback(async (chapterId: string) => {
    if (!bookPath) throw new Error('No book selected');
    await apiMoveChapterUp(bookPath, chapterId);
    await refreshMeta();
  }, [bookPath, refreshMeta]);

  const moveDown = useCallback(async (chapterId: string) => {
    if (!bookPath) throw new Error('No book selected');
    await apiMoveChapterDown(bookPath, chapterId);
    await refreshMeta();
  }, [bookPath, refreshMeta]);

  const commit = useCallback(async (message: string) => {
    if (!bookPath) throw new Error('No book selected');
    await gitCommit(bookPath, message);
    await refreshGitStatus();
  }, [bookPath, refreshGitStatus]);

  const getRemoteUrl = useCallback(async (): Promise<string | null> => {
    if (!bookPath) return null;
    return gitRemoteUrl(bookPath);
  }, [bookPath]);

  const setRemoteUrl = useCallback(async (url: string): Promise<void> => {
    if (!bookPath) throw new Error('No book selected');
    await gitRemoteSetUrl(bookPath, url);
  }, [bookPath]);

  const fetchRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected');
    const result = await gitFetch(bookPath);
    await refreshGitStatus();
    return result;
  }, [bookPath, refreshGitStatus]);

  const pullRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected');
    const result = await gitPull(bookPath);
    await refreshGitStatus();
    return result;
  }, [bookPath, refreshGitStatus]);

  const pushRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected');
    const result = await gitPush(bookPath);
    await refreshGitStatus();
    return result;
  }, [bookPath, refreshGitStatus]);

  const getAheadBehind = useCallback(async (): Promise<[number, number]> => {
    if (!bookPath) return [0, 0];
    return gitAheadBehind(bookPath);
  }, [bookPath]);

  return {
    meta, loading, selectedChapterId, chapterContent, gitStatusText, commits,
    selectChapter, saveChapter, createChapter, removeChapter,
    renameChapterById, moveChapterTo, moveUp, moveDown, commit, refreshMeta, refreshGitStatus,
    getRemoteUrl, setRemoteUrl, fetchRemote, pullRemote, pushRemote, getAheadBehind,
  };
}
