import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import DeleteIcon from '@mui/icons-material/Delete'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import { Box, IconButton, Tooltip } from '@mui/material'
import type { Editor } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  editor: Editor | null
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

export default function TableFloatingMenu({
  editor,
  scrollContainerRef,
}: Props) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return

    const update = () => {
      if (!editor.isActive('table')) {
        setVisible(false)
        return
      }

      const { from } = editor.state.selection
      try {
        const coords = editor.view.coordsAtPos(from)
        const container = scrollContainerRef.current
        if (container) {
          const rect = container.getBoundingClientRect()
          setPos({
            top: coords.top - rect.top - 40,
            left: coords.left - rect.left,
          })
        }
        setVisible(true)
      } catch {
        setVisible(false)
      }
    }

    editor.on('selectionUpdate', update)
    update()
    return () => {
      editor.off('selectionUpdate', update)
    }
  }, [editor, scrollContainerRef])

  if (!visible || !editor) return null

  return (
    <Box
      ref={menuRef}
      sx={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        zIndex: 50,
        display: 'flex',
        gap: 0.3,
        bgcolor: 'background.paper',
        borderRadius: 1,
        boxShadow: 'var(--shadow-md)',
        p: 0.3,
        pointerEvents: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Tooltip title={t('toolbar.addRowBelow')}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('toolbar.deleteRow')}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().deleteRow().run()}
        >
          <RemoveCircleOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('toolbar.addColumnAfter')}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('toolbar.deleteColumn')}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          <RemoveCircleOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('toolbar.deleteTable')}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          <DeleteIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
