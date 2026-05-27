import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import SettingsIcon from '@mui/icons-material/Settings'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import {
  Box,
  Typography,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import ChapterEditor from '../components/ChapterEditor'
import ChapterTree from '../components/ChapterTree'
import BookSettingsDialog from '../components/BookSettingsDialog'
import { useBook } from '../hooks/useBook'
import {
  revealInFinder,
  gitListConflicted,
  resolveConflict,
  attemptMerge,
  readBookLogs,
  deleteBook,
  renameBook,
} from '../utils/commands'
import type { LogEntry } from '../utils/commands'
import type { Chapter } from '../types'

interface BookDetailProps {
  bookPath: string
  onBack: () => void
}

export default function BookDetail({ bookPath, onBack }: BookDetailProps) {
  const {
    meta,
    selectedChapterId,
    chapterContent,
    selectChapter,
    saveChapter,
    createChapter,
    removeChapter,
    renameChapterById,
    moveUp,
    moveDown,
    moveChapterTo,
    gitStatusText,
    commit,
    autoCommit,
    getRemoteUrl,
    setRemoteUrl: setRemoteUrlApi,
    fetchRemote,
    pullRemote,
    pushRemote,
    getAheadBehind,
    getUserConfig,
    refreshGitStatus,
    refreshMeta,
  } = useBook(bookPath)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [addTitle, setAddTitle] = useState('')
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [remoteUrlState, setRemoteUrlState] = useState('')
  const [syncingType, setSyncingType] = useState<string | null>(null)
  const [remoteUrlDraft, setRemoteUrlDraft] = useState('')
  const [syncOutput, setSyncOutput] = useState('')
  const [gitName, setGitName] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [drawerWidth, setDrawerWidth] = useState(280)
  const resizingRef = useRef(false)
  const [aheadBehind, setAheadBehind] = useState<[number, number] | null>(null)
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([])
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set())
  const [mergeInProgress, setMergeInProgress] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const refreshLogs = useCallback(async () => {
    try {
      const entries = await readBookLogs(200, bookPath)
      const reversed = entries.reverse()
      setLogs(reversed)
      return reversed
    } catch {
      return [] as LogEntry[]
    }
  }, [bookPath])

  const refreshAheadBehind = useCallback(async () => {
    if (!bookPath) return
    try {
      const ab = await getAheadBehind()
      setAheadBehind(ab)
    } catch {
      setAheadBehind(null)
    }
  }, [bookPath, getAheadBehind])

  const handleAttemptMerge = useCallback(async () => {
    if (!bookPath) return
    setMergeInProgress(true)
    setSyncingType('merge')
    setSyncOutput('')
    try {
      await attemptMerge(bookPath)
    } catch (e) {
      setSyncOutput(String(e))
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
        setSyncOutput(`Failed to resolve ${filePath}: ${e}`)
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
      refreshGitStatus()
      refreshAheadBehind()
    } catch (e) {
      setSyncOutput(String(e))
    }
  }, [bookPath, commit, refreshGitStatus, refreshAheadBehind])

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
        autoCommit('auto-save')
      },
      10 * 60 * 1000,
    )
    return () => clearInterval(id)
  }, [autoCommit])

  // Auto-commit on chapter switch
  const prevChapterRef = useRef(selectedChapterId)
  useEffect(() => {
    if (
      prevChapterRef.current &&
      prevChapterRef.current !== selectedChapterId
    ) {
      autoCommit('auto-save before switch')
    }
    prevChapterRef.current = selectedChapterId
  }, [selectedChapterId, autoCommit])

  // Auto-commit on unmount (app close / back to shelf)
  useEffect(() => {
    return () => {
      autoCommit('auto-save')
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
              refreshGitStatus()
              refreshAheadBehind()
            }
          } else {
            setSyncOutput(event.payload.message)
          }
        } else {
          setSyncOutput(event.payload.message)
          if (event.payload.ok) {
            refreshGitStatus()
            refreshAheadBehind()
          }
        }
      },
    )
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [refreshGitStatus, refreshAheadBehind])

  // Refresh ahead/behind on mount
  useEffect(() => {
    refreshAheadBehind()
  }, [refreshAheadBehind])

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
      console.error('Failed to create chapter:', e)
    }
  }

  const handleSaveContent = useCallback(
    async (markdown: string) => {
      if (!selectedChapterId) return
      try {
        await saveChapter(selectedChapterId, markdown)
      } catch (e) {
        console.error('Failed to save chapter:', e)
      }
    },
    [selectedChapterId, saveChapter],
  )

  const handleDeleteChapter = useCallback(
    async (id: string) => {
      try {
        await removeChapter(id)
      } catch (e) {
        console.error('Failed to delete chapter:', e)
      }
    },
    [removeChapter],
  )

  const handleRenameChapter = useCallback(
    async (id: string, title: string) => {
      try {
        await renameChapterById(id, title)
      } catch (e) {
        console.error('Failed to rename chapter:', e)
      }
    },
    [renameChapterById],
  )

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return
    try {
      await commit(commitMessage.trim())
      setCommitDialogOpen(false)
      setCommitMessage('')
    } catch (e) {
      console.error('Failed to commit:', e)
    }
  }, [commitMessage, commit])

  const handleMoveChapter = useCallback(
    async (
      chapterId: string,
      targetId: string | null,
      position: 'inner' | 'before' | 'after',
    ) => {
      console.log('[BookDetail] handleMoveChapter:', {
        chapterId,
        targetId,
        position,
      })
      try {
        await moveChapterTo(chapterId, targetId, position)
        console.log('[BookDetail] moveChapterTo succeeded')
      } catch (e) {
        console.error('[BookDetail] moveChapterTo failed:', e)
      }
    },
    [moveChapterTo],
  )

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
            bgcolor: (t) =>
              t.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            borderRight: 1,
            borderColor: 'divider',
            minWidth: 0,
          }}
        >
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={onBack} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" fontWeight={600} noWrap sx={{ flex: 1 }}>
              {meta?.title || 'Loading...'}
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {meta && (
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
            )}
          </Box>
          <Box
            onClick={async () => {
              setCommitMessage('')
              setSyncOutput('')
              const url = await getRemoteUrl()
              setRemoteUrlState(url || '')
              setRemoteUrlDraft(url || '')
              const [name, email] = await getUserConfig()
              setGitName(name)
              setGitEmail(email)
              setCommitDialogOpen(true)
            }}
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
                bgcolor: gitStatusText ? 'warning.main' : 'success.main',
              }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: '0.7rem',
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              {aheadBehind != null && aheadBehind[0] > 0 && (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.2,
                    color: 'warning.main',
                  }}
                >
                  <ArrowUpwardIcon sx={{ fontSize: 12 }} />
                  {aheadBehind[0]}
                </Box>
              )}
              {aheadBehind != null && aheadBehind[1] > 0 && (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.2,
                    color: 'info.main',
                  }}
                >
                  <ArrowDownwardIcon sx={{ fontSize: 12 }} />
                  {aheadBehind[1]}
                </Box>
              )}
              {!gitStatusText &&
              aheadBehind?.[0] === 0 &&
              aheadBehind?.[1] === 0
                ? 'synced'
                : gitStatusText
                  ? 'dirty'
                  : ''}
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
              Select a chapter from the sidebar to start editing
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
        bookTitle={meta?.title || ''}
        updatedTime={meta?.updated_time || 0}
        onRename={async (title) => {
          await renameBook(bookPath, title)
          refreshMeta()
        }}
        onDelete={async () => {
          await deleteBook(bookPath)
          setCommitDialogOpen(false)
          onBack()
        }}
        onRevealInFinder={() => revealInFinder(bookPath)}
        gitStatusText={gitStatusText}
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
        onSetRemoteUrl={async () => {
          await setRemoteUrlApi(remoteUrlDraft)
          setRemoteUrlState(remoteUrlDraft)
        }}
        onFetch={async () => {
          setSyncingType('fetch')
          setSyncOutput('')
          await fetchRemote()
        }}
        onPull={async () => {
          setSyncingType('pull')
          setSyncOutput('')
          await pullRemote()
        }}
        onPush={async () => {
          setSyncingType('push')
          setSyncOutput('')
          await pushRemote()
        }}
        onMerge={handleAttemptMerge}
        syncingType={syncingType}
        mergeInProgress={mergeInProgress}
        aheadBehind={aheadBehind}
        conflictedFiles={conflictedFiles}
        resolvedFiles={resolvedFiles}
        onResolveFile={handleResolveFile}
        onCommitMerge={handleCommitMerge}
        logs={logs}
        onRefreshLogs={refreshLogs}
      />

      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>New Chapter</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Chapter Title"
            fullWidth
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateChapter()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateChapter}
            variant="contained"
            disabled={!addTitle.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
