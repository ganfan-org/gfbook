import AddIcon from '@mui/icons-material/Add'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import SettingsIcon from '@mui/icons-material/Settings'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SearchIcon from '@mui/icons-material/Search'
import DeleteIcon from '@mui/icons-material/Delete'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import {
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
} from '@mui/material'
import { open as dialogOpen } from '@tauri-apps/plugin-dialog'
import { useState, useMemo } from 'react'
import { useBooks } from '../hooks/useBooks'
import type { BookInfo } from '../types'

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

function formatDate(ts: number): string {
  if (!ts || ts <= 0) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 24 * 60 * 60 * 1000) return '今天'
  if (diff < 48 * 60 * 60 * 1000) return '昨天'
  return d.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

// ═══════════════════════════════════════════
// BookCover 组件 — Apple 风格低饱和封面
// ═══════════════════════════════════════════
function BookCover({
  title,
  updatedTime,
  onClick,
  onRename,
  onDelete,
}: {
  title: string
  updatedTime: number
  onClick: () => void
  onRename: (t: string) => void
  onDelete: () => void
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuHover, setMenuHover] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(title)
  const [primary, secondary] = hashColor(title)

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
            {formatDate(updatedTime)}
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
          重命名
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onDelete() }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <Typography color="error" variant="body2">删除</Typography>
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null) }}>
          <ListItemIcon><FolderOpenOutlinedIcon fontSize="small" /></ListItemIcon>
          在 Finder 中显示
        </MenuItem>
      </Menu>

      {/* 重命名弹窗 */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>重命名</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="书名"
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
          <Button onClick={() => setRenameOpen(false)}>取消</Button>
          <Button
            onClick={() => { onRename(renameValue.trim()); setRenameOpen(false) }}
            variant="contained"
            disabled={!renameValue.trim() || renameValue.trim() === title}
          >
            确认
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
  const { books, loading, refresh, createBook, removeBook, changeBookName, importExternalBook } = useBooks()
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const handleNewBook = async () => {
    const title = newTitle.trim()
    if (!title || creating) return
    try {
      setCreating(true)
      await createBook(title)
      setNewTitle('')
      setNewDialogOpen(false)
    } catch (e) {
      console.error('Failed to create book:', e)
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
          书架
        </Typography>
        <Box display="flex" gap={1.5} alignItems="center">
          <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={handleImport}>
            导入
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewDialogOpen(true)}>
            新建书
          </Button>
          <IconButton onClick={() => setSearchOpen(true)} aria-label="搜索">
            <SearchIcon />
          </IconButton>
          <IconButton onClick={onToggleTheme} aria-label="切换主题">
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
          <IconButton aria-label="设置" onClick={refresh}>
            <SettingsIcon />
          </IconButton>
        </Box>
      </Box>

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
            还没有书
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 360 }}>
            创建第一本书来开始写作，或导入已有的 gfbook 项目
          </Typography>
          <Box display="flex" gap={1} mt={1}>
            <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={() => setNewDialogOpen(true)}>
              创建书
            </Button>
            <Button variant="outlined" size="large" startIcon={<FolderOpenIcon />} onClick={handleImport}>
              导入书
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3.5, justifyContent: 'flex-start' }}>
          {books.map(book => (
            <BookCover
              key={book.path}
              title={book.title}
              updatedTime={book.updated_time}
              onClick={() => onOpenBook(book)}
              onRename={newTitle => handleRename(book.path, newTitle)}
              onDelete={() => handleDelete(book.path)}
            />
          ))}
        </Box>
      )}

      {/* 新建书弹窗 */}
      <Dialog open={newDialogOpen} onClose={() => !creating && setNewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>新建书</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="书名"
            fullWidth
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newTitle.trim()) {
                e.preventDefault()
                handleNewBook()
              }
            }}
            disabled={creating}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialogOpen(false)} disabled={creating}>取消</Button>
          <Button
            onClick={handleNewBook}
            variant="contained"
            disabled={!newTitle.trim() || creating}
          >
            {creating ? '创建中…' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
