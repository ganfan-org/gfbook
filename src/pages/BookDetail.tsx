import HomeIcon from '@mui/icons-material/Home'
import SearchIcon from '@mui/icons-material/Search'
import SettingsIcon from '@mui/icons-material/Settings'
import {
  Alert,
  Box,
  Typography,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  TextField,
} from '@mui/material'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import BookSettingsDialog from '../components/BookSettingsDialog'
import ChapterEditor from '../components/ChapterEditor'
import type { SaveStatus } from '../components/ChapterEditor'
import ChapterTree from '../components/ChapterTree'
import DiaryTimeline from '../components/DiaryTimeline'
import SearchDialog from '../components/SearchDialog'
import { useBook } from '../hooks/useBook'
import { useBookActivity } from '../hooks/useBookActivity'
import { useRepoState } from '../hooks/useRepoState'
import type { BookIdentity, BookInfo, Chapter } from '../types'
import {
  attemptMerge,
  deleteBook,
  enableVersionControl,
  formatInvokeError,
  getBookIdentity,
  renameBook,
  resolveConflict,
  revealInFinder,
  setBookIdentity,
} from '../utils/commands'

interface BookDetailProps {
  bookInfo: BookInfo
  initialChapterId?: string | null
  onBack: () => void
}

export default function BookDetail({
  bookInfo,
  initialChapterId,
  onBack,
}: BookDetailProps) {
  const { t } = useTranslation()
  const bookPath = bookInfo.path
  const {
    meta,
    selectedChapterId,
    chapterContent,
    selectChapter,
    saveChapter,
    createChapter,
    createDiaryEntry,
    renameDiaryEntry,
    changeDiaryDate,
    removeChapter,
    renameChapterById,
    moveUp,
    moveDown,
    moveChapterTo,
    commit,
    autoCommit,
    getRemoteUrl,
    setRemoteUrl: setRemoteUrlApi,
    fetchRemote,
    pullRemote,
    pushRemote,
    refreshMeta,
  } = useBook(bookPath)

  const {
    repoState,
    loading: repoLoading,
    error: repoError,
    refresh: refreshRepoState,
    scheduleRefresh,
  } = useRepoState(bookPath)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [addTitle, setAddTitle] = useState('')
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [remoteUrlState, setRemoteUrlState] = useState('')
  const [syncingType, setSyncingType] = useState<string | null>(null)
  const [remoteUrlDraft, setRemoteUrlDraft] = useState('')
  const [syncOutput, setSyncOutput] = useState('')
  const [drawerWidth, setDrawerWidth] = useState(280)
  const resizingRef = useRef(false)
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([])
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set())
  const [mergeInProgress, setMergeInProgress] = useState(false)
  const [localTitle, setLocalTitle] = useState(bookInfo.title)
  const [searchOpen, setSearchOpen] = useState(false)
  const [identity, setIdentity] = useState<BookIdentity | null>(null)
  const [identityLoading, setIdentityLoading] = useState(false)
  const [gitError, setGitError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ chapterId: string; content: string } | null>(
    null,
  )

  const runAutoCommit = useCallback(
    (message: string) => {
      void autoCommit(message).catch((e) =>
        setGitError(formatInvokeError(e)),
      )
    },
    [autoCommit],
  )

  useEffect(() => {
    if (repoError) setGitError(repoError)
  }, [repoError])

  const {
    activity,
    loading: activityLoading,
    error: activityError,
    refresh: refreshActivity,
  } = useBookActivity(bookPath, commitDialogOpen)

  const refreshIdentity = useCallback(async () => {
    setIdentityLoading(true)
    try {
      setIdentity(await getBookIdentity(bookPath))
    } catch (e) {
      setIdentity(null)
      setGitError(formatInvokeError(e))
    } finally {
      setIdentityLoading(false)
    }
  }, [bookPath])

  const handleOpenSettings = useCallback(async () => {
    setCommitMessage('')
    setSyncOutput('')
    setCommitDialogOpen(true)
    void refreshActivity()
    const state = await refreshRepoState()
    // 未初始化仓库时不再读取身份与远程，避免弹出无意义的错误
    if (!state?.initialized) return
    await refreshIdentity()
    try {
      const url = await getRemoteUrl()
      setRemoteUrlState(url || '')
      setRemoteUrlDraft(url || '')
    } catch (e) {
      setGitError(formatInvokeError(e))
    }
  }, [
    getRemoteUrl,
    refreshRepoState,
    refreshIdentity,
    refreshActivity,
    setGitError,
  ])

  const handleEnableRepo = useCallback(async () => {
    setSyncOutput('')
    try {
      await enableVersionControl(bookPath)
      await refreshRepoState()
      await refreshIdentity()
      void refreshActivity()
    } catch (e) {
      const message = formatInvokeError(e)
      setSyncOutput(message)
      setGitError(message)
      throw e
    }
  }, [
    bookPath,
    refreshRepoState,
    refreshIdentity,
    refreshActivity,
    setGitError,
  ])

  // Select initial chapter from search result
  useEffect(() => {
    if (initialChapterId && selectChapter) {
      selectChapter(initialChapterId)
    }
  }, [initialChapterId, selectChapter])

  const handleAttemptMerge = useCallback(async () => {
    if (!bookPath) return
    setMergeInProgress(true)
    setSyncingType('merge')
    setSyncOutput('')
    try {
      await attemptMerge(bookPath)
    } catch (e) {
      const message = formatInvokeError(e)
      setSyncOutput(message)
      setGitError(message)
      setMergeInProgress(false)
      setSyncingType(null)
    }
  }, [bookPath])

  const handleResolveFile = useCallback(
    async (filePath: string, useTheirs: boolean) => {
      if (!bookPath) return
      try {
        await resolveConflict(bookPath, filePath, useTheirs)
        setResolvedFiles((prev) => new Set([...prev, filePath]))
      } catch (e) {
        const message = formatInvokeError(e)
        setSyncOutput(`Failed to resolve ${filePath}: ${message}`)
        setGitError(message)
      }
    },
    [bookPath],
  )

  const handleCommitMerge = useCallback(async () => {
    if (!bookPath) return
    try {
      await commit('Merge remote changes')
      setConflictedFiles([])
      setResolvedFiles(new Set())
      setSyncOutput('Merge committed.')
      await refreshRepoState()
      void refreshActivity()
    } catch (e) {
      const message = formatInvokeError(e)
      setSyncOutput(message)
      setGitError(message)
    }
  }, [bookPath, commit, refreshRepoState, refreshActivity])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizingRef.current = true
      const startX = e.clientX
      const startWidth = drawerWidth

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return
        const newWidth = Math.max(
          180,
          Math.min(500, startWidth + ev.clientX - startX),
        )
        setDrawerWidth(newWidth)
      }

      const onMouseUp = () => {
        resizingRef.current = false
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [drawerWidth],
  )

  // Auto-commit every 10 minutes
  useEffect(() => {
    const id = setInterval(
      () => {
        runAutoCommit('auto-save')
      },
      10 * 60 * 1000,
    )
    return () => clearInterval(id)
  }, [runAutoCommit])

  // Auto-commit on chapter switch
  const prevChapterRef = useRef(selectedChapterId)
  useEffect(() => {
    if (
      prevChapterRef.current &&
      prevChapterRef.current !== selectedChapterId
    ) {
      runAutoCommit('auto-save before switch')
    }
    prevChapterRef.current = selectedChapterId
  }, [selectedChapterId, runAutoCommit])

  // Auto-commit on unmount (app close / back to shelf)
  useEffect(() => {
    return () => {
      autoCommit('auto-save').catch(() => {})
    }
  }, [autoCommit])

  // Listen for async git operation results
  useEffect(() => {
    const unlisten = listen<{ type: string; ok: boolean; message: string }>(
      'git:done',
      async (event) => {
        setSyncingType(null)
        if (event.payload.type === 'merge') {
          setMergeInProgress(false)
          if (event.payload.ok) {
            const msg = event.payload.message
            if (msg.startsWith('conflicts:')) {
              const files = msg.replace('conflicts:', '').split(',')
              setConflictedFiles(files)
              setResolvedFiles(new Set())
              setSyncOutput('Merge conflict detected. Resolve each file below.')
            } else {
              setConflictedFiles([])
              setSyncOutput(msg)
              await refreshRepoState()
              void refreshActivity()
            }
          } else {
            setSyncOutput(event.payload.message)
            setGitError(event.payload.message)
          }
        } else {
          setSyncOutput(event.payload.message)
          if (event.payload.ok) {
            await refreshRepoState()
            void refreshActivity()
          } else {
            setGitError(event.payload.message)
          }
        }
      },
    )
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [refreshRepoState, refreshActivity])

  const selectedChapter = useMemo(() => {
    if (!meta || !selectedChapterId) return null
    const find = (chapters: Chapter[]): Chapter | null => {
      for (const ch of chapters) {
        if (ch.id === selectedChapterId) return ch
        const found = find(ch.chapters)
        if (found) return found
      }
      return null
    }
    return find(meta.chapters)
  }, [meta, selectedChapterId])

  const isDiary = (meta?.kind ?? bookInfo.kind) === 'diary'

  const diaryEntries = useMemo(() => {
    if (!meta) return []
    return meta.chapters.filter((ch) => !!ch.date)
  }, [meta])

  // 打开日记本时默认落在最近一篇（仅首次加载时自动选择）
  const autoSelectedRef = useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current) return
    if (!isDiary || !meta || selectedChapterId || initialChapterId) return
    autoSelectedRef.current = true
    const sorted = [...diaryEntries].sort((a, b) => {
      const byDate = (b.date ?? '').localeCompare(a.date ?? '')
      if (byDate !== 0) return byDate
      // 同一天多条时，默认打开最近创建的一篇
      return (b.created_time ?? 0) - (a.created_time ?? 0)
    })
    if (sorted.length > 0) selectChapter(sorted[0].id)
  }, [isDiary, meta, selectedChapterId, initialChapterId, diaryEntries, selectChapter])

  const handleWriteDate = useCallback(
    async (date: string) => {
      try {
        const chapter = await createDiaryEntry(date)
        await selectChapter(chapter.id)
      } catch (e) {
        setGitError(formatInvokeError(e))
      }
    },
    [selectChapter, createDiaryEntry],
  )

  const handleRenameDiaryEntry = useCallback(
    async (id: string, title: string) => {
      await renameDiaryEntry(id, title)
      if (selectedChapterId === id) await selectChapter(id)
    },
    [renameDiaryEntry, selectedChapterId, selectChapter],
  )

  const handleChangeDiaryDate = useCallback(
    async (id: string, date: string) => {
      await changeDiaryDate(id, date)
      if (selectedChapterId === id) await selectChapter(id)
    },
    [changeDiaryDate, selectedChapterId, selectChapter],
  )

  const handleAddChapter = useCallback((parentId: string | null) => {
    setAddParentId(parentId)
    setAddTitle('')
    setAddDialogOpen(true)
  }, [])

  const handleCreateChapter = async () => {
    if (!addTitle.trim()) return
    try {
      const chapter = await createChapter(addParentId, addTitle.trim())
      setAddDialogOpen(false)
      setAddTitle('')
      selectChapter(chapter.id)
    } catch (e) {
      setGitError(formatInvokeError(e))
    }
  }

  const clearSaveRetry = useCallback(() => {
    if (saveRetryRef.current) {
      clearTimeout(saveRetryRef.current)
      saveRetryRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      if (saveRetryRef.current) clearTimeout(saveRetryRef.current)
    },
    [],
  )

  const persistChapter = useCallback(
    async function persist(
      chapterId: string,
      markdown: string,
      attempt = 0,
    ): Promise<void> {
      setSaveStatus('saving')
      setSaveError(null)
      try {
        await saveChapter(chapterId, markdown)
        pendingSaveRef.current = null
        setSaveStatus('saved')
        scheduleRefresh()
      } catch (e) {
        const message = formatInvokeError(e)
        setSaveStatus('error')
        setSaveError(message)
        pendingSaveRef.current = { chapterId, content: markdown }
        if (attempt < 2) {
          clearSaveRetry()
          saveRetryRef.current = setTimeout(() => {
            void persist(chapterId, markdown, attempt + 1)
          }, 2000)
        }
      }
    },
    [saveChapter, scheduleRefresh, clearSaveRetry],
  )

  const handleSaveContent = useCallback(
    (markdown: string) => {
      if (!selectedChapterId) return
      clearSaveRetry()
      void persistChapter(selectedChapterId, markdown)
    },
    [selectedChapterId, persistChapter, clearSaveRetry],
  )

  const handleEditorDirty = useCallback(() => {
    setSaveStatus((current) => (current === 'saving' ? current : 'dirty'))
    setSaveError(null)
  }, [])

  const handleRetrySave = useCallback(() => {
    const pending = pendingSaveRef.current
    if (!pending) return
    clearSaveRetry()
    void persistChapter(pending.chapterId, pending.content)
  }, [persistChapter, clearSaveRetry])

  const handleDeleteChapter = useCallback(
    async (id: string) => {
      try {
        await removeChapter(id)
      } catch (e) {
        setGitError(formatInvokeError(e))
      }
    },
    [removeChapter],
  )

  const handleRenameChapter = useCallback(
    async (id: string, title: string) => {
      try {
        await renameChapterById(id, title)
      } catch (e) {
        setGitError(formatInvokeError(e))
      }
    },
    [renameChapterById],
  )

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return
    try {
      await commit(commitMessage.trim())
      setCommitMessage('')
      await refreshRepoState()
      void refreshActivity()
    } catch (e) {
      setGitError(formatInvokeError(e))
    }
  }, [commitMessage, commit, refreshRepoState, refreshActivity])

  const handleMoveChapter = useCallback(
    async (
      chapterId: string,
      targetId: string | null,
      position: 'inner' | 'before' | 'after',
    ) => {
      try {
        await moveChapterTo(chapterId, targetId, position)
      } catch (e) {
        setGitError(formatInvokeError(e))
      }
    },
    [moveChapterTo],
  )

  const handleSaveIdentity = useCallback(
    async (name: string, email: string) => {
      try {
        await setBookIdentity(bookPath, name, email)
        await refreshIdentity()
        await refreshRepoState()
        void refreshActivity()
      } catch (e) {
        const message = formatInvokeError(e)
        setGitError(message)
        throw e
      }
    },
    [bookPath, refreshIdentity, refreshRepoState, refreshActivity],
  )

  const handleSetRemoteUrl = useCallback(async () => {
    try {
      await setRemoteUrlApi(remoteUrlDraft)
      setRemoteUrlState(remoteUrlDraft)
      await refreshRepoState()
      setSyncOutput(t('bookSettings.remoteSaved'))
    } catch (e) {
      const message = formatInvokeError(e)
      setSyncOutput(message)
      setGitError(message)
      throw e
    }
  }, [setRemoteUrlApi, remoteUrlDraft, refreshRepoState, t])

  const runSync = useCallback(
    async (type: 'fetch' | 'pull' | 'push', action: () => Promise<string>) => {
      setSyncingType(type)
      setSyncOutput('')
      try {
        await action()
      } catch (e) {
        const message = formatInvokeError(e)
        setSyncingType(null)
        setSyncOutput(message)
        setGitError(message)
      }
    },
    [],
  )

  const repoSummary = useMemo(() => {
    if (!repoState) return ''
    if (!repoState.initialized) return t('repo.noRepo')
    const parts: string[] = []
    parts.push(
      repoState.detached
        ? t('repo.detached')
        : repoState.branch || t('repo.unborn'),
    )
    if (repoState.remote_url) {
      if (repoState.ahead > 0) parts.push(`↑${repoState.ahead}`)
      if (repoState.behind > 0) parts.push(`↓${repoState.behind}`)
      if (repoState.ahead === 0 && repoState.behind === 0) {
        parts.push(t('repo.synced'))
      }
    } else {
      parts.push(t('repo.noRemote'))
    }
    if (repoState.dirty.length > 0) {
      parts.push(t('repo.uncommitted', { n: repoState.dirty.length }))
    }
    return parts.join(' · ')
  }, [repoState, t])

  const repoDotColor = !repoState?.initialized
    ? 'text.disabled'
    : repoState.conflicted.length > 0
      ? 'error.main'
      : repoState.dirty.length > 0
        ? 'warning.main'
        : repoState.remote_url
          ? 'success.main'
          : 'info.main'

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Box
        sx={{
          width: drawerWidth,
          minWidth: 180,
          maxWidth: 500,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'var(--color-bg-tertiary)',
            borderRight: 1,
            borderColor: 'divider',
            minWidth: 0,
          }}
        >
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={onBack} size="small">
              <HomeIcon />
            </IconButton>
            <Typography
              variant="h6"
              fontWeight={600}
              noWrap
              sx={{ flex: 1, minWidth: 0 }}
            >
              {localTitle}
            </Typography>
            <IconButton
              onClick={() => setSearchOpen(true)}
              size="small"
              sx={{ flexShrink: 0 }}
            >
              <SearchIcon />
            </IconButton>
          </Box>
          <Divider />
          <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {meta &&
              (isDiary ? (
                <DiaryTimeline
                  entries={diaryEntries}
                  selectedId={selectedChapterId}
                  onSelect={selectChapter}
                  onCreate={handleWriteDate}
                  onDelete={handleDeleteChapter}
                  onRename={handleRenameDiaryEntry}
                  onChangeDate={handleChangeDiaryDate}
                />
              ) : (
                <ChapterTree
                  chapters={meta.chapters}
                  selectedId={selectedChapterId}
                  onSelect={selectChapter}
                  onAddChild={handleAddChapter}
                  onRename={handleRenameChapter}
                  onDelete={handleDeleteChapter}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                  onMoveChapter={handleMoveChapter}
                />
              ))}
          </Box>
          <Box
            onClick={() => void handleOpenSettings()}
            sx={{
              p: 1,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: repoDotColor,
              }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ fontSize: '0.7rem', flex: 1, minWidth: 0 }}
            >
              {repoSummary || t('repo.loading')}
            </Typography>
            <SettingsIcon
              sx={{ fontSize: 16, color: 'text.secondary', opacity: 0.6 }}
            />
          </Box>
        </Box>
        {/* Drag handle */}
        <Box
          onMouseDown={handleResizeStart}
          sx={{
            width: 6,
            cursor: 'col-resize',
            flexShrink: 0,
            bgcolor: 'transparent',
            backgroundClip: 'content-box',
            px: 1,
            mx: '-1px',
            zIndex: 10,
            '&:hover': { bgcolor: 'primary.main', opacity: 0.2 },
            '&:active': { bgcolor: 'primary.main', opacity: 0.35 },
            transition: 'background-color 0.1s',
          }}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {selectedChapter ? (
          <ChapterEditor
            key={selectedChapter.id}
            bookPath={bookPath}
            content={chapterContent}
            onContentChange={handleSaveContent}
            saveStatus={saveStatus}
            saveError={saveError}
            onDirty={handleEditorDirty}
            onRetrySave={handleRetrySave}
            onReloadContent={() => {
              void selectChapter(selectedChapter.id)
            }}
          />
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
            }}
          >
            <Typography variant="h6">
              {t(isDiary ? 'diary.selectEntry' : 'bookDetail.selectChapter')}
            </Typography>
          </Box>
        )}
      </Box>

      <BookSettingsDialog
        open={commitDialogOpen}
        onClose={() => {
          setCommitDialogOpen(false)
          setSyncOutput('')
        }}
        bookPath={bookPath}
        bookTitle={localTitle}
        updatedTime={bookInfo.updated_time}
        onRename={async (title) => {
          await renameBook(bookPath, title)
          setLocalTitle(title)
          refreshMeta()
        }}
        onDelete={async () => {
          await deleteBook(bookPath)
          setCommitDialogOpen(false)
          onBack()
        }}
        onRevealInFinder={() => revealInFinder(bookPath)}
        repoState={repoState}
        repoLoading={repoLoading}
        onEnableRepo={handleEnableRepo}
        commitMessage={commitMessage}
        setCommitMessage={setCommitMessage}
        onCommit={handleCommit}
        remoteUrl={remoteUrlState}
        remoteDraft={remoteUrlDraft}
        onRemoteDraftChange={setRemoteUrlDraft}
        onLoadRemote={async () => {
          const url = await getRemoteUrl()
          setRemoteUrlState(url || '')
          setRemoteUrlDraft(url || '')
        }}
        onSetRemoteUrl={handleSetRemoteUrl}
        onFetch={() => runSync('fetch', fetchRemote)}
        onPull={() => runSync('pull', pullRemote)}
        onPush={() => runSync('push', pushRemote)}
        onMerge={handleAttemptMerge}
        syncingType={syncingType}
        mergeInProgress={mergeInProgress}
        conflictedFiles={conflictedFiles}
        resolvedFiles={resolvedFiles}
        onResolveFile={handleResolveFile}
        onCommitMerge={handleCommitMerge}
        syncOutput={syncOutput}
        identity={identity}
        identityLoading={identityLoading}
        onSaveIdentity={handleSaveIdentity}
        activity={activity}
        activityLoading={activityLoading}
        activityError={activityError}
        onRefreshActivity={refreshActivity}
      />

      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('bookDetail.newChapter')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('bookDetail.chapterTitle')}
            fullWidth
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateChapter()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreateChapter}
            variant="contained"
            disabled={!addTitle.trim()}
          >
            {t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        bookPaths={[bookPath]}
        onSelectChapter={(_bookPath, chapterId) => {
          selectChapter(chapterId)
          setSearchOpen(false)
        }}
      />

      <Snackbar
        open={!!gitError}
        autoHideDuration={6000}
        onClose={() => setGitError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setGitError(null)}
        >
          {gitError}
        </Alert>
      </Snackbar>
    </Box>
  )
}
