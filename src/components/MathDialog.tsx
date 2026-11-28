import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

interface MathPreviewProps {
  latex: string
}

function MathPreview({ latex }: MathPreviewProps) {
  // eslint-disable-next-line @eslint-react/error-boundaries
  try {
    return (
      <Box
        dangerouslySetInnerHTML={{
          __html: (window as any).katex?.renderToString(latex || ' ') || latex,
        }}
      />
    )
  } catch {
    return <Box>{latex}</Box>
  }
}

interface MathDialogProps {
  open: boolean
  onClose: () => void
  latex: string
  onLatexChange: Dispatch<SetStateAction<string>>
  typeName: string
  onSubmit: () => void
}

export default function MathDialog({
  open,
  onClose,
  latex,
  onLatexChange,
  typeName,
  onSubmit,
}: MathDialogProps) {
  const { t } = useTranslation()
  const isBlock = typeName === 'blockMath'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <DialogTitle>
        {isBlock ? t('editor.blockMath') : t('editor.inlineMath')}
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label={t('editor.latex')}
          fullWidth
          multiline={isBlock}
          rows={isBlock ? 3 : 1}
          value={latex}
          onChange={(e) =>
            // eslint-disable-next-line no-control-regex
            onLatexChange(e.target.value.replace(/\x1b/g, ''))
          }
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
            }
            if (e.key === 'Enter' && !isBlock) {
              e.preventDefault()
              onSubmit()
            }
          }}
        />
        <Box
          sx={{
            mt: 2,
            p: 2,
            bgcolor: 'var(--color-bg-tertiary)',
            borderRadius: 1,
            textAlign: 'center',
            minHeight: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
          }}
        >
          <MathPreview latex={latex} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={onSubmit} variant="contained" disabled={!latex.trim()}>
          {t('common.update')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
