import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import { open as dialogOpen } from '@tauri-apps/plugin-dialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { BookInfo } from '../types'
import { scanMarkdownDir, type MdScan, type MdScanDir } from '../utils/commands'

interface ImportMarkdownDialogProps {
  open: boolean
  onClose: () => void
  onImport: (sourcePath: string, title?: string) => Promise<BookInfo>
}

function ScanTree({ node, depth = 0 }: { node: MdScanDir; depth?: number }) {
  const { t } = useTranslation()
  return (
    <Box>
      <Box
        sx={{
          pl: depth * 2,
          py: 0.25,
          display: 'flex',
          alignItems: 'center',
          gap: 0.8,
        }}
      >
        <FolderOpenIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
        <Typography
          variant="body2"
          fontWeight={depth === 0 ? 600 : 500}
          sx={{ fontSize: '0.8rem' }}
        >
          {node.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('importMd.count', { n: node.md_count })}
        </Typography>
      </Box>
      {node.files.map(file => (
        <Box
          key={file.path}
          sx={{
            pl: depth * 2 + 2,
            py: 0.1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.8,
          }}
        >
          <DescriptionOutlinedIcon
            sx={{ fontSize: 13, color: 'text.disabled' }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.75rem' }}
          >
            {file.title}
          </Typography>
        </Box>
      ))}
      {node.children.map(child => (
        <ScanTree key={child.path} node={child} depth={depth + 1} />
      ))}
    </Box>
  )
}

export default function ImportMarkdownDialog({
  open,
  onClose,
  onImport,
}: ImportMarkdownDialogProps) {
  const { t } = useTranslation()
  const [sourcePath, setSourcePath] = useState('')
  const [scan, setScan] = useState<MdScan | null>(null)
  const [title, setTitle] = useState('')
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<BookInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setSourcePath('')
    setScan(null)
    setTitle('')
    setScanning(false)
    setImporting(false)
    setResult(null)
    setError('')
  }, [open])

  const chooseFolder = async () => {
    try {
      const folder = await dialogOpen({ directory: true, multiple: false })
      if (typeof folder !== 'string') return
      setSourcePath(folder)
      setScan(null)
      setError('')
      setScanning(true)
      try {
        const preview = await scanMarkdownDir(folder)
        setScan(preview)
        setTitle(prev => prev || preview.root_name)
      } catch (e) {
        setError(typeof e === 'string' ? e : String(e))
      } finally {
        setScanning(false)
      }
    } catch (e) {
      console.error('Failed to choose folder:', e)
    }
  }

  const handleImport = async () => {
    if (importing || !scan || !title.trim()) return
    setImporting(true)
    setError('')
    try {
      const book = await onImport(sourcePath, title.trim())
      setResult(book)
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !importing && onClose()}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{t('importMd.title')}</DialogTitle>
      <DialogContent>
        {result ? (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>
              {t('importMd.done', {
                title: result.title,
                n: scan?.md_count ?? 0,
              })}
            </Alert>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ wordBreak: 'break-all' }}
            >
              {result.path}
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('importMd.hint')}
            </Typography>

            <Box display="flex" alignItems="center" gap={1}>
              <Button
                variant="outlined"
                size="small"
                onClick={chooseFolder}
                disabled={scanning || importing}
              >
                {t('importMd.chooseFolder')}
              </Button>
              <Typography
                variant="body2"
                color={sourcePath ? 'text.primary' : 'text.secondary'}
                sx={{ wordBreak: 'break-all', flex: 1 }}
              >
                {sourcePath || t('importMd.noFolder')}
              </Typography>
            </Box>

            {scanning && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">
                  {t('importMd.scanning')}
                </Typography>
              </Box>
            )}

            {scan && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('importMd.stats', {
                    md: scan.md_count,
                    images: scan.image_count,
                  })}
                </Typography>
                {scan.md_count === 0 ? (
                  <Alert severity="warning">{t('importMd.empty')}</Alert>
                ) : (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('importMd.structure')}
                    </Typography>
                    <Box
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        px: 1.5,
                        py: 1,
                        maxHeight: 240,
                        overflowY: 'auto',
                      }}
                    >
                      <ScanTree node={scan.tree} />
                    </Box>
                    <TextField
                      margin="dense"
                      label={t('importMd.bookTitle')}
                      fullWidth
                      size="small"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      disabled={importing}
                      sx={{ mt: 2 }}
                    />
                  </>
                )}
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {result ? (
          <Button variant="contained" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            {importing && <CircularProgress size={18} sx={{ mr: 1 }} />}
            <Button onClick={onClose} disabled={importing}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={importing || !scan || !scan.md_count || !title.trim()}
            >
              {importing ? t('importMd.importing') : t('importMd.start')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
