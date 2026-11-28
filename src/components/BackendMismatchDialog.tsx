import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

import type { BackendHealth } from '../hooks/useBackendHealth'
import { EXPECTED_BACKEND_API } from '../utils/commands'

interface BackendMismatchDialogProps {
  health: BackendHealth
}

/**
 * 前后端版本不匹配时阻塞界面，避免旧的 Rust 二进制被当成正常状态使用。
 */
export default function BackendMismatchDialog({
  health,
}: BackendMismatchDialogProps) {
  const { t } = useTranslation()
  const open = health.state === 'stale' || health.state === 'missing' || health.state === 'error'

  const builtAt = health.info?.built_at
    ? new Date(health.info.built_at * 1000).toLocaleString()
    : t('backend.unknownTime')

  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
      <DialogTitle>{t('backend.title')}</DialogTitle>
      <DialogContent>
        <Alert severity="error" sx={{ mb: 2 }}>
          {health.state === 'stale' &&
            t('backend.stale', {
              expected: EXPECTED_BACKEND_API,
              actual: health.info?.api_level ?? '',
              builtAt,
            })}
          {health.state === 'missing' && t('backend.missing')}
          {health.state === 'error' &&
            t('backend.failed', { error: health.error ?? '' })}
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('backend.steps')}
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1,
            borderRadius: 1,
            bgcolor: 'action.hover',
            fontFamily: 'var(--font-family-mono)',
            fontSize: '0.75rem',
            whiteSpace: 'pre-wrap',
          }}
        >
          {t('backend.commands')}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={health.recheck} disabled={health.checking}>
          {health.checking ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} />
              {t('backend.checking')}
            </Box>
          ) : (
            t('backend.recheck')
          )}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
