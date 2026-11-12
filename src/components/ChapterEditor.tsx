import { Box, Typography } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { open as dialogOpen } from '@tauri-apps/plugin-dialog'
import Image from '@tiptap/extension-image'
import { Mathematics } from '@tiptap/extension-mathematics'
import TableCellExtension from '@tiptap/extension-table-cell'
import TableHeaderExtension from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import { MarkdownManager } from '@tiptap/markdown'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import i18next from 'i18next'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { CustomTable } from '../editor/customTable'
import { getAssetUrl } from '../utils/commands'

import EditorToolbar from './EditorToolbar'
import LinkDialog from './LinkDialog'
import MathDialog from './MathDialog'
import 'katex/dist/katex.min.css'
import './ChapterEditor.css'

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
  const prevContentRef = useRef(content)
  const saveWithOldRef = useRef<((m: string) => void) | null>(null)

  // Capture old save callback BEFORE it gets overwritten on chapter switch
  if (content !== prevContentRef.current) {
    saveWithOldRef.current = onChangeRef.current
    prevContentRef.current = content
  }

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
        CustomTable,
        TableRow,
        TableCellExtension,
        TableHeaderExtension,
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
          CustomTable,
          TableRow,
          TableCellExtension,
          TableHeaderExtension,
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
      CustomTable.configure({ resizable: true }),
      TableRow,
      TableCellExtension,
      TableHeaderExtension,
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
                const assetUrl = await getAssetUrl(bookPathRef.current, relPath)
                const node = view.state.schema.nodes.image.create({
                  src: relPath,
                  dataSrc: assetUrl,
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
      attributes: { class: 'gfbook-editor' },
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

  // Force-save old content when switching chapters (runs during render, before editor update)
  if (saveWithOldRef.current) {
    if (editor && initializedRef.current) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      try {
        const markdown = getSerializer().serialize(editor.getJSON())
        saveWithOldRef.current(markdown)
      } catch {}
    }
    saveWithOldRef.current = null
  }

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
          const assetUrl = await getAssetUrl(bookPathRef.current, src)
          if (editor.view) {
            const tr = editor.state.tr
            tr.setNodeMarkup(pos, undefined, {
              ...editor.state.doc.nodeAt(pos)?.attrs,
              dataSrc: assetUrl,
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
    title: i18next.t('editor.selectImage'),
  })
  if (!selected) return
  try {
    const relPath: string = await invoke('save_image_to_book', {
      bookPath,
      sourcePath: selected,
    })
    const assetUrl = await getAssetUrl(bookPath, relPath)
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: { src: relPath, dataSrc: assetUrl },
      })
      .run()
  } catch (e) {
    console.error('Failed to insert image:', e)
  }
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
  const { t } = useTranslation()
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
            <Typography color="text.secondary">
              {t('editor.loadingEditor')}
            </Typography>
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
            bgcolor: 'var(--color-bg-tertiary)',
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
            {t('editor.contents')}
          </Typography>
          {tocItems.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t('editor.noHeadings')}
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
          const relPath = (await invoke('download_image_url', {
            bookPath,
            url,
          })) as string
          const assetUrl = await getAssetUrl(bookPath, relPath)
          let found = false
          editor.state.doc.descendants((node, pos) => {
            if (!found && node.attrs.src === url) {
              found = true
              if (editor.view) {
                const tr = editor.state.tr
                tr.setNodeMarkup(pos, undefined, {
                  src: relPath,
                  dataSrc: assetUrl,
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
      <EditorToolbar
        editor={editor}
        tocOpen={tocOpen}
        bookPath={bookPath}
        onToggleToc={() => setTocOpen(!tocOpen)}
        onAddLink={() => {
          setLinkUrl('https://')
          setLinkInEdit(false)
          setLinkText('')
          setLinkDialogOpen(true)
        }}
        onEditMath={(type) => editMath(type)}
        onInsertImage={() => insertImage(editor, bookPath)}
      />
      <EditorArea
        editor={editor}
        tocOpen={tocOpen}
        tocItems={tocItems}
        scrollContainerRef={scrollContainerRef}
      />
      <LinkDialog
        open={linkDialogOpen}
        onClose={() => {
          savedScrollTopRef.current =
            scrollContainerRef.current?.scrollTop ?? null
          setLinkDialogOpen(false)
        }}
        url={linkUrl}
        onUrlChange={setLinkUrl}
        text={linkText}
        isEdit={linkInEdit}
        editor={editor}
        onUpdate={() => {
          savedScrollTopRef.current =
            scrollContainerRef.current?.scrollTop ?? null
          handleLinkUpdate()
        }}
        onRemove={() => {
          savedScrollTopRef.current =
            scrollContainerRef.current?.scrollTop ?? null
          try {
            if (!editor) return
            if (linkPos !== null && linkPos2 !== null) {
              const tr = editor.state.tr
              tr.removeMark(linkPos, linkPos2, editor.state.schema.marks.link)
              editor.view.dispatch(tr)
            }
          } catch (e) {
            console.error('Remove link failed:', e)
          }
          setLinkDialogOpen(false)
        }}
      />
      <MathDialog
        open={mathDialogOpen}
        onClose={() => setMathDialogOpen(false)}
        latex={mathLatex}
        onLatexChange={setMathLatex}
        typeName={mathTypeName}
        onSubmit={handleMathSubmit}
      />
    </Box>
  )
}
