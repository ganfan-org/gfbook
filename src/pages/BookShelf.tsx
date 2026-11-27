import AddIcon from '@mui/icons-material/Add'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import DeleteIcon from '@mui/icons-material/Delete'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import LightModeIcon from '@mui/icons-material/LightMode'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SearchIcon from '@mui/icons-material/Search'
import SettingsIcon from '@mui/icons-material/Settings'
import {
  Alert,
  Box,
  Typography,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import { open as dialogOpen } from '@tauri-apps/plugin-dialog'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import ExportDialog from '../components/ExportDialog'
import ImportMarkdownDialog from '../components/ImportMarkdownDialog'
import SearchDialog from '../components/SearchDialog'
import { useBooks } from '../hooks/useBooks'
import { changeLang, currentLang, type AppLang } from '../i18n'
import type { BookInfo, BookKind } from '../types'
import { readLogs, type LogEntry } from '../utils/commands'
import { formatBookDate } from '../utils/date'

// ═══════════════════════════════════════════
// 封面颜色 — 低饱和高级色
// ═══════════════════════════════════════════
const COVER_COLORS: [string, string][] = [
  ['#E8E4E1', '#D5CFCA'],
  ['#D4E2F0', '#B8C9D9'],
  ['#DDE8D9', '#C8D6C2'],
  ['#E8DED4', '#D8C8B8'],
  ['#D8D4E8', '#C4BED9'],
  ['#E8D4D4', '#D9BEBE'],
  ['#E4E8D0', '#D4D9B8'],
  ['#E0E8EA', '#C8D9DC'],
]

function hashColor(title: string): [string, string] {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length]
}

