import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import FunctionsIcon from '@mui/icons-material/Functions'
import ImageIcon from '@mui/icons-material/Image'
import LinkIcon from '@mui/icons-material/Link'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import ListIcon from '@mui/icons-material/List'
import Looks3Icon from '@mui/icons-material/Looks3'
import LooksOneIcon from '@mui/icons-material/LooksOne'
import LooksTwoIcon from '@mui/icons-material/LooksTwo'
import SuperscriptIcon from '@mui/icons-material/Superscript'
import TableChartIcon from '@mui/icons-material/TableChart'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import { Box, IconButton, Tooltip } from '@mui/material'
import type { Editor } from '@tiptap/core'

interface EditorToolbarProps {
  editor: Editor | null
  tocOpen: boolean
  bookPath: string
  onToggleToc: () => void
  onAddLink: () => void
  onEditMath: (type: 'inline' | 'block') => void
  onInsertImage: () => void
}

export default function EditorToolbar({
  editor,
  tocOpen,
  onToggleToc,
  onAddLink,
  onEditMath,
  onInsertImage,
}: EditorToolbarProps) {
  if (!editor) return null

  return (
    <Box
      sx={{
        px: 1,
        py: 0.3,
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 0.3,
        minHeight: 38,
        flexWrap: 'wrap',
      }}
    >
      <Tooltip title="Paragraph">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setParagraph().run()}
          color={editor.isActive('paragraph') ? 'primary' : 'default'}
        >
          <TextFieldsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="H1">
        <IconButton
          size="small"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          color={
            editor.isActive('heading', { level: 1 }) ? 'primary' : 'default'
          }
        >
          <LooksOneIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="H2">
        <IconButton
          size="small"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          color={
            editor.isActive('heading', { level: 2 }) ? 'primary' : 'default'
          }
        >
          <LooksTwoIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="H3">
        <IconButton
          size="small"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          color={
            editor.isActive('heading', { level: 3 }) ? 'primary' : 'default'
          }
        >
          <Looks3Icon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Bold">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBold().run()}
          color={editor.isActive('bold') ? 'primary' : 'default'}
        >
          <FormatBoldIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Italic">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          color={editor.isActive('italic') ? 'primary' : 'default'}
        >
          <FormatItalicIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Bullet list">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          color={editor.isActive('bulletList') ? 'primary' : 'default'}
        >
          <FormatListBulletedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Ordered list">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          color={editor.isActive('orderedList') ? 'primary' : 'default'}
        >
          <FormatListNumberedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={editor.isActive('link') ? 'Remove link' : 'Add link'}>
        <IconButton
          size="small"
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run()
            } else {
              onAddLink()
            }
          }}
          color={editor.isActive('link') ? 'primary' : 'default'}
        >
          {editor.isActive('link') ? (
            <LinkOffIcon fontSize="small" />
          ) : (
            <LinkIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Tooltip title="Inline math">
        <IconButton
          size="small"
          onClick={() => onEditMath('inline')}
          color={editor.isActive('inlineMath') ? 'primary' : 'default'}
        >
          <SuperscriptIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Block math">
        <IconButton
          size="small"
          onClick={() => onEditMath('block')}
          color={editor.isActive('blockMath') ? 'primary' : 'default'}
        >
          <FunctionsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Insert image">
        <IconButton size="small" onClick={onInsertImage}>
          <ImageIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Insert table">
        <IconButton
          size="small"
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <TableChartIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Table of contents">
        <IconButton
          size="small"
          onClick={onToggleToc}
          color={tocOpen ? 'primary' : 'default'}
        >
          <ListIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
