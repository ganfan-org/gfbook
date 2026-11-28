import { Box, Tooltip, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

import type { RepoSummary } from '../types'

type DotState = 'conflict' | 'dirty' | 'unpushed' | 'noRemote'

const DOT_COLOR: Record<DotState, string> = {
  conflict: 'error.main',
  dirty: 'warning.main',
  unpushed: 'info.main',
  noRemote: 'text.disabled',
}

/**
 * 书卡上的仓库状态点：只在有状态时显示，具体说明放在悬停提示里。
 */
export default function RepoStatusDot({ summary }: { summary?: RepoSummary }) {
  const { t } = useTranslation()
  if (!summary || !summary.initialized) return null

  const lines: string[] = []
  if (summary.conflicted > 0) {
    lines.push(t('repoStatus.conflict', { n: summary.conflicted }))
  }
  if (summary.dirty > 0) {
    lines.push(t('repoStatus.dirty', { n: summary.dirty }))
  }
  if (summary.ahead > 0) {
    lines.push(t('repoStatus.unpushed', { n: summary.ahead }))
  }
  if (!summary.has_remote) {
    lines.push(t('repoStatus.noRemote'))
  }
  if (lines.length === 0) return null

  let state: DotState = 'noRemote'
  if (summary.conflicted > 0) state = 'conflict'
  else if (summary.dirty > 0) state = 'dirty'
  else if (summary.ahead > 0) state = 'unpushed'

  return (
    <Tooltip
      arrow
      title={
        <Box>
          {lines.map(line => (
            <Typography
              key={line}
              variant="caption"
              component="div"
              sx={{ fontSize: '0.7rem', lineHeight: 1.5 }}
            >
              {line}
            </Typography>
          ))}
        </Box>
      }
    >
      <Box
        component="span"
        role="img"
        aria-label={lines.join('; ')}
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bgcolor: DOT_COLOR[state],
          flexShrink: 0,
          display: 'inline-block',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
        }}
      />
    </Tooltip>
  )
}
