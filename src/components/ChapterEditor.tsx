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
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { open as dialogOpen } from '@tauri-apps/plugin-dialog'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import Image from '@tiptap/extension-image'
import { Mathematics } from '@tiptap/extension-mathematics'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import { MarkdownManager } from '@tiptap/markdown'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import katex from 'katex'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import 'katex/dist/katex.min.css'
import './ChapterEditor.css'

function MathPreview({ latex }: { latex: string }) {
  const html = useMemo(() => {
    if (!latex.trim()) return '<span style="color:#999">Preview</span>'
    try {
      return katex.renderToString(latex, {
        throwOnError: true,
        displayMode: true,
      })
    } catch (e: any) {
      return `<span style="color:#d32f2f">${e.message || 'Invalid LaTeX'}</span>`
    }
  }, [latex])
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

interface ChapterEditorProps {
  content: string
  bookPath: string
  onContentChange: (markdown: string) => void
}

function stripMailtoLinks(node: any): any {
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(stripMailtoLinks)
  const result: any = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'marks' && Array.isArray(value)) {
      result.marks = value.filter(
        (m: any) =>
          !(m.type === 'link' && m.attrs?.href?.startsWith('mailto:')),
      )
    } else if (key === 'content' && Array.isArray(value)) {
      result.content = value.map(stripMailtoLinks)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = stripMailtoLinks(value)
    } else {
      result[key] = value
    }
  }
  return result
}

