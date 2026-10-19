import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { LogEntry } from '../utils/commands'
import { formatBookDate } from '../utils/date'

interface BookSettingsDialogProps {
  open: boolean
  onClose: () => void
  bookPath: string
  bookTitle: string
  updatedTime: number
  onRename: (title: string) => Promise<void>
  onDelete: () => Promise<void>
  onRevealInFinder: () => void
  // Git tab
  gitStatusText?: string
  gitLoading?: boolean
  commitMessage?: string
  setCommitMessage?: (s: string) => void
  onCommit?: () => Promise<void>
  remoteUrl?: string | null
  remoteDraft?: string
  onRemoteDraftChange?: (s: string) => void
  onLoadRemote?: () => Promise<void>
  onSetRemoteUrl?: () => Promise<void>
  onFetch?: () => Promise<void>
  onPull?: () => Promise<void>
  onPush?: () => Promise<void>
  onMerge?: () => Promise<void>
  syncingType?: string | null
  mergeInProgress?: boolean
  aheadBehind?: [number, number] | null
  conflictedFiles?: string[]
  resolvedFiles?: Set<string>
  onResolveFile?: (file: string, useTheirs: boolean) => Promise<void>
  onCommitMerge?: () => Promise<void>
  // Log tab
  logs?: LogEntry[]
  onRefreshLogs?: () => Promise<LogEntry[]>
  tabs?: ('info' | 'git' | 'log')[]
}

