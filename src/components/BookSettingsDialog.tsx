import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  ActivityCategory,
  ActivityItem,
  BookIdentity,
  RepoState,
} from '../types'
import { formatInvokeError } from '../utils/commands'
import { formatBookDate, formatRelativeTime } from '../utils/date'

interface BookSettingsDialogProps {
  open: boolean
  onClose: () => void
  bookPath: string
  bookTitle: string
  updatedTime: number
  onRename: (title: string) => Promise<void>
  onDelete: () => Promise<void>
  onRevealInFinder: () => void
  // 版本 / 仓库
  repoState: RepoState | null
  repoLoading: boolean
  onEnableRepo: () => Promise<void>
  commitMessage: string
  setCommitMessage: (s: string) => void
  onCommit: () => Promise<void>
  remoteUrl: string | null
  remoteDraft: string
  onRemoteDraftChange: (s: string) => void
  onLoadRemote: () => Promise<void>
  onSetRemoteUrl: () => Promise<void>
  onFetch: () => Promise<void>
  onPull: () => Promise<void>
  onPush: () => Promise<void>
  onMerge: () => Promise<void>
  syncingType: string | null
  mergeInProgress: boolean
  conflictedFiles: string[]
  resolvedFiles: Set<string>
  onResolveFile: (file: string, useTheirs: boolean) => Promise<void>
  onCommitMerge: () => Promise<void>
  syncOutput: string
  // 提交身份
  identity: BookIdentity | null
  identityLoading: boolean
  onSaveIdentity: (name: string, email: string) => Promise<void>
  // 操作记录
  activity: ActivityItem[]
  activityLoading: boolean
  activityError: string | null
  onRefreshActivity: () => Promise<void>
}

type TabKey = 'info' | 'version' | 'activity'

/** 按事件名归类，供记录页筛选 */
function eventCategory(event: string): ActivityCategory {
  const name = event.toLowerCase()
  if (name.includes('image')) return 'image'
  if (name === 'commit' || name.includes('merge')) return 'commit'
  if (name.includes('chapter') || name.includes('diary')) return 'chapter'
  if (
    name.startsWith('set_') ||
    ['fetch', 'pull', 'push', 'remote'].some((key) => name.includes(key))
  ) {
    return 'git'
  }
  return 'other'
}

function activityCategory(item: ActivityItem): ActivityCategory {
  return item.kind === 'commit' ? 'commit' : eventCategory(item.event)
}

