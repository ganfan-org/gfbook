import { useState, useCallback } from 'react'

import type { BookMeta, Chapter } from '../types'
import {
  getBookMeta,
  readChapter,
  writeChapter,
  newChapter as apiNewChapter,
  newDiaryEntry as apiNewDiaryEntry,
  renameDiaryEntry as apiRenameDiaryEntry,
  updateDiaryDate as apiUpdateDiaryDate,
  deleteChapter as apiDeleteChapter,
  renameChapter as apiRenameChapter,
  moveChapter as apiMoveChapter,
  moveChapterUp as apiMoveChapterUp,
  moveChapterDown as apiMoveChapterDown,
} from '../utils/commands'

export function useBookChapters(bookPath: string | null) {
  const [meta, setMeta] = useState<BookMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null,
  )
  const [chapterContent, setChapterContent] = useState('')

  const refreshMeta = useCallback(async () => {
    if (!bookPath) return
    setLoading(true)
    try {
      const m = await getBookMeta(bookPath)
      setMeta(m)
    } catch (e) {
      console.error('Failed to load book meta:', e)
    } finally {
      setLoading(false)
    }
  }, [bookPath])

  const selectChapter = useCallback(
    async (chapterId: string) => {
      if (!bookPath) return
      try {
        const content = await readChapter(bookPath, chapterId)
        setChapterContent(content)
        setSelectedChapterId(chapterId)
      } catch (e) {
        console.error('Failed to read chapter:', e)
        setChapterContent('')
        setSelectedChapterId(chapterId)
      }
    },
    [bookPath],
  )

  const saveChapter = useCallback(
    async (chapterId: string, content: string) => {
      if (!bookPath) return
      await writeChapter(bookPath, chapterId, content)
      setChapterContent(content)
      await refreshMeta()
    },
    [bookPath, refreshMeta],
  )

  const createChapter = useCallback(
    async (parentId: string | null, title: string): Promise<Chapter> => {
      if (!bookPath) throw new Error('No book selected')
      const chapter = await apiNewChapter(bookPath, parentId, title)
      await refreshMeta()
      return chapter
    },
    [bookPath, refreshMeta],
  )

  const createDiaryEntry = useCallback(
    async (date: string): Promise<Chapter> => {
      if (!bookPath) throw new Error('No book selected')
      const chapter = await apiNewDiaryEntry(bookPath, date)
      await refreshMeta()
      return chapter
    },
    [bookPath, refreshMeta],
  )

  const renameDiaryEntry = useCallback(
    async (chapterId: string, title: string): Promise<Chapter> => {
      if (!bookPath) throw new Error('No book selected')
      const chapter = await apiRenameDiaryEntry(bookPath, chapterId, title)
      await refreshMeta()
      return chapter
    },
    [bookPath, refreshMeta],
  )

  const changeDiaryDate = useCallback(
    async (chapterId: string, date: string): Promise<Chapter> => {
      if (!bookPath) throw new Error('No book selected')
      const chapter = await apiUpdateDiaryDate(bookPath, chapterId, date)
      await refreshMeta()
      return chapter
    },
    [bookPath, refreshMeta],
  )

  const removeChapter = useCallback(
    async (chapterId: string) => {
      if (!bookPath) throw new Error('No book selected')
      await apiDeleteChapter(bookPath, chapterId)
      if (selectedChapterId === chapterId) {
        setSelectedChapterId(null)
        setChapterContent('')
      }
      await refreshMeta()
    },
    [bookPath, selectedChapterId, refreshMeta],
  )

  const renameChapterById = useCallback(
    async (chapterId: string, newTitle: string) => {
      if (!bookPath) throw new Error('No book selected')
      await apiRenameChapter(bookPath, chapterId, newTitle)
      await refreshMeta()
    },
    [bookPath, refreshMeta],
  )

  const moveChapterTo = useCallback(
    async (
      chapterId: string,
      targetId: string | null,
      position: 'inner' | 'before' | 'after' = 'inner',
    ) => {
      if (!bookPath) throw new Error('No book selected')
      await apiMoveChapter(bookPath, chapterId, targetId, position)
      await refreshMeta()
    },
    [bookPath, refreshMeta],
  )

  const moveUp = useCallback(
    async (chapterId: string) => {
      if (!bookPath) throw new Error('No book selected')
      await apiMoveChapterUp(bookPath, chapterId)
      await refreshMeta()
    },
    [bookPath, refreshMeta],
  )

  const moveDown = useCallback(
    async (chapterId: string) => {
      if (!bookPath) throw new Error('No book selected')
      await apiMoveChapterDown(bookPath, chapterId)
      await refreshMeta()
    },
    [bookPath, refreshMeta],
  )

  return {
    meta,
    loading,
    selectedChapterId,
    chapterContent,
    refreshMeta,
    selectChapter,
    saveChapter,
    createChapter,
    createDiaryEntry,
    renameDiaryEntry,
    changeDiaryDate,
    removeChapter,
    renameChapterById,
    moveChapterTo,
    moveUp,
    moveDown,
  }
}