export default function BookSettingsDialog({
  open,
  onClose,
  bookPath,
  bookTitle,
  updatedTime,
  onRename,
  onDelete,
  onRevealInFinder,
  gitStatusText = '',
  gitLoading = false,
  commitMessage = '',
  setCommitMessage = () => {},
  onCommit = async () => {},
  remoteUrl = null,
  remoteDraft = '',
  onRemoteDraftChange = () => {},
  onLoadRemote = async () => {},
  onSetRemoteUrl = async () => {},
  onFetch = async () => {},
  onPull = async () => {},
  onPush = async () => {},
  onMerge = async () => {},
  syncingType = null,
  mergeInProgress = false,
  aheadBehind = null,
  conflictedFiles = [],
  resolvedFiles = new Set(),
  onResolveFile = async () => {},
  onCommitMerge = async () => {},
  logs = [],
  onRefreshLogs = async () => [],
  tabs = ['info', 'git', 'log'],
}: BookSettingsDialogProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState(tabs[0])
  const [renameValue, setRenameValue] = useState(bookTitle)
  const [dialogLogs, setDialogLogs] = useState<LogEntry[]>(logs)

  const displayLogs = logs.length > 0 ? logs : dialogLogs

  const handleRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === bookTitle) return
    await onRename(renameValue.trim())
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>{t('bookSettings.title')}</DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.includes('info') && (
          <Tab label={t('bookSettings.tabInfo')} value="info" />
        )}
        {tabs.includes('git') && (
          <Tab label={t('bookSettings.tabGit')} value="git" />
        )}
        {tabs.includes('log') && (
          <Tab label={t('bookSettings.tabLog')} value="log" />
        )}
      </Tabs>
      <DialogContent sx={{ pt: 2 }}>
        {tab === 'info' && (
          <Box>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              {bookTitle}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: '0.7rem',
                wordBreak: 'break-all',
              }}
            >
              {bookPath}
            </Typography>
            <Box display="flex" gap={1} mt={1}>
              <Button
                size="small"
                startIcon={<FolderOpenIcon />}
                variant="outlined"
                onClick={onRevealInFinder}
              >
                {navigator.platform.includes('Win')
                  ? t('bookSettings.showInExplorer')
                  : navigator.platform.includes('Mac')
                    ? t('bookSettings.revealInFinder')
                    : t('bookSettings.openFolder')}
              </Button>
            </Box>
            {updatedTime > 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                mt={1}
              >
                {t('bookSettings.updated')}: {formatBookDate(updatedTime)}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
              {t('bookSettings.rename')}
            </Typography>
            <Box display="flex" gap={1}>
              <TextField
                size="small"
                fullWidth
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                }}
              />
              <Button
                variant="outlined"
                size="small"
                disabled={
                  !renameValue.trim() || renameValue.trim() === bookTitle
                }
                onClick={handleRename}
              >
                {t('bookSettings.rename')}
              </Button>
            </Box>

            <Button
              fullWidth
              variant="outlined"
              color="error"
              size="small"
              sx={{ mt: 2 }}
              onClick={onDelete}
            >
              {t('bookSettings.deleteBook')}
            </Button>
          </Box>
        )}

        {tab === 'git' && (
          <Box>
            {gitLoading ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 2,
                  color: 'text.secondary',
                }}
              >
                <CircularProgress size={16} />
                <Typography variant="body2">
                  {t('bookSettings.loadingGit')}
                </Typography>
              </Box>
            ) : (
              <>
                <Box display="flex" gap={1}>
                  {aheadBehind != null && aheadBehind[0] > 0 && (
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.2,
                        color: 'warning.main',
                        fontSize: '0.75rem',
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
                        fontSize: '0.75rem',
                      }}
                    >
                      <ArrowDownwardIcon sx={{ fontSize: 12 }} />
                      {aheadBehind[1]}
                    </Box>
                  )}
                </Box>

                <Divider sx={{ my: 1.5 }} />

                <Typography variant="subtitle2" gutterBottom>
                  {t('bookSettings.changes')}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  mb={1}
                  sx={{
                    fontFamily: 'var(--font-family-mono)',
                    fontSize: '0.75rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {gitStatusText || t('bookSettings.noChanges')}
                </Typography>

                {gitStatusText && (
                  <>
                    <TextField
                      size="small"
                      label={t('bookSettings.commitMessage')}
                      fullWidth
                      multiline
                      rows={2}
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          onCommit()
                        }
                      }}
                      sx={{ mb: 1 }}
                    />
                    <Button
                      onClick={onCommit}
                      variant="contained"
                      size="small"
                      disabled={!commitMessage.trim()}
                    >
                      {t('bookSettings.commit')}
                    </Button>
                  </>
                )}

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" gutterBottom>
                  {t('bookSettings.remote')}
                </Typography>
                {remoteUrl && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: 'block',
                      mb: 0.5,
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: '0.7rem',
                    }}
                  >
                    {remoteUrl}
                  </Typography>
                )}
                <TextField
                  size="small"
                  fullWidth
                  placeholder="https://github.com/user/repo.git"
                  value={remoteDraft}
                  onChange={(e) => onRemoteDraftChange(e.target.value)}
                  sx={{ mb: 1 }}
                />
                <Box display="flex" gap={1} mb={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={onLoadRemote}
                  >
                    {t('bookSettings.load')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={onSetRemoteUrl}
                  >
                    {t('bookSettings.setUrl')}
                  </Button>
                </Box>

                <Box display="flex" gap={1} mb={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!!syncingType}
                    onClick={onFetch}
                  >
                    {syncingType === 'fetch'
                      ? t('bookSettings.fetching')
                      : t('bookSettings.fetch')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!!syncingType}
                    onClick={onPull}
                  >
                    {syncingType === 'pull'
                      ? t('bookSettings.pulling')
                      : t('bookSettings.pull')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!!syncingType}
                    onClick={onPush}
                  >
                    {syncingType === 'push'
                      ? t('bookSettings.pushing')
                      : t('bookSettings.push')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    disabled={!!syncingType || mergeInProgress}
                    onClick={onMerge}
                  >
                    {mergeInProgress
                      ? t('bookSettings.merging')
                      : t('bookSettings.merge')}
                  </Button>
                </Box>

                {conflictedFiles.length > 0 && (
                  <Box mt={1} mb={1}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" color="error" gutterBottom>
                      {t('bookSettings.conflictedFiles')}
                    </Typography>
                    {conflictedFiles.map((file) => (
                      <Box
                        key={file}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          py: 0.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            flex: 1,
                            fontFamily: 'var(--font-family-mono)',
                            fontSize: '0.65rem',
                            wordBreak: 'break-all',
                          }}
                        >
                          {resolvedFiles.has(file) ? '✅ ' : ''}
                          {file}
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          sx={{ fontSize: '0.6rem', minWidth: 70 }}
                          onClick={() => onResolveFile(file, true)}
                          disabled={resolvedFiles.has(file)}
                        >
                          {t('bookSettings.useRemote')}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          sx={{ fontSize: '0.6rem', minWidth: 70 }}
                          onClick={() => onResolveFile(file, false)}
                          disabled={resolvedFiles.has(file)}
                        >
                          {t('bookSettings.useLocal')}
                        </Button>
                      </Box>
                    ))}
                    {conflictedFiles.every((f) => resolvedFiles.has(f)) && (
                      <Button
                        size="small"
                        variant="contained"
                        sx={{ mt: 1 }}
                        onClick={onCommitMerge}
                      >
                        {t('bookSettings.commitMerge')}
                      </Button>
                    )}
                  </Box>
                )}
              </>
            )}
          </Box>
        )}

        {tab === 'log' && (
          <Box>
            <Button
              size="small"
              onClick={async () => {
                const entries = await onRefreshLogs()
                if (entries.length > 0) setDialogLogs(entries)
              }}
              sx={{ mb: 1 }}
            >
              {t('common.refresh')}
            </Button>
            {displayLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('bookSettings.noLogs')}
              </Typography>
            ) : (
              <Box
                sx={{
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: '0.7rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  maxHeight: 350,
                  overflow: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                }}
              >
                {displayLogs.map((entry, i) => (
                  <Box
                    key={i}
                    sx={{
                      py: 0.2,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box
                      component="span"
                      sx={{ color: 'text.secondary', mr: 1 }}
                    >
                      {new Date(entry.t).toLocaleString()}
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        color:
                          /set_|import_image|paste_image|download_image/.test(
                            entry.e,
                          )
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
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
