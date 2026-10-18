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

interface MathPreviewProps {
  latex: string
}

function MathPreview({ latex }: MathPreviewProps) {
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
      <DialogTitle>{isBlock ? 'Block Math' : 'Inline Math'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="LaTeX"
          fullWidth
          multiline={isBlock}
          rows={isBlock ? 3 : 1}
          value={latex}
          onChange={(e) => onLatexChange(e.target.value.replace(/\x1b/g, ''))}
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
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSubmit} variant="contained" disabled={!latex.trim()}>
          Update
        </Button>
      </DialogActions>
    </Dialog>
  )
}
