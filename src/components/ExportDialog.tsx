import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Typography,
} from '@mui/material'
import { open as dialogOpen } from '@tauri-apps/plugin-dialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { BookInfo } from '../types'
import { installExampleTemplates, revealInFinder } from '../utils/commands'
import {
  exportBooksSite,
  type ExportProgress,
  type ExportResult,
} from '../utils/exportHtml'

interface ExportDialogProps {
  open: boolean
  books: BookInfo[]
  /** 打开时预选的书（绝对路径）；为空则全选 */
  preselect: string[]
  onClose: () => void
}

export default function ExportDialog({
  open,
  books,
  preselect,
  onClose,
}: ExportDialogProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string[]>([])
  const [outputDir, setOutputDir] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState('')
  const [templateMessage, setTemplateMessage] = useState('')
  const [templateError, setTemplateError] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(preselect.length ? preselect : books.map(b => b.path))
    setOutputDir('')
    setRunning(false)
    setProgress(null)
    setResult(null)
    setError('')
    setTemplateMessage('')
    setTemplateError(false)
  }, [open, preselect, books])

  const toggleBook = (path: string, checked: boolean) => {
    setSelected(prev =>
      checked ? [...prev, path] : prev.filter(p => p !== path),
    )
  }

  const chooseFolder = async () => {
    try {
      const folder = await dialogOpen({ directory: true, multiple: false })
      if (typeof folder === 'string') setOutputDir(folder)
    } catch (e) {
      console.error('Failed to choose output folder:', e)
    }
  }

  const handleInstallTemplates = async () => {
    setTemplateMessage('')
    setTemplateError(false)
    try {
      const dir = await installExampleTemplates()
      setTemplateMessage(t('export.templatesInstalled', { path: dir }))
    } catch (e) {
      setTemplateError(true)
      setTemplateMessage(typeof e === 'string' ? e : String(e))
    }
  }

  const handleExport = async () => {
    if (running || !outputDir || !selected.length) return
    setRunning(true)
    setError('')
    setResult(null)
    setProgress(null)
    try {
      const chosen = books.filter(b => selected.includes(b.path))
      const res = await exportBooksSite({
        books: chosen,
        outputDir,
        onProgress: setProgress,
      })
      setResult(res)
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const progressText = progress
    ? progress.stage === 'prepare'
      ? t('export.preparing')
      : progress.stage === 'render'
        ? `${t('export.rendering')} ${Math.min(progress.done + 1, progress.total)}/${progress.total}`
        : t('export.writing')
    : ''

  return (
    <Dialog open={open} onClose={() => !running && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>{t('export.title')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('export.hint')}
        </Typography>

        {result ? (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>
              {t('export.done', {
                books: result.bookCount,
                pages: result.pageCount,
              })}
            </Alert>
            {result.missingAssets.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {t('export.missingAssets', { n: result.missingAssets.length })}
                <Box
                  component="div"
                  sx={{
                    mt: 0.5,
                    fontFamily: 'monospace',
                    fontSize: '0.72rem',
                    wordBreak: 'break-all',
                  }}
                >
                  {result.missingAssets.join('、')}
                </Box>
              </Alert>
            )}
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ wordBreak: 'break-all' }}
            >
              {result.entryPath}
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="subtitle2" gutterBottom>
              {t('export.selectBooks')}
            </Typography>
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                px: 1.5,
                py: 0.5,
                mb: 2,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {books.map(book => (
                <FormControlLabel
                  key={book.path}
                  sx={{ display: 'flex', ml: 0, mr: 0 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={selected.includes(book.path)}
                      onChange={e => toggleBook(book.path, e.target.checked)}
                      disabled={running}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ py: 0.25 }}>
                      {book.title}
                    </Typography>
                  }
                />
              ))}
            </Box>

            <Typography variant="subtitle2" gutterBottom>
              {t('export.outputDir')}
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Button variant="outlined" size="small" onClick={chooseFolder} disabled={running}>
                {t('export.chooseFolder')}
              </Button>
              <Typography
                variant="body2"
                color={outputDir ? 'text.primary' : 'text.secondary'}
                sx={{ wordBreak: 'break-all', flex: 1 }}
              >
                {outputDir || t('export.noFolder')}
              </Typography>
            </Box>

            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                onClick={handleInstallTemplates}
                disabled={running}
              >
                {t('export.installTemplates')}
              </Button>
              {templateMessage && (
                <Typography
                  variant="caption"
                  color={templateError ? 'error.main' : 'success.main'}
                  sx={{ wordBreak: 'break-all' }}
                >
                  {templateMessage}
                </Typography>
              )}
            </Box>

            {running && (
              <Box sx={{ mt: 2.5 }}>
                <LinearProgress
                  variant={
                    progress && progress.total > 0 ? 'determinate' : 'indeterminate'
                  }
                  value={
                    progress && progress.total > 0
                      ? (progress.done / progress.total) * 100
                      : undefined
                  }
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.8, display: 'block' }}>
                  {progressText}
                  {progress?.label ? ` · ${progress.label}` : ''}
                </Typography>
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
          <>
            <Button onClick={() => revealInFinder(result.entryPath)}>
              {t('export.openFolder')}
            </Button>
            <Button variant="contained" onClick={onClose}>
              {t('common.close')}
            </Button>
          </>
        ) : (
          <>
            {running && <CircularProgress size={18} sx={{ mr: 1 }} />}
            <Button onClick={onClose} disabled={running}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="contained"
              onClick={handleExport}
              disabled={running || !outputDir || !selected.length}
            >
              {running ? t('export.exporting') : t('export.start')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