function useTipTapEditor(
  content: string,
  onContentChange: (markdown: string) => void,
  bookPath: string,
  mathEditRef: React.MutableRefObject<
    ((pos: number, type: string, latex: string) => void) | null
  >,
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onContentChange)
  const lastSavedRef = useRef('')
  const initializedRef = useRef(false)
  const bookPathRef = useRef(bookPath)
  onChangeRef.current = onContentChange
  bookPathRef.current = bookPath

  const ImageWithAsset = useMemo(() => {
    return Image.extend({
      addAttributes() {
        return {
          src: { default: null },
          alt: { default: null },
          title: { default: null },
          dataSrc: { default: null },
        }
      },
      renderHTML({ node, HTMLAttributes }) {
        const displaySrc = node.attrs.dataSrc || node.attrs.src
        return ['img', { ...HTMLAttributes, src: displaySrc }]
      },
    })
  }, [])

  const parsedContent = useMemo(() => {
    if (!content) return { type: 'doc', content: [{ type: 'paragraph' }] }
    try {
      const ext = [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          link: { autolink: false, linkOnPaste: false, openOnClick: false },
        }),
        Image,
        Mathematics.configure({ katexOptions: { throwOnError: false } }),
        Table,
        TableRow,
        TableCell,
        TableHeader,
      ]
      const doc = new MarkdownManager({ extensions: ext }).parse(content)
      // Strip mailto links from parsed content
      return stripMailtoLinks(doc)
    } catch {
      return { type: 'doc', content: [{ type: 'paragraph' }] }
    }
  }, [content])

  const serializerRef = useRef<MarkdownManager | null>(null)
  const getSerializer = useCallback(() => {
    if (!serializerRef.current) {
      serializerRef.current = new MarkdownManager({
        extensions: [
          StarterKit.configure({
            heading: { levels: [1, 2, 3, 4, 5, 6] },
            link: { autolink: false, linkOnPaste: false, openOnClick: false },
          }),
          Image,
          Mathematics.configure({ katexOptions: { throwOnError: false } }),
          Table,
          TableRow,
          TableCell,
          TableHeader,
        ],
      })
    }
    return serializerRef.current
  }, [])

  const editorExtensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { autolink: false, linkOnPaste: false, openOnClick: false },
      }),
      ImageWithAsset.configure({ inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Mathematics.configure({
        katexOptions: { throwOnError: false },
        blockOptions: {
          onClick: (_node: any, pos: number) => {
            mathEditRef.current?.(pos, 'blockMath', _node.attrs?.latex || '')
          },
        },
        inlineOptions: {
          onClick: (_node: any, pos: number) => {
            mathEditRef.current?.(pos, 'inlineMath', _node.attrs?.latex || '')
          },
        },
      }),
    ],
    [],
  )

  const editorProps = useMemo(
    () => ({
      handleKeyDown(view: any, event: KeyboardEvent) {
        if (view.composing && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          return true
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          return true
        }
        return false
      },
      handlePaste: (view: any, event: ClipboardEvent) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const blob = item.getAsFile()
            if (!blob) continue
            const reader = new FileReader()
            reader.onload = async () => {
              const dataUrl = reader.result as string
              const base64 = dataUrl.split(',')[1]
              const ext = item.type.split('/')[1] || 'png'
              try {
                const relPath: string = await invoke('save_image_data', {
                  bookPath: bookPathRef.current,
                  dataBase64: base64,
                  ext,
                })
                const displayUrl: string = await invoke(
                  'read_image_as_data_url',
                  { bookPath: bookPathRef.current, relPath },
                )
                const node = view.state.schema.nodes.image.create({
                  src: relPath,
                  dataSrc: displayUrl,
                })
                view.dispatch(view.state.tr.replaceSelectionWith(node))
              } catch (err) {
                console.error('Failed to paste image:', err)
              }
            }
            reader.readAsDataURL(blob)
            return true
          }
        }
        return false
      },
      attributes: { class: 'gtbook-editor' },
      transformPastedHTML: (html: string) =>
        html.replace(/<a\s[^>]*href="mailto:[^"]*"[^>]*>(.*?)<\/a>/gi, '$1'),
    }),
    [],
  )

  const editor = useEditor({
    extensions: editorExtensions,
    content: parsedContent,
    editorProps,
    onUpdate: ({ editor: ed }) => {
      let markdown = ''
      try {
        markdown = getSerializer().serialize(ed.getJSON())
      } catch {
        return
      }
      markdown = markdown.replace(/\n+(\n\s*```)/g, '$1')
      if (!initializedRef.current) {
        lastSavedRef.current = markdown
        initializedRef.current = true
        return
      }
      if (markdown === lastSavedRef.current) return
      lastSavedRef.current = markdown
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => onChangeRef.current(markdown), 500)
    },
  })

  // Resolve image assets to data URLs
  useEffect(() => {
    if (!editor) return
    const todo: { pos: number; src: string }[] = []
    editor.state.doc.descendants((node, pos) => {
      if (
        node.type.name === 'image' &&
        node.attrs.src?.startsWith('assets/') &&
        !node.attrs.dataSrc
      )
        todo.push({ pos, src: node.attrs.src })
    })
    if (todo.length === 0) return
    ;(async () => {
      for (const { pos, src } of todo) {
        try {
          const dataUrl = await invoke('read_image_as_data_url', {
            bookPath: bookPathRef.current,
            relPath: src,
          })
          if (editor.view) {
            const tr = editor.state.tr
            tr.setNodeMarkup(pos, undefined, {
              ...editor.state.doc.nodeAt(pos)?.attrs,
              dataSrc: dataUrl,
            })
            editor.view.dispatch(tr)
          }
        } catch (e) {
          console.error('Failed to load image:', src, e)
        }
      }
    })()
  }, [editor])

  return editor
}

async function insertImage(
  editor: ReturnType<typeof useEditor>,
  bookPath: string,
) {
  if (!editor) return
  const selected = await dialogOpen({
    multiple: false,
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
      },
    ],
    title: 'Select image',
  })
  if (!selected) return
  try {
    const relPath: string = await invoke('save_image_to_book', {
      bookPath,
      sourcePath: selected,
    })
    const dataUrl: string = await invoke('read_image_as_data_url', {
      bookPath,
      relPath,
    })
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: { src: relPath, dataSrc: dataUrl },
      })
      .run()
  } catch (e) {
    console.error('Failed to insert image:', e)
  }
}

function handleLinkSubmit(
  editor: ReturnType<typeof useEditor>,
  url: string,
  close: (v: boolean) => void,
) {
  if (!editor || !url.trim()) return
  editor.chain().focus().toggleLink({ href: url.trim() }).run()
  close(false)
}

interface EditorAreaProps {
  editor: ReturnType<typeof useEditor>
  tocOpen: boolean
  tocItems: { level: number; text: string; pos: number }[]
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

const EditorArea = memo(function EditorArea({
  editor,
  tocOpen,
  tocItems,
  scrollContainerRef,
}: EditorAreaProps) {
  return (
    <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <Box
        ref={scrollContainerRef}
        sx={{
          position: 'absolute',
          inset: 0,
          right: tocOpen ? 220 : 0,
          overflow: 'auto',
        }}
      >
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <Box sx={{ p: 4 }}>
            <Typography color="text.secondary">Loading editor...</Typography>
          </Box>
        )}
      </Box>
      {tocOpen && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 220,
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'auto',
            p: 1.5,
            bgcolor: (t) =>
              t.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
          }}
        >
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{
              mb: 1,
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Contents
          </Typography>
          {tocItems.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              No headings
            </Typography>
          ) : (
            tocItems.map((item, i) => (
              <Box
                key={i}
                onClick={() => {
                  editor?.commands.setTextSelection(item.pos)
                  editor?.commands.focus()
                }}
                sx={{
                  pl: item.level * 1.5,
                  py: 0.4,
                  cursor: 'pointer',
                  borderRadius: 0.5,
                  fontSize: '0.82rem',
                  color: 'text.secondary',
                  borderLeft: '2px solid transparent',
                  '&:hover': {
                    bgcolor: 'action.hover',
                    color: 'text.primary',
                    borderLeftColor: 'primary.main',
                  },
                }}
              >
                {item.text}
              </Box>
            ))
          )}
        </Box>
      )}
    </Box>
  )
})

export default function ChapterEditor({
  content,
  bookPath,
  onContentChange,
}: ChapterEditorProps) {
  const [tocOpen, setTocOpen] = useState(false)
  const [tocItems, setTocItems] = useState<
    { level: number; text: string; pos: number }[]
  >([])
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [linkInEdit, setLinkInEdit] = useState(false)
  const [linkPos, setLinkPos] = useState<number | null>(null)
  const [linkPos2, setLinkPos2] = useState<number | null>(null)
  const [mathDialogOpen, setMathDialogOpen] = useState(false)
  const [mathLatex, setMathLatex] = useState('')
  const [mathPos, setMathPos] = useState<number | null>(null)
  const [mathTypeName, setMathTypeName] = useState<'blockMath' | 'inlineMath'>(
    'inlineMath',
  )
  const [, forceUpdate] = useState(0)
  const mathEditRef = useRef<
    ((pos: number, type: string, latex: string) => void) | null
  >(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const savedScrollTopRef = useRef<number | null>(null)

  const editor = useTipTapEditor(
    content,
    onContentChange,
    bookPath,
    mathEditRef,
  )

  mathEditRef.current = (pos: number, typeName: string, latex: string) => {
    setMathPos(pos)
    setMathTypeName(typeName as any)
    setMathLatex(latex)
    setMathDialogOpen(true)
  }

  const handleMathSubmit = () => {
    if (!editor) return
    const cleanLatex = mathLatex.replace(/\x1b/g, '').trim()
    if (!cleanLatex) return
    if (mathPos !== null) {
      if (mathTypeName === 'blockMath') {
        editor
          .chain()
          .setNodeSelection(mathPos)
          .updateBlockMath({ latex: cleanLatex })
          .focus()
          .run()
      } else {
        editor
          .chain()
          .setNodeSelection(mathPos)
          .updateInlineMath({ latex: cleanLatex })
          .focus()
          .run()
      }
    } else {
      if (mathTypeName === 'blockMath') {
        editor.chain().focus().insertBlockMath({ latex: cleanLatex }).run()
      } else {
        editor.chain().focus().insertInlineMath({ latex: cleanLatex }).run()
      }
    }
    setMathDialogOpen(false)
  }

  const handleLinkUpdate = () => {
    if (!editor || !linkUrl.trim()) return
    savedScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? null
    if (linkInEdit && linkPos !== null && linkPos2 !== null) {
      // Update existing link: remove old mark, add new one
      const tr = editor.state.tr
      tr.removeMark(linkPos, linkPos2, editor.state.schema.marks.link)
      tr.addMark(
        linkPos,
        linkPos2,
        editor.state.schema.marks.link.create({ href: linkUrl.trim() }),
      )
      editor.view.dispatch(tr)
    } else {
      // Add new link
      editor.chain().focus().toggleLink({ href: linkUrl.trim() }).run()
    }
    setLinkDialogOpen(false)
  }

  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', () => forceUpdate((n) => n + 1))
    return () => {
      editor.off('selectionUpdate', () => {})
    }
  }, [editor])

  // Handle link clicks - show edit dialog instead of navigating
  useEffect(() => {
    let linkDom: HTMLElement | undefined
    try {
      linkDom = (editor as any)?.view?.dom
    } catch {}
    if (!linkDom) return

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const a = target.closest('a')
      if (!a) return
      e.preventDefault()
      e.stopPropagation()
      savedScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? null
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const a = target.closest('a')
      if (!a) return
      e.preventDefault()
      e.stopPropagation()
      const textNode = a.firstChild
      let from = 0,
        to = 0
      if (textNode) {
        try {
          from = editor.view.posAtDOM(textNode, 0)
          to = from + (textNode.textContent?.length || 1)
        } catch {}
      }
      setLinkUrl(a.getAttribute('href') || '')
      setLinkText(a.textContent || '')
      setLinkInEdit(true)
      setLinkPos(from)
      setLinkPos2(to)
      setLinkDialogOpen(true)
    }

    linkDom.addEventListener('mousedown', onMouseDown, true)
    linkDom.addEventListener('click', onClick, true)
    return () => {
      linkDom.removeEventListener('mousedown', onMouseDown, true)
      linkDom.removeEventListener('click', onClick, true)
    }
  }, [editor])

  useLayoutEffect(() => {
    if (savedScrollTopRef.current != null && scrollContainerRef.current) {
      const scrollTop = savedScrollTopRef.current
      savedScrollTopRef.current = null
      scrollContainerRef.current.scrollTop = scrollTop
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollTop
        }
      })
    }
  }, [linkDialogOpen])

  useEffect(() => {
    if (!editor) return
    const processed = new Set<string>()
    const handler = async () => {
      const todo: { url: string }[] = []
      editor.state.doc.descendants((node) => {
        const src = node.attrs.src as string | undefined
        if (
          src &&
          (src.startsWith('http://') || src.startsWith('https://')) &&
          !processed.has(src)
        ) {
          todo.push({ url: src })
          processed.add(src)
        }
      })
      for (const { url } of todo) {
        try {
          const relPath = await invoke('download_image_url', { bookPath, url })
          const dataUrl = await invoke('read_image_as_data_url', {
            bookPath,
            relPath,
          })
          let found = false
          editor.state.doc.descendants((node, pos) => {
            if (!found && node.attrs.src === url) {
              found = true
              if (editor.view) {
                const tr = editor.state.tr
                tr.setNodeMarkup(pos, undefined, {
                  src: relPath,
                  dataSrc: dataUrl,
                })
                editor.view.dispatch(tr)
              }
            }
          })
        } catch (e) {
          console.error('Download failed:', url, e)
        }
      }
    }
    editor.on('update', handler)
    return () => {
      editor.off('update', handler)
    }
  }, [editor])

  // TOC
  useEffect(() => {
    if (!editor || !tocOpen) return
    const update = () => {
      const items: { level: number; text: string; pos: number }[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.textContent)
          items.push({ level: node.attrs.level, text: node.textContent, pos })
      })
      setTocItems(items)
    }
    update()
    editor.on('update', update)
    return () => {
      editor.off('update', update)
    }
  }, [editor, tocOpen])

  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  // Math edit: checks if cursor/selection is on a math node and edits or inserts
  function editMath(type: 'inline' | 'block') {
    if (!editor) return
    const { from } = editor.state.selection
    const pos = from
    // Check if cursor is inside or on a math node
    let mathName: string | null = null
    let mathPos: number | null = null
    let existingLatex = ''

    // Walk up from cursor position to find math node
    editor.state.doc.descendants((node, p) => {
      if (mathPos !== null) return
      const typeName = node.type.name
      if (
        (typeName === 'inlineMath' || typeName === 'blockMath') &&
        pos >= p &&
        pos <= p + node.nodeSize
      ) {
        mathName = typeName
        mathPos = p
        existingLatex = node.attrs.latex || ''
      }
    })

    if (mathPos !== null && mathName) {
      // Edit existing math via dialog
      setMathPos(mathPos)
      setMathTypeName(mathName as any)
      setMathLatex(existingLatex)
      setMathDialogOpen(true)
    } else {
      // Insert new math - use dialog too
      setMathPos(null)
      setMathTypeName(type === 'block' ? 'blockMath' : 'inlineMath')
      setMathLatex('x')
      setMathDialogOpen(true)
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
        {editor && (
          <>
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
                  editor.isActive('heading', { level: 1 })
                    ? 'primary'
                    : 'default'
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
                  editor.isActive('heading', { level: 2 })
                    ? 'primary'
                    : 'default'
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
                  editor.isActive('heading', { level: 3 })
                    ? 'primary'
                    : 'default'
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
            <Tooltip
              title={editor.isActive('link') ? 'Remove link' : 'Add link'}
            >
              <IconButton
                size="small"
                onClick={() => {
                  if (editor.isActive('link')) {
                    editor.chain().focus().unsetLink().run()
                  } else {
                    setLinkUrl(editor.getAttributes('link').href || 'https://')
                    setLinkInEdit(false)
                    setLinkText('')
                    setLinkDialogOpen(true)
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
                onClick={() => editMath('inline')}
                color={editor.isActive('inlineMath') ? 'primary' : 'default'}
              >
                <SuperscriptIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Block math">
              <IconButton
                size="small"
                onClick={() => editMath('block')}
                color={editor.isActive('blockMath') ? 'primary' : 'default'}
              >
                <FunctionsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Insert image">
              <IconButton
                size="small"
                onClick={() => insertImage(editor, bookPath)}
              >
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
                onClick={() => setTocOpen(!tocOpen)}
                color={tocOpen ? 'primary' : 'default'}
              >
                <ListIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>
      <EditorArea
        editor={editor}
        tocOpen={tocOpen}
        tocItems={tocItems}
        scrollContainerRef={scrollContainerRef}
      />
      <Dialog
        open={linkDialogOpen}
        onClose={() => {
          savedScrollTopRef.current =
            scrollContainerRef.current?.scrollTop ?? null
          setLinkDialogOpen(false)
        }}
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
          {linkInEdit ? 'Edit Link' : 'Add Link'}
          {linkInEdit && (
            <Button
              size="small"
              onClick={() => {
                shellOpen(linkUrl)
              }}
              sx={{ textTransform: 'none' }}
            >
              Open in Browser
            </Button>
          )}
        </DialogTitle>
        <DialogContent>
          {linkInEdit && linkText && (
            <TextField
              margin="dense"
              label="Text"
              fullWidth
              size="small"
              value={linkText}
              disabled
              sx={{ mb: 1 }}
            />
          )}
          <TextField
            autoFocus
            margin="dense"
            label="URL"
            fullWidth
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                savedScrollTopRef.current =
                  scrollContainerRef.current?.scrollTop ?? null
                if (linkInEdit) handleLinkUpdate()
                else handleLinkSubmit(editor, linkUrl, setLinkDialogOpen)
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          {linkInEdit && (
            <Button
              variant="outlined"
              color="error"
              onClick={() => {
                savedScrollTopRef.current =
                  scrollContainerRef.current?.scrollTop ?? null
                try {
                  if (!editor) return
                  if (linkPos !== null && linkPos2 !== null) {
                    const tr = editor.state.tr
                    tr.removeMark(
                      linkPos,
                      linkPos2,
                      editor.state.schema.marks.link,
                    )
                    editor.view.dispatch(tr)
                  }
                } catch (e) {
                  console.error('Remove link failed:', e)
                }
                setLinkDialogOpen(false)
              }}
            >
              Remove
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={() => {
              savedScrollTopRef.current =
                scrollContainerRef.current?.scrollTop ?? null
              if (linkInEdit) handleLinkUpdate()
              else handleLinkSubmit(editor, linkUrl, setLinkDialogOpen)
            }}
            variant="contained"
          >
            {linkInEdit ? 'Update' : 'Add Link'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={mathDialogOpen}
        onClose={() => setMathDialogOpen(false)}
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
          {mathTypeName === 'blockMath' ? 'Block Math' : 'Inline Math'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="LaTeX"
            fullWidth
            multiline={mathTypeName === 'blockMath'}
            rows={mathTypeName === 'blockMath' ? 3 : 1}
            value={mathLatex}
            onChange={(e) => setMathLatex(e.target.value.replace(/\x1b/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
              }
              if (e.key === 'Enter' && mathTypeName === 'inlineMath') {
                e.preventDefault()
                handleMathSubmit()
              }
            }}
          />
          <Box
            sx={{
              mt: 2,
              p: 2,
              bgcolor: 'grey.50',
              borderRadius: 1,
              textAlign: 'center',
              minHeight: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
            }}
          >
            <MathPreview latex={mathLatex} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMathDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleMathSubmit}
            variant="contained"
            disabled={!mathLatex.trim()}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
