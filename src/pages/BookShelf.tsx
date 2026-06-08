import AddIcon from '@mui/icons-material/Add'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import SettingsIcon from '@mui/icons-material/Settings'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SearchIcon from '@mui/icons-material/Search'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  CircularProgress,
  CardMedia,
  CardActionArea,
  Divider,
} from '@mui/material'
import { open } from '@tauri-apps/plugin-dialog'
import { listen } from '@tauri-apps/api/event'
import { useState, useEffect, useCallback } from 'react'
import {
  getBooksDir,
  pathExists,
  readLogs,
  readBookLogs,
  revealInFinder,
  gitStatus,
  gitRemoteUrl,
  gitAheadBehind,
  gitCommit,
  gitFetch,
  gitPull,
  gitPush,
  attemptMerge,
  resolveConflict,
} from '../utils/commands'
import { useBooks } from '../hooks/useBooks'
import type { LogEntry } from '../utils/commands'
import type { BookInfo } from '../types'
import BookSettingsDialog from '../components/BookSettingsDialog'
import SearchDialog from '../components/SearchDialog'

interface BookShelfProps {
  onOpenBook: (bookInfo: BookInfo, chapterId?: string) => void
  onToggleTheme: () => void
  mode: 'light' | 'dark'
}

const COVER_COLORS = [
  ['#4A90D9', '#357ABD'],
  ['#D94A4A', '#BD3535'],
  ['#5CB85C', '#449D44'],
  ['#F0AD4E', '#EC971F'],
  ['#9B59B6', '#8E44AD'],
  ['#1ABC9C', '#16A085'],
  ['#E67E22', '#D35400'],
  ['#3498DB', '#2980B9'],
  ['#E74C3C', '#C0392B'],
  ['#2ECC71', '#27AE60'],
  ['#F39C12', '#D68910'],
  ['#2980B9', '#1A5276'],
  ['#8E44AD', '#6C3483'],
  ['#D35400', '#A04000'],
  ['#16A085', '#0E6655'],
  ['#27AE60', '#1E8449'],
]

