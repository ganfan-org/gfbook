import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { BookProblems, Problem } from '../types'
import {
  formatInvokeError,
  scanBookProblems,
  scanLibraryProblems,
} from '../utils/commands'

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // WKWebView 在少数情况下拒绝 Clipboard API，回退到选区复制
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

interface ProblemsDialogProps {
  open: boolean
  onClose: () => void
  /** 传入时只显示这本书；不传时显示全库。 */
  bookPath?: string | null
  onOpenProblem: (bookPath: string, chapterId: string | null) => void
}

export default function ProblemsDialog({
  open,
  onClose,
  bookPath,
  onOpenProblem,
}: ProblemsDialogProps) {
  const { t } = useTranslation()
  const [books, setBooks] = useState<BookProblems[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (bookPath) {
        const result = await scanBookProblems(bookPath)
        setBooks(result.problems.length > 0 ? [result] : [])
      } else {
        setBooks(await scanLibraryProblems())
      }
    } catch (e) {
      setError(formatInvokeError(e))
    } finally {
      setLoading(false)
    }
  }, [bookPath])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload])

  const problemText = (problem: Problem): string => {
    const detail = problem.detail ?? ''
    switch (problem.kind) {
      case 'meta_missing_file':
        return t('problems.kinds.metaMissingFile', {
          file: detail || (problem.file ?? ''),
        })
      case 'orphan_file':
        return t('problems.kinds.orphanFile', {
          file: problem.file ?? detail,
        })
      case 'title_mismatch':
        return t('problems.kinds.titleMismatch', { heading: detail })
      case 'empty_title':
        return t('problems.kinds.emptyTitle')
      case 'duplicate_title':
        return t('problems.kinds.duplicateTitle', { title: detail })
      case 'missing_image':
        return t('problems.kinds.missingImage', { path: detail })
      case 'conflict_marker':
        return t('problems.kinds.conflictMarker', {
          line: problem.line ?? '',
        })
      case 'schema_version':
        return t('problems.kinds.schemaVersion', { version: detail })
      case 'meta_parse':
        return t('problems.kinds.metaParse', { detail })
      case 'diary_date_missing':
        return t('problems.kinds.diaryDateMissing')
      case 'diary_date_mismatch':
        return t('problems.kinds.diaryDateMismatch', { detail })
      default:
        return problem.message
    }
  }

  const total = books.reduce((sum, book) => sum + book.problems.length, 0)

  const levelText = (problem: Problem) =>
    problem.severity === 'error'
      ? t('problems.copy.levelError')
      : t('problems.copy.levelWarning')

  const problemLines = (problem: Problem): string[] => [
    `${t('problems.copy.chapter')}: ${problem.chapter_title ?? '-'}`,
    `${t('problems.copy.file')}: ${problem.file ?? '-'}`,
    `${t('problems.copy.line')}: ${problem.line ?? '-'}`,
    `${t('problems.copy.level')}: ${levelText(problem)}`,
    `${t('problems.copy.type')}: ${problem.kind}`,
    `${t('problems.copy.description')}: ${problemText(problem)}`,
  ]

  const singleReport = (book: BookProblems, problem: Problem): string =>
    [
      t('problems.copy.reportTitle'),
      `${t('problems.copy.book')}: ${book.book_title}`,
      `${t('problems.copy.bookPath')}: ${book.book_path}`,
      ...problemLines(problem),
    ].join('\n')

  const allReport = (): string =>
    [
      t('problems.copy.reportTitle'),
      t('problems.copy.reportSummary', {
        books: books.length,
        problems: total,
      }),
      ...books.flatMap(book => [
        '',
        `## ${book.book_title}`,
        `${t('problems.copy.bookPath')}: ${book.book_path}`,
        ...book.problems.flatMap((problem, index) => [
          '',
          `${index + 1}.`,
          ...problemLines(problem).map(line => `   ${line}`),
        ]),
      ]),
    ].join('\n')

  const copyText = async (text: string) => {
    const ok = await writeClipboard(text)
    setToast(ok ? t('problems.copied') : t('problems.copyFailed'))
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {t('problems.title')}
        {!loading && total > 0 && (
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ ml: 1 }}
          >
            {t('problems.count', { n: total })}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 4,
              color: 'text.secondary',
            }}
          >
            <CircularProgress size={18} />
            <Typography variant="body2">{t('problems.loading')}</Typography>
          </Box>
        ) : error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void reload()}>
                {t('problems.refresh')}
              </Button>
            }
          >
            {error}
          </Alert>
        ) : books.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
            {t('problems.empty')}
          </Typography>
        ) : (
          <Box sx={{ maxHeight: '60vh', overflow: 'auto' }}>
            {books.map((book) => (
              <Box key={book.book_path} sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 1,
                    position: 'sticky',
                    top: 0,
                    bgcolor: 'background.paper',
                    py: 0.5,
                    zIndex: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }}>
                    {book.book_title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('problems.count', { n: book.problems.length })}
                  </Typography>
                </Box>
                {book.problems.map((problem, index) => (
                  <Box
                    key={`${book.book_path}-${index}`}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      borderTop: '1px solid',
                      borderColor: 'divider',
                      '&:hover .problem-copy, &:focus-within .problem-copy': {
                        opacity: 1,
                      },
                    }}
                  >
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        onOpenProblem(book.book_path, problem.chapter_id)
                      }
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onOpenProblem(book.book_path, problem.chapter_id)
                        }
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        color: 'inherit',
                        px: 1,
                        py: 0.75,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      {problem.severity === 'error' ? (
                        <ErrorOutlineIcon
                          sx={{ fontSize: 16, color: 'error.main', mt: 0.2 }}
                        />
                      ) : (
                        <WarningAmberIcon
                          sx={{ fontSize: 16, color: 'warning.main', mt: 0.2 }}
                        />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.8rem', wordBreak: 'break-word' }}
                        >
                          {problem.chapter_title
                            ? `${problem.chapter_title} — ${problemText(problem)}`
                            : problemText(problem)}
                        </Typography>
                        {(problem.file || problem.line) && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              fontFamily: 'var(--font-family-mono)',
                              fontSize: '0.66rem',
                              wordBreak: 'break-all',
                            }}
                          >
                            {problem.file}
                            {problem.line ? `:${problem.line}` : ''}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Tooltip title={t('problems.copyOne')} arrow>
                      <IconButton
                        className="problem-copy"
                        size="small"
                        aria-label={t('problems.copyOne')}
                        onClick={() =>
                          void copyText(singleReport(book, problem))
                        }
                        sx={{
                          opacity: 0,
                          transition: 'opacity 120ms',
                          mr: 0.5,
                          mt: 0.25,
                        }}
                      >
                        <ContentCopyIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          size="small"
          startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
          onClick={() => void copyText(allReport())}
          disabled={loading || total === 0}
          sx={{ mr: 'auto' }}
        >
          {t('problems.copyAll')}
        </Button>
        <Button onClick={() => void reload()} disabled={loading}>
          {t('problems.refresh')}
        </Button>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
      </Dialog>
      <Snackbar
        open={toast !== null}
        autoHideDuration={2000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  )
}