function isFailed(item: ActivityItem): boolean {
  if (item.kind !== 'event') return false
  return item.result === 'error' || item.result === 'failed'
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 0.35 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 72, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontSize: '0.78rem', wordBreak: 'break-word', minWidth: 0 }}
      >
        {value}
      </Typography>
    </Box>
  )
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
  repoState,
  repoLoading,
  onEnableRepo,
  commitMessage,
  setCommitMessage,
  onCommit,
  remoteUrl,
  remoteDraft,
  onRemoteDraftChange,
  onLoadRemote,
  onSetRemoteUrl,
  onFetch,
  onPull,
  onPush,
  onMerge,
  syncingType,
  mergeInProgress,
  conflictedFiles,
  resolvedFiles,
  onResolveFile,
  onCommitMerge,
  syncOutput,
  identity,
  identityLoading,
  onSaveIdentity,
  activity,
  activityLoading,
  activityError,
  onRefreshActivity,
}: BookSettingsDialogProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabKey>('info')
  const [renameValue, setRenameValue] = useState(bookTitle)
  const [identityMode, setIdentityMode] = useState<'global' | 'book'>('global')
  const [identityName, setIdentityName] = useState('')
  const [identityEmail, setIdentityEmail] = useState('')
  const [identitySaving, setIdentitySaving] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [activityFilter, setActivityFilter] = useState<'all' | ActivityCategory>(
    'all',
  )
  const activityRequestedRef = useRef(false)
  const [enablingRepo, setEnablingRepo] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)
  const [enableDone, setEnableDone] = useState(false)

  // 弹窗重新打开时同步书名草稿
  useEffect(() => {
    if (!open) return
    setRenameValue(bookTitle)
    setEnableError(null)
    setEnableDone(false)
  }, [open, bookTitle])

  // 身份数据刷新后回填表单
  useEffect(() => {
    if (!identity) return
    setIdentityMode(identity.source === 'book' ? 'book' : 'global')
    setIdentityName(identity.local_name ?? identity.effective_name ?? '')
    setIdentityEmail(identity.local_email ?? identity.effective_email ?? '')
    setIdentityError(null)
  }, [identity])

  // 记录页进入即加载：每次打开弹窗只自动请求一次
  useEffect(() => {
    if (!open) {
      activityRequestedRef.current = false
      return
    }
    if (tab !== 'activity' || activityRequestedRef.current) return
    activityRequestedRef.current = true
    if (activity.length === 0 && !activityLoading) {
      void onRefreshActivity()
    }
  }, [
    open,
    tab,
    activity.length,
    activityLoading,
    onRefreshActivity,
  ])

  const handleRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === bookTitle) return
    await onRename(renameValue.trim())
  }

  const handleEnableRepo = async () => {
    setEnablingRepo(true)
    setEnableError(null)
    setEnableDone(false)
    try {
      await onEnableRepo()
      setEnableDone(true)
    } catch (e) {
      setEnableError(formatInvokeError(e))
    } finally {
      setEnablingRepo(false)
    }
  }

  const handleIdentityModeChange = async (
    _: unknown,
    mode: 'global' | 'book' | null,
  ) => {
    if (!mode) return
    setIdentityMode(mode)
    setIdentityError(null)
    if (mode === 'global' && identity?.source === 'book') {
      setIdentitySaving(true)
      try {
        await onSaveIdentity('', '')
      } catch {
        setIdentityError(t('bookSettings.identitySaveFailed'))
      } finally {
        setIdentitySaving(false)
      }
    }
  }

  const handleSaveIdentity = async () => {
    if (!identityName.trim() || !identityEmail.trim()) return
    setIdentitySaving(true)
    setIdentityError(null)
    try {
      await onSaveIdentity(identityName.trim(), identityEmail.trim())
    } catch {
      setIdentityError(t('bookSettings.identitySaveFailed'))
    } finally {
      setIdentitySaving(false)
    }
  }

  const identityValue =
    identity?.effective_name && identity?.effective_email
      ? `${identity.effective_name} <${identity.effective_email}>`
      : identity?.effective_name ||
        identity?.effective_email ||
        t('bookSettings.identityNone')

  const identitySourceLabel =
    identity?.source === 'book'
      ? t('bookSettings.identitySourceBook')
      : identity?.source === 'global'
        ? t('bookSettings.identitySourceGlobal')
        : t('bookSettings.identitySourceNone')

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return activity
    return activity.filter((item) => activityCategory(item) === activityFilter)
  }, [activity, activityFilter])

  const conflictsUnresolved =
    conflictedFiles.length > 0 &&
    conflictedFiles.some((file) => !resolvedFiles.has(file))

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>{t('bookSettings.title')}</DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label={t('bookSettings.tabInfo')} value="info" />
        <Tab label={t('bookSettings.tabVersion')} value="version" />
        <Tab label={t('bookSettings.tabActivity')} value="activity" />
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

        {tab === 'version' && (
          <Box>
            {repoLoading && !repoState ? (
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
            ) : !repoState?.initialized ? (
              <Box>
                <Alert severity="info" sx={{ mb: 1 }}>
                  {t('bookSettings.noRepo')}
                </Alert>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  {t('bookSettings.noRepoHint')}
                </Typography>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <Button
                    variant="contained"
                    size="small"
                    disabled={enablingRepo}
                    onClick={handleEnableRepo}
                  >
                    {enablingRepo
                      ? t('bookSettings.enablingRepo')
                      : t('bookSettings.enableRepo')}
                  </Button>
                  {enablingRepo && <CircularProgress size={16} />}
                </Box>
                {enableError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {t('bookSettings.enableRepoFailed')}: {enableError}
                  </Alert>
                )}
              </Box>
            ) : (
              <>
                {enableDone && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    {t('bookSettings.enableRepoDone')}
                  </Alert>
                )}
                <Typography variant="subtitle2" gutterBottom>
                  {t('bookSettings.syncSummary')}
                </Typography>
                <Box
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    px: 1.5,
                    py: 1,
                    mb: 2,
                  }}
                >
                  <SummaryRow
                    label={t('bookSettings.branch')}
                    value={
                      repoState.detached
                        ? t('repo.detached')
                        : repoState.branch || t('repo.unborn')
                    }
                  />
                  <SummaryRow
                    label={t('bookSettings.remote')}
                    value={repoState.remote_url || t('repo.noRemote')}
                  />
                  <SummaryRow
                    label={t('bookSettings.aheadBehind')}
                    value={`↑${repoState.ahead} ↓${repoState.behind}`}
                  />
                  <SummaryRow
                    label={t('bookSettings.uncommitted')}
                    value={t('repo.uncommitted', {
                      n: repoState.dirty.length,
                    })}
                  />
                  <SummaryRow
                    label={t('bookSettings.lastSync')}
                    value={
                      repoState.last_sync_at
                        ? formatRelativeTime(repoState.last_sync_at)
                        : t('bookSettings.neverSynced')
                    }
                  />
                </Box>

                <Typography variant="subtitle2" gutterBottom>
                  {t('bookSettings.commitIdentity')}
                </Typography>
                {identityLoading && !identity ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={14} />
                    <Typography variant="caption" color="text.secondary">
                      {t('common.loading')}
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ mb: 2 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: '0.72rem',
                        wordBreak: 'break-all',
                      }}
                    >
                      {identityValue}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {identitySourceLabel}
                    </Typography>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={identityMode}
                      onChange={handleIdentityModeChange}
                      sx={{ display: 'flex', mt: 1, mb: 1 }}
                    >
                      <ToggleButton
                        value="global"
                        sx={{ flex: 1, py: 0.2, fontSize: '0.72rem' }}
                      >
                        {t('bookSettings.identityFollowGlobal')}
                      </ToggleButton>
                      <ToggleButton
                        value="book"
                        sx={{ flex: 1, py: 0.2, fontSize: '0.72rem' }}
                      >
                        {t('bookSettings.identityCustom')}
                      </ToggleButton>
                    </ToggleButtonGroup>
                    {identityMode === 'book' && (
                      <>
                        <Box display="flex" gap={1}>
                          <TextField
                            size="small"
                            fullWidth
                            label={t('bookSettings.identityName')}
                            value={identityName}
                            onChange={(e) => setIdentityName(e.target.value)}
                          />
                          <TextField
                            size="small"
                            fullWidth
                            label={t('bookSettings.identityEmail')}
                            value={identityEmail}
                            onChange={(e) => setIdentityEmail(e.target.value)}
                          />
                        </Box>
                        {identityError && (
                          <Typography
                            variant="caption"
                            color="error"
                            display="block"
                            mt={0.5}
                          >
                            {identityError}
                          </Typography>
                        )}
                        <Button
                          size="small"
                          variant="outlined"
                          sx={{ mt: 1 }}
                          disabled={
                            identitySaving ||
                            !identityName.trim() ||
                            !identityEmail.trim()
                          }
                          onClick={handleSaveIdentity}
                        >
                          {identitySaving
                            ? t('common.loading')
                            : t('bookSettings.identitySave')}
                        </Button>
                      </>
                    )}
                  </Box>
                )}

                <Typography variant="subtitle2" gutterBottom>
                  {t('bookSettings.recentCommits')}
                </Typography>
                {repoState.recent_commits.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {t('bookSettings.noCommits')}
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      maxHeight: 160,
                      overflow: 'auto',
                      mb: 2,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    {repoState.recent_commits.map((commit) => (
                      <Box
                        key={commit.hash}
                        sx={{
                          px: 1,
                          py: 0.6,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          '&:last-of-type': { borderBottom: 0 },
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 0.75,
                          }}
                        >
                          <Chip
                            label={commit.short_hash}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              fontFamily: 'var(--font-family-mono)',
                            }}
                          />
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.76rem',
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {commit.message}
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.66rem', display: 'block' }}
                        >
                          {commit.author} · {commit.email} ·{' '}
                          {formatRelativeTime(commit.timestamp)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" gutterBottom>
                  {t('bookSettings.changes')}
                </Typography>
                {repoState.dirty.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" mb={1}>
                    {t('bookSettings.noChanges')}
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      maxHeight: 140,
                      overflow: 'auto',
                      mb: 1,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      px: 1,
                      py: 0.5,
                    }}
                  >
                    {repoState.dirty.map((entry) => (
                      <Box
                        key={`${entry.path}-${entry.code}`}
                        sx={{
                          display: 'flex',
                          gap: 1,
                          py: 0.15,
                          fontFamily: 'var(--font-family-mono)',
                          fontSize: '0.7rem',
                        }}
                      >
                        <Box
                          component="span"
                          sx={{ color: 'warning.main', flexShrink: 0 }}
                        >
                          {entry.code}
                        </Box>
                        <Box
                          component="span"
                          sx={{ wordBreak: 'break-all', minWidth: 0 }}
                        >
                          {entry.path}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}

                {repoState.dirty.length > 0 && (
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
                {remoteUrl ? null : (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    mb={0.5}
                  >
                    {t('repo.noRemote')}
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
                    disabled={!remoteDraft.trim()}
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

                {syncOutput && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {syncOutput}
                  </Typography>
                )}

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
                    {!conflictsUnresolved && (
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

        {tab === 'activity' && (
          <Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1.5,
              }}
            >
              <Select
                size="small"
                value={activityFilter}
                onChange={(e) =>
                  setActivityFilter(
                    e.target.value as 'all' | ActivityCategory,
                  )
                }
                sx={{ fontSize: '0.75rem', minWidth: 110 }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>
                  {t('bookSettings.activityAll')}
                </MenuItem>
                <MenuItem value="commit" sx={{ fontSize: '0.75rem' }}>
                  {t('bookSettings.activityCommit')}
                </MenuItem>
                <MenuItem value="chapter" sx={{ fontSize: '0.75rem' }}>
                  {t('bookSettings.activityChapter')}
                </MenuItem>
                <MenuItem value="git" sx={{ fontSize: '0.75rem' }}>
                  {t('bookSettings.activityGit')}
                </MenuItem>
                <MenuItem value="image" sx={{ fontSize: '0.75rem' }}>
                  {t('bookSettings.activityImage')}
                </MenuItem>
                <MenuItem value="other" sx={{ fontSize: '0.75rem' }}>
                  {t('bookSettings.activityOther')}
                </MenuItem>
              </Select>
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                onClick={() => void onRefreshActivity()}
                disabled={activityLoading}
              >
                {t('common.refresh')}
              </Button>
            </Box>

            {activityLoading && activity.length === 0 ? (
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
                  {t('common.loading')}
                </Typography>
              </Box>
            ) : activityError ? (
              <Alert severity="error">{activityError}</Alert>
            ) : filteredActivity.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('bookSettings.activityEmpty')}
              </Typography>
            ) : (
              <Box
                sx={{
                  maxHeight: 380,
                  overflow: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                {filteredActivity.map((item, index) => {
                  const failed = isFailed(item)
                  return (
                    <Box
                      key={
                        item.kind === 'commit'
                          ? `commit-${item.hash}`
                          : `event-${item.timestamp}-${index}`
                      }
                      sx={{
                        px: 1,
                        py: 0.6,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:last-of-type': { borderBottom: 0 },
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 0.75,
                        }}
                      >
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            flexShrink: 0,
                            bgcolor:
                              item.kind === 'commit'
                                ? 'info.main'
                                : failed
                                  ? 'error.main'
                                  : 'success.main',
                          }}
                        />
                        <Chip
                          label={
                            item.kind === 'commit'
                              ? item.short_hash
                              : item.event
                          }
                          size="small"
                          color={failed ? 'error' : 'default'}
                          sx={{
                            height: 18,
                            fontSize: '0.62rem',
                            fontFamily: 'var(--font-family-mono)',
                          }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.75rem',
                            flex: 1,
                            minWidth: 0,
                            wordBreak: 'break-word',
                          }}
                        >
                          {item.kind === 'commit' ? item.message : item.detail}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.64rem', flexShrink: 0 }}
                        >
                          {formatRelativeTime(item.timestamp)}
                        </Typography>
                      </Box>
                      {item.kind === 'commit' ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            fontSize: '0.64rem',
                            display: 'block',
                            ml: 1.4,
                          }}
                        >
                          {item.author} · {item.email}
                        </Typography>
                      ) : (
                        (failed || item.code) && (
                          <Typography
                            variant="caption"
                            color={failed ? 'error.main' : 'text.secondary'}
                            sx={{
                              fontSize: '0.64rem',
                              display: 'block',
                              ml: 1.4,
                              wordBreak: 'break-word',
                            }}
                          >
                            {failed
                              ? t('bookSettings.activityFailed')
                              : item.code}
                          </Typography>
                        )
                      )}
                    </Box>
                  )
                })}
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
