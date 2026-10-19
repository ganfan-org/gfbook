import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import type { Editor } from '@tiptap/core'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

interface LinkDialogProps {
  open: boolean
  onClose: () => void
  url: string
  onUrlChange: Dispatch<SetStateAction<string>>
  text: string
  isEdit: boolean
  editor: Editor | null
  onUpdate: () => void
  onRemove: () => void
}

export default function LinkDialog({
  open,
  onClose,
  url,
  onUrlChange,
  text,
  isEdit,
  editor,
  onUpdate,
  onRemove,
}: LinkDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      disableScrollLock
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {isEdit ? t('editor.editLink') : t('editor.addLink')}
        {isEdit && (
          <Button
            size="small"
            onClick={() => shellOpen(url)}
            sx={{ textTransform: 'none' }}
          >
            {t('editor.openInBrowser')}
          </Button>
        )}
      </DialogTitle>
      <DialogContent>
        {isEdit && text && (
          <TextField
            margin="dense"
            label={t('editor.text')}
            fullWidth
            size="small"
            value={text}
            disabled
            sx={{ mb: 1 }}
          />
        )}
        <TextField
          autoFocus
          margin="dense"
          label={t('editor.url')}
          fullWidth
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (editor && url.trim()) {
                onUpdate()
              }
            }
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {isEdit && (
          <Button variant="outlined" color="error" onClick={onRemove}>
            {t('common.remove')}
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onUpdate} variant="contained">
          {isEdit ? t('common.update') : t('editor.addLink')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