function hashColor(title: string): [string, string] {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  const idx = Math.abs(hash) % COVER_COLORS.length
  return COVER_COLORS[idx] as [string, string]
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 24 * 60 * 60 * 1000) return 'Today'
  if (diff < 48 * 60 * 60 * 1000) return 'Yesterday'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function BookCover({
  title,
  onClick,
  onDelete,
  onRename,
  bookPath,
  updatedTime,
  gitStatusText,
  remoteUrl,
  aheadBehind,
}: {
  title: string
  onClick: () => void
  onDelete: () => void
  onRename: (newTitle: string) => void
  bookPath: string
  updatedTime: number
  gitStatusText: string
  remoteUrl: string | null
  aheadBehind: [number, number] | null
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [primary, secondary] = hashColor(title)

  // Git operation state
  const [syncingType, setSyncingType] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [mergeInProgress, setMergeInProgress] = useState(false)
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([])
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set())

  // git:done listener for async operations
  useEffect(() => {
    const unlisten = listen<{
      type: string
      ok: boolean
      message: string
      book_path: string
    }>('git:done', async (event) => {
      if (event.payload.book_path !== bookPath) return
      setSyncingType(null)
      if (event.payload.type === 'merge') {
        setMergeInProgress(false)
        if (event.payload.ok) {
          const msg = event.payload.message
          if (msg.startsWith('conflicts:')) {
            const files = msg.replace('conflicts:', '').split(',')
            setConflictedFiles(files)
            setResolvedFiles(new Set())
          } else {
            setConflictedFiles([])
          }
        }
      } else if (!event.payload.ok) {
        setSyncingType(null)
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [bookPath])

  const handleResolveFile = async (filePath: string, useTheirs: boolean) => {
    try {
      await resolveConflict(bookPath, filePath, useTheirs)
      setResolvedFiles((prev) => new Set([...prev, filePath]))
    } catch (e) {
      console.error(e)
    }
  }

  const handleCommitMerge = async () => {
    try {
      await gitCommit(bookPath, 'Merge remote changes')
      setConflictedFiles([])
      setResolvedFiles(new Set())
    } catch (e) {
      console.error(e)
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    setSyncingType('commit')
    try {
      await gitCommit(bookPath, commitMessage.trim())
      setCommitMessage('')
    } catch (e) {
      console.error(e)
    }
    setSyncingType(null)
  }

  const initials = title
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()

  return (
    <Card
      sx={{
        width: 180,
        flexShrink: 0,
        borderRadius: 2,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        },
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <CardActionArea onClick={onClick}>
          <CardMedia
            sx={{
              height: 240,
              background: `linear-gradient(135deg, ${primary}, ${secondary})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              p: 2,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                color: 'rgba(255,255,255,0.15)',
                fontSize: '3rem',
                fontWeight: 800,
                letterSpacing: 2,
                lineHeight: 1,
                mb: 1,
              }}
            >
              {initials}
            </Typography>
          </CardMedia>
        </CardActionArea>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            setDialogOpen(true)
          }}
          sx={(t) => ({
            position: 'absolute',
            top: 4,
            right: 4,
            bgcolor:
              t.palette.mode === 'dark'
                ? 'rgba(0,0,0,0.7)'
                : 'rgba(255,255,255,0.9)',
            '&:hover': {
              bgcolor: t.palette.mode === 'dark' ? 'rgba(0,0,0,0.9)' : 'white',
            },
            width: 28,
            height: 28,
          })}
        >
          <MoreVertIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <BookSettingsDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          bookPath={bookPath}
          bookTitle={title}
          updatedTime={updatedTime}
          onRename={async (newTitle: string) => {
            onRename(newTitle)
            setDialogOpen(false)
          }}
          onDelete={async () => {
            onDelete()
            setDialogOpen(false)
          }}
          onRevealInFinder={() => revealInFinder(bookPath)}
          onRefreshLogs={async () => {
            const entries = await readBookLogs(200, bookPath)
            return entries.reverse()
          }}
          gitStatusText={gitStatusText}
          commitMessage={commitMessage}
          setCommitMessage={setCommitMessage}
          onCommit={handleCommit}
          remoteUrl={remoteUrl}
          remoteDraft={remoteUrl || ''}
          syncingType={syncingType}
          mergeInProgress={mergeInProgress}
          aheadBehind={aheadBehind}
          conflictedFiles={conflictedFiles}
          resolvedFiles={resolvedFiles}
          onResolveFile={handleResolveFile}
          onCommitMerge={handleCommitMerge}
          onFetch={async () => {
            setSyncingType('fetch')
            await gitFetch(bookPath)
          }}
          onPull={async () => {
            setSyncingType('pull')
            await gitPull(bookPath)
          }}
          onPush={async () => {
            setSyncingType('push')
            await gitPush(bookPath)
          }}
          onMerge={async () => {
            setMergeInProgress(true)
            setSyncingType('merge')
            await attemptMerge(bookPath)
          }}
        />
      </Box>
      <CardContent sx={{ px: 1.5, py: 1, '&:last-child': { pb: 1 } }}>
        <Typography variant="body2" fontWeight={600} noWrap sx={{ mb: 0.25 }}>
          {title}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function BookShelf({
  onOpenBook,
  onToggleTheme,
  mode,
}: BookShelfProps) {
  const {
    books,
    loading,
    createBook,
    removeBook,
    changeBookName,
    importExternalBook,
    getGlobalSettings,
    setGlobalSettings,
  } = useBooks()
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderError, setNewFolderError] = useState('')
  const [newPathExists, setNewPathExists] = useState(false)
  const [newParentDir, setNewParentDir] = useState('')

  // Git data cache for all books (loaded on mount)
  const [gitDataMap, setGitDataMap] = useState<
    Record<
      string,
      {
        status: string
        remote: string | null
        aheadBehind: [number, number] | null
      }
    >
  >({})

  const loadAllGitData = useCallback(async () => {
    const map: Record<string, (typeof gitDataMap)[string]> = {}
    for (const book of books) {
      try {
        const [remote, status, ab] = await Promise.all([
          gitRemoteUrl(book.path),
          gitStatus(book.path),
          gitAheadBehind(book.path),
        ])
        map[book.path] = { remote, status, aheadBehind: ab }
      } catch {
        /* git not available */
      }
    }
    setGitDataMap(map)
  }, [books])

  useEffect(() => {
    if (books.length > 0) {
      loadAllGitData()
    }
  }, [loadAllGitData])

  // Refresh git data for a specific book
  const refreshBookGit = useCallback(async (bookPath: string) => {
    try {
      const [remote, status, ab] = await Promise.all([
        gitRemoteUrl(bookPath),
        gitStatus(bookPath),
        gitAheadBehind(bookPath),
      ])
      setGitDataMap((prev) => ({
        ...prev,
        [bookPath]: { remote, status, aheadBehind: ab },
      }))
    } catch {
      /* ignore */
    }
  }, [])

  // Git:done listener to refresh cache after async operations
  useEffect(() => {
    const unlisten = listen<{
      type: string
      ok: boolean
      message: string
      book_path: string
    }>('git:done', async (event) => {
      if (event.payload.ok) {
        refreshBookGit(event.payload.book_path)
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [refreshBookGit])

  const INVALID_FOLDER_CHARS = /[<>:"/\\|?*\x00-\x1f]/g
  const INVALID_FOLDER_NAMES = [
    '',
    '.',
    '..',
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ]

  function validateFolderName(name: string): string {
    if (!name.trim()) return 'Folder name is required'
    if (INVALID_FOLDER_CHARS.test(name))
      return 'Folder name cannot contain: < > : " / \\ | ? *'
    if (name.startsWith('.') || name.endsWith('.'))
      return 'Folder name cannot start or end with a dot'
    if (name.endsWith(' ') || name.endsWith('.'))
      return 'Folder name cannot end with space or dot'
    if (INVALID_FOLDER_NAMES.includes(name.toUpperCase()))
      return `"${name}" is not allowed as a folder name`
    if (name.length > 255) return 'Folder name is too long (max 255 characters)'
    return ''
  }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [globalGitName, setGlobalGitName] = useState('')
  const [globalGitEmail, setGlobalGitEmail] = useState('')
  const [globalProxy, setGlobalProxy] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    try {
      const bookDir = `${newParentDir}/${newFolderName}`
      await createBook(newTitle.trim(), bookDir)
      setNewDialogOpen(false)
      setNewTitle('')
    } catch (e) {
      console.error('Failed to create book:', e)
    }
  }

  useEffect(() => {
    if (newDialogOpen) {
      getBooksDir().then((dir) => {
        setNewParentDir(dir)
        setNewFolderName('')
        setNewTitle('')
        setNewPathExists(false)
      })
    }
  }, [newDialogOpen])

  // Check if the target path already exists
  useEffect(() => {
    if (!newFolderName.trim() || !newParentDir.trim()) return
    const fullPath = `${newParentDir}/${newFolderName}`
    pathExists(fullPath).then(setNewPathExists)
  }, [newFolderName, newParentDir])

  const handleImport = async () => {
    console.log('[BookShelf] Open Book clicked')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select book folder',
    })
    console.log('[BookShelf] dialog returned:', selected)
    if (selected) {
      try {
        const result = await importExternalBook(selected)
        console.log('[BookShelf] import success:', result)
      } catch (e) {
        console.error('[BookShelf] Failed to import book:', e)
      }
    }
  }

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: 4, py: 3 }}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        mb={4}
      >
        <Typography variant="h4" fontWeight={700}>
          Library
        </Typography>
        <Box display="flex" gap={1} alignItems="center">
          <Button
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={handleImport}
          >
            Open Book
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setNewDialogOpen(true)}
          >
            New Book
          </Button>
          <IconButton onClick={() => setSearchOpen(true)}>
            <SearchIcon />
          </IconButton>
          <IconButton onClick={onToggleTheme}>
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
          <IconButton
            onClick={async () => {
              const s = await getGlobalSettings()
              setGlobalGitName(s.name)
              setGlobalGitEmail(s.email)
              setGlobalProxy(s.proxy)
              try {
                const entries = await readLogs(200)
                setLogs(entries.reverse())
              } catch {
                /* ignore */
              }
              setSettingsOpen(true)
            }}
          >
            <SettingsIcon />
          </IconButton>
        </Box>
      </Box>

      {books.length === 0 ? (
        <Box textAlign="center" py={12}>
          <Typography variant="h6" color="text.secondary" mb={1}>
            Your library is empty
          </Typography>
          <Typography color="text.secondary" mb={3}>
            Create your first book or import an existing one to get started
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setNewDialogOpen(true)}
          >
            Create Your First Book
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            justifyContent: 'flex-start',
          }}
        >
          {books.map((book) => (
            <Box key={book.path}>
              <BookCover
                title={book.title}
                onClick={() => onOpenBook(book)}
                bookPath={book.path}
                updatedTime={book.updated_time}
                onDelete={() => removeBook(book.path)}
                onRename={(newTitle) => changeBookName(book.path, newTitle)}
                gitStatusText={gitDataMap[book.path]?.status || ''}
                remoteUrl={gitDataMap[book.path]?.remote || null}
                aheadBehind={gitDataMap[book.path]?.aheadBehind || null}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5, pl: 0.5 }}
              >
                {formatDate(book.updated_time)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Dialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>New Book</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Book Title"
            fullWidth
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value)
              // Auto-generate folder name from title
              let slug =
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
                  .replace(/^-|-$/g, '') || 'untitled'
              slug = slug.replace(INVALID_FOLDER_CHARS, '')
              setNewFolderName(slug)
              setNewFolderError(validateFolderName(slug))
            }}
          />
          <TextField
            margin="dense"
            label="Folder Name"
            fullWidth
            value={newFolderName}
            error={!!newFolderError || newPathExists}
            helperText={
              newPathExists
                ? 'This path already exists'
                : newFolderError || 'Folder name on disk'
            }
            onChange={(e) => {
              const val = e.target.value
              setNewFolderName(val)
              setNewFolderError(validateFolderName(val))
              setNewPathExists(false)
            }}
            sx={{ mt: 1 }}
          />
          <TextField
            margin="dense"
            label="Location"
            fullWidth
            size="small"
            value={newParentDir}
            onChange={(e) => setNewParentDir(e.target.value)}
            sx={{ mt: 1 }}
            InputProps={{
              endAdornment: (
                <Button
                  size="small"
                  sx={{ minWidth: 'auto', textTransform: 'none' }}
                  onClick={async () => {
                    const sel = await open({
                      directory: true,
                      multiple: false,
                      title: 'Select location',
                    })
                    if (sel) setNewParentDir(sel)
                  }}
                >
                  Browse
                </Button>
              ),
            }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            Will be created at: {newParentDir}/{newFolderName}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={
              !newTitle.trim() ||
              !newFolderName.trim() ||
              !!newFolderError ||
              newPathExists
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" gutterBottom>
            Git Author
          </Typography>
          <Box display="flex" gap={1} mb={2}>
            <TextField
              size="small"
              label="Name"
              placeholder="Your Name"
              value={globalGitName}
              onChange={(e) => setGlobalGitName(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Email"
              placeholder="you@example.com"
              value={globalGitEmail}
              onChange={(e) => setGlobalGitEmail(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>
            Proxy
          </Typography>
          <Box display="flex" gap={1} alignItems="center" mb={1}>
            <TextField
              size="small"
              placeholder="http://proxy:8080"
              value={globalProxy}
              onChange={(e) => setGlobalProxy(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>
            Activity Log
          </Typography>
          {logs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No logs
            </Typography>
          ) : (
            <Box
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                maxHeight: 250,
                overflow: 'auto',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 1,
              }}
            >
              {logs.map((entry, i) => (
                <Box
                  key={i}
                  sx={{
                    py: 0.2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
                    {new Date(entry.t).toLocaleString()}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      color:
                        entry.e.startsWith('set_') ||
                        entry.e === 'import_image' ||
                        entry.e === 'paste_image' ||
                        entry.e === 'download_image'
                          ? 'info.main'
                          : entry.e.startsWith('create_')
                            ? 'success.main'
                            : entry.e.startsWith('delete_')
                              ? 'error.main'
                              : 'warning.main',
                      mr: 1,
                      fontWeight: 600,
                    }}
                  >
                    [{entry.e}]
                  </Box>
                  <Box component="span">{entry.d}</Box>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              try {
                await setGlobalSettings(
                  globalGitName,
                  globalGitEmail,
                  globalProxy,
                )
                setSettingsOpen(false)
              } catch (e) {
                console.error(e)
              }
            }}
            variant="contained"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        bookPaths={books.map((b) => b.path)}
        onSelectChapter={(bookPath, chapterId) => {
          const book = books.find((b) => b.path === bookPath)
          if (book) onOpenBook(book, chapterId)
          setSearchOpen(false)
        }}
      />
    </Box>
  )
}