// ═══════════════════════════════════════════
// BookCover 组件 — Apple 风格低饱和封面
// ═══════════════════════════════════════════
function BookCover({
  title,
  kind,
  updatedTime,
  onClick,
  onRename,
  onDelete,
  onExport,
}: {
  title: string
  kind?: BookKind
  updatedTime: number
  onClick: () => void
  onRename: (t: string) => void
  onDelete: () => void
  onExport: () => void
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuHover, setMenuHover] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(title)
  const [primary, secondary] = hashColor(title)
  const { t } = useTranslation()

  const isLight = useMemo(() => {
    const hex = primary.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 > 160
  }, [primary])

  const textColor = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)'
  const mutedColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)'

  const initials = useMemo(() => {
    const cjk = /[\u4e00-\u9fff]/.test(title)
    if (cjk) return title.slice(0, 2)
    return title.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }, [title])

  return (
    <>
      <Card
        sx={{
          width: 158,
          flexShrink: 0,
          borderRadius: 3,
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'transparent',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'translateY(-3px)',
            boxShadow: 'var(--shadow-lg)',
          },
        }}
        onMouseEnter={() => setMenuHover(true)}
        onMouseLeave={() => setMenuHover(false)}
      >
        <Box sx={{ position: 'relative' }}>
          <CardActionArea onClick={onClick} sx={{ borderRadius: '12px 12px 0 0' }}>
            <CardMedia
              sx={{
                height: 210,
                background: `linear-gradient(145deg, ${primary}, ${secondary})`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                p: 2,
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.03) 100%)',
                },
              }}
            >
              <Typography
                sx={{
                  color: mutedColor,
                  fontSize: '2.25rem',
                  fontWeight: 700,
                  letterSpacing: 1,
                  lineHeight: 1,
                  opacity: 0.35,
                  alignSelf: 'flex-end',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {initials}
              </Typography>
              {kind === 'diary' && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    zIndex: 1,
                    bgcolor: isLight
                      ? 'rgba(255,255,255,0.6)'
                      : 'rgba(0,0,0,0.25)',
                    backdropFilter: 'blur(6px)',
                  }}
                >
                  <Typography
                    sx={{
                      color: textColor,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      lineHeight: 1.4,
                    }}
                  >
                    {t('bookshelf.diaryBadge')}
                  </Typography>
                </Box>
              )}
              <Box sx={{ position: 'relative', zIndex: 1, mt: 'auto' }}>
                <Typography
                  sx={{
                    color: textColor,
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textShadow: isLight
                      ? '0 1px 2px rgba(255,255,255,0.3)'
                      : '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                >
                  {title}
                </Typography>
              </Box>
            </CardMedia>
          </CardActionArea>

          <IconButton
            size="small"
            onClick={e => {
              e.stopPropagation()
              setMenuAnchor(e.currentTarget)
            }}
            sx={t => ({
              position: 'absolute',
              top: 6,
              right: 6,
              width: 26,
              height: 26,
              opacity: menuHover ? 1 : 0,
              transition: 'opacity 0.2s ease',
              bgcolor:
                t.palette.mode === 'dark'
                  ? 'rgba(0,0,0,0.5)'
                  : 'rgba(255,255,255,0.75)',
              color: 'text.primary',
              backdropFilter: 'blur(6px)',
              '&:hover': {
                bgcolor:
                  t.palette.mode === 'dark'
                    ? 'rgba(0,0,0,0.7)'
                    : 'rgba(255,255,255,0.95)',
              },
            })}
          >
            <MoreVertIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Box>
        <CardContent sx={{ px: 2, py: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {formatBookDate(updatedTime)}
          </Typography>
        </CardContent>
      </Card>

      {/* 右键菜单 */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        onClick={e => e.stopPropagation()}
      >
        <MenuItem onClick={() => { setMenuAnchor(null); setRenameOpen(true); setRenameValue(title) }}>
          <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon>
          {t('bookshelf.rename')}
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onExport() }}>
          <ListItemIcon><FileDownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          {t('bookshelf.export')}
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onDelete() }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <Typography color="error" variant="body2">{t('common.delete')}</Typography>
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null) }}>
          <ListItemIcon><FolderOpenOutlinedIcon fontSize="small" /></ListItemIcon>
          {t('bookshelf.showInFinder')}
        </MenuItem>
      </Menu>

      {/* 重命名弹窗 */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('bookshelf.renameTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('bookshelf.bookTitle')}
            fullWidth
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onRename(renameValue.trim())
                setRenameOpen(false)
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>{t('common.cancel')}</Button>
          <Button
            onClick={() => { onRename(renameValue.trim()); setRenameOpen(false) }}
            variant="contained"
            disabled={!renameValue.trim() || renameValue.trim() === title}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

// ═══════════════════════════════════════════
// 书架主页面
// ═══════════════════════════════════════════
interface BookShelfProps {
  onOpenBook: (book: BookInfo, chapterId?: string) => void
  onToggleTheme: () => void
  mode: 'light' | 'dark'
}

export default function BookShelf({ onOpenBook, onToggleTheme, mode }: BookShelfProps) {
  const { t } = useTranslation()
  const [lang, setLang] = useState<AppLang>(() => currentLang())
  const { books, loading, createBook, removeBook, changeBookName, importExternalBook, importMarkdownBook, getGlobalSettings, setGlobalSettings } = useBooks()
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newKind, setNewKind] = useState<BookKind>('book')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPreselect, setExportPreselect] = useState<string[]>([])
  const [importMenuAnchor, setImportMenuAnchor] = useState<HTMLElement | null>(null)
  const [importMdOpen, setImportMdOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [globalGitName, setGlobalGitName] = useState('')
  const [globalGitEmail, setGlobalGitEmail] = useState('')
  const [globalProxy, setGlobalProxy] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])

  const handleNewBook = async () => {
    const title = newTitle.trim()
    if (!title || creating) return
    try {
      setCreating(true)
      setCreateError(null)
      await createBook(title, newKind)
      setNewTitle('')
      setNewDialogOpen(false)
    } catch (e) {
      console.error('Failed to create book:', e)
      const message = e instanceof Error ? e.message : String(e)
      setCreateError(
        message.includes('already exists')
          ? t('bookshelf.bookExists')
          : message || t('bookshelf.createFailed'),
      )
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (path: string) => {
    if (deletingPath) return
    try {
      setDeletingPath(path)
      await removeBook(path)
    } catch (e) {
      console.error('Failed to delete book:', e)
    } finally {
      setDeletingPath(null)
    }
  }

  const handleRename = async (path: string, title: string) => {
    if (!title) return
    try {
      await changeBookName(path, title)
    } catch (e) {
      console.error('Failed to rename book:', e)
    }
  }

  const handleImport = async () => {
    try {
      const selected = await dialogOpen({ directory: true, multiple: false })
      if (typeof selected === 'string') {
        await importExternalBook(selected)
      }
    } catch (e) {
      console.error('Failed to import book:', e)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', px: 4, py: 3 }}>
      {/* 顶部栏 */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={4}>
        <Typography variant="h5" fontWeight={600}>
          {t('bookshelf.title')}
        </Typography>
        <Box display="flex" gap={1.5} alignItems="center">
          <Button
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={e => setImportMenuAnchor(e.currentTarget)}
          >
            {t('bookshelf.import')}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setCreateError(null)
              setNewDialogOpen(true)
            }}
          >
            {t('bookshelf.newBook')}
          </Button>
          <IconButton
            onClick={() => {
              setExportPreselect(books.map(b => b.path))
              setExportOpen(true)
            }}
            aria-label={t('bookshelf.export')}
          >
            <FileDownloadOutlinedIcon />
          </IconButton>
          <IconButton onClick={() => setSearchOpen(true)} aria-label={t('bookshelf.search')}>
            <SearchIcon />
          </IconButton>
          <IconButton onClick={onToggleTheme} aria-label={t('bookshelf.toggleTheme')}>
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
          <IconButton
            aria-label={t('bookshelf.settings')}
            onClick={async () => {
              try {
                const s = await getGlobalSettings()
                setGlobalGitName(s.name)
                setGlobalGitEmail(s.email)
                setGlobalProxy(s.proxy)
              } catch (e) {
                console.error('Failed to load settings:', e)
              }
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

      {/* 导入菜单：已有 gfbook 项目 / 普通 Markdown 目录 */}
      <Menu
        anchorEl={importMenuAnchor}
        open={!!importMenuAnchor}
        onClose={() => setImportMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setImportMenuAnchor(null)
            handleImport()
          }}
        >
          <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
          {t('bookshelf.importBook')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setImportMenuAnchor(null)
            setImportMdOpen(true)
          }}
        >
          <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
          {t('bookshelf.importMarkdown')}
        </MenuItem>
      </Menu>

      {books.length === 0 ? (
        <Box
          textAlign="center"
          py={12}
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '20px',
              bgcolor: 'var(--color-bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1,
            }}
          >
            <AddIcon sx={{ fontSize: 40, color: 'text.secondary', opacity: 0.4 }} />
          </Box>
          <Typography variant="h6" color="text.primary" fontWeight={600}>
            {t('bookshelf.emptyTitle')}
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 360 }}>
            {t('bookshelf.emptyHint')}
          </Typography>
          <Box display="flex" gap={1} mt={1}>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={() => {
                setCreateError(null)
                setNewDialogOpen(true)
              }}
            >
              {t('bookshelf.createBook')}
            </Button>
            <Button variant="outlined" size="large" startIcon={<FolderOpenIcon />} onClick={handleImport}>
              {t('bookshelf.importBook')}
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<DescriptionOutlinedIcon />}
              onClick={() => setImportMdOpen(true)}
            >
              {t('bookshelf.importMarkdown')}
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3.5, justifyContent: 'flex-start' }}>
          {books.map(book => (
            <BookCover
              key={book.path}
              title={book.title}
              kind={book.kind}
              updatedTime={book.updated_time}
              onClick={() => onOpenBook(book)}
              onRename={newTitle => handleRename(book.path, newTitle)}
              onDelete={() => handleDelete(book.path)}
              onExport={() => {
                setExportPreselect([book.path])
                setExportOpen(true)
              }}
            />
          ))}
        </Box>
      )}

      {/* 新建书弹窗 */}
      <Dialog
        open={newDialogOpen}
        onClose={() => {
          if (creating) return
          setNewDialogOpen(false)
          setCreateError(null)
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {newKind === 'diary' ? t('bookshelf.newDiary') : t('bookshelf.newBook')}
        </DialogTitle>
        <DialogContent>
          <ToggleButtonGroup
            size="small"
            exclusive
            fullWidth
            value={newKind}
            onChange={(_, value: BookKind | null) => {
              if (value) setNewKind(value)
            }}
            sx={{ mt: 1 }}
          >
            <ToggleButton value="book">{t('bookshelf.kindBook')}</ToggleButton>
            <ToggleButton value="diary">{t('bookshelf.kindDiary')}</ToggleButton>
          </ToggleButtonGroup>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            {newKind === 'diary' ? t('bookshelf.diaryHint') : t('bookshelf.bookHint')}
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label={newKind === 'diary' ? t('bookshelf.diaryName') : t('bookshelf.bookTitle')}
            fullWidth
            value={newTitle}
            onChange={e => {
              setNewTitle(e.target.value)
              if (createError) setCreateError(null)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && newTitle.trim()) {
                e.preventDefault()
                handleNewBook()
              }
            }}
            disabled={creating}
          />
          {createError && (
            <Alert
              severity="error"
              sx={{ mt: 2 }}
              onClose={() => setCreateError(null)}
            >
              {createError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialogOpen(false)} disabled={creating}>{t('common.cancel')}</Button>
          <Button
            onClick={handleNewBook}
            variant="contained"
            disabled={!newTitle.trim() || creating}
          >
            {creating ? t('bookshelf.creating') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 设置弹窗：全局 Git 作者、代理与活动日志 */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('settings.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" gutterBottom>{t('settings.gitAuthor')}</Typography>
          <Box display="flex" gap={1} mb={2}>
            <TextField
              size="small"
              label={t('settings.name')}
              placeholder={t('settings.namePlaceholder')}
              value={globalGitName}
              onChange={e => setGlobalGitName(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label={t('settings.email')}
              placeholder={t('settings.emailPlaceholder')}
              value={globalGitEmail}
              onChange={e => setGlobalGitEmail(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>{t('settings.proxy')}</Typography>
          <TextField
            size="small"
            fullWidth
            placeholder={t('settings.proxyPlaceholder')}
            value={globalProxy}
            onChange={e => setGlobalProxy(e.target.value)}
          />

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>{t('settings.language')}</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={lang}
            onChange={(_, value: AppLang | null) => {
              if (!value) return
              setLang(value)
              changeLang(value)
            }}
          >
            <ToggleButton value="zh">中文</ToggleButton>
            <ToggleButton value="en">English</ToggleButton>
          </ToggleButtonGroup>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>{t('settings.activityLog')}</Typography>
          {logs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('settings.noLogs')}</Typography>
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
              {logs.map(entry => (
                <Box
                  key={`${entry.t}-${entry.e}-${entry.d}`}
                  sx={{ py: 0.2, borderBottom: '1px solid', borderColor: 'divider' }}
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
          <Button onClick={() => setSettingsOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                await setGlobalSettings(globalGitName, globalGitEmail, globalProxy)
                setSettingsOpen(false)
              } catch (e) {
                console.error('Failed to save settings:', e)
              }
            }}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <ExportDialog
        open={exportOpen}
        books={books}
        preselect={exportPreselect}
        onClose={() => setExportOpen(false)}
      />

      <ImportMarkdownDialog
        open={importMdOpen}
        onClose={() => setImportMdOpen(false)}
        onImport={importMarkdownBook}
      />

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        bookPaths={books.map(b => b.path)}
        onSelectChapter={(bookPath, chapterId) => {
          const book = books.find(b => b.path === bookPath)
          if (book) onOpenBook(book, chapterId)
          setSearchOpen(false)
        }}
      />
    </Box>
  )
}
