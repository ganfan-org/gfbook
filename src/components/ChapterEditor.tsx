import { invoke } from '@tauri-apps/api/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ImageIcon from '@mui/icons-material/Image';
import ListIcon from '@mui/icons-material/List';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import LooksOneIcon from '@mui/icons-material/LooksOne';
import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import Looks3Icon from '@mui/icons-material/Looks3';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '@tiptap/markdown';
import MarkdownIt from 'markdown-it';
import { open } from '@tauri-apps/plugin-dialog';
import './ChapterEditor.css';

const md = new MarkdownIt({ html: true, breaks: true, linkify: true });

interface ChapterEditorProps {
  content: string;
  bookPath: string;
  onContentChange: (markdown: string) => void;
}

function useTipTapEditor(content: string, onContentChange: (markdown: string) => void, bookPath: string) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onContentChange);
  const lastSavedRef = useRef('');
  const initializedRef = useRef(false);
  onChangeRef.current = onContentChange;
  const bookPathRef = useRef(bookPath);
  bookPathRef.current = bookPath;

  const ImageWithAsset = useMemo(() => {
    return Image.extend({
      addAttributes() {
        return {
          src: { default: null },
          alt: { default: null },
          title: { default: null },
          dataSrc: { default: null },
        };
      },
      renderHTML({ node, HTMLAttributes }) {
        const src = node.attrs.src as string;
        const dataSrc = node.attrs.dataSrc as string;
        const displaySrc = dataSrc || src;
        if (src?.startsWith('assets/') && !dataSrc) {
          console.warn('[Image] missing dataSrc for:', src);
        }
        return ['img', { ...HTMLAttributes, src: displaySrc }];
      },
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      ImageWithAsset.configure({ inline: false }),
      Markdown,
    ],
    content: content ? md.render(content) : { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      handleKeyDown(view, event) {
        if (view.composing && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const blob = item.getAsFile();
            if (!blob) continue;
            const reader = new FileReader();
            reader.onload = async () => {
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(',')[1];
              const ext = item.type.split('/')[1] || 'png';
              try {
                const relPath: string = await invoke('save_image_data', {
                  bookPath: bookPathRef.current,
                  dataBase64: base64,
                  ext,
                });
                const displayUrl: string = await invoke('read_image_as_data_url', {
                  bookPath: bookPathRef.current,
                  relPath,
                });
                const node = view.state.schema.nodes.image.create({
                  src: relPath,
                  dataSrc: displayUrl,
                });
                const tr = view.state.tr.replaceSelectionWith(node);
                view.dispatch(tr);
              } catch (err) {
                console.error('Failed to paste image:', err);
              }
            };
            reader.readAsDataURL(blob);
            return true;
          }
        }
        return false;
      },
      attributes: {
        class: 'gtbook-editor',
      },
    },
    onUpdate: ({ editor: ed }) => {
      let markdown = ed.storage.markdown.manager.serialize(ed.getJSON());
      markdown = markdown.replace(/\n+(\n\s*```)/g, '$1');
      // First update: store baseline, skip save
      if (!initializedRef.current) {
        lastSavedRef.current = markdown;
        initializedRef.current = true;
        return;
      }
      // Skip if the markdown content hasn't actually changed
      if (markdown === lastSavedRef.current) return;
      lastSavedRef.current = markdown;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChangeRef.current(markdown);
      }, 500);
    },
  });

  // After editor is created, resolve image assets to data URLs
  useEffect(() => {
    if (!editor) return;
    let pending = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') {
        console.log('[Image] node:', node.attrs.src, 'dataSrc:', node.attrs.dataSrc);
        if (node.attrs.src?.startsWith('assets/') && !node.attrs.dataSrc) pending++;
      }
    });
    if (pending === 0) return;
    console.log('[Image] loading', pending, 'images');

    const loadImages = async () => {
      const todo: { pos: number; src: string }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image' && node.attrs.src?.startsWith('assets/') && !node.attrs.dataSrc) {
          todo.push({ pos, src: node.attrs.src });
        }
      });
      for (const { pos, src } of todo) {
        try {
          const dataUrl = await invoke('read_image_as_data_url', { bookPath: bookPathRef.current, relPath: src });
          const tr = editor.state.tr;
          tr.setNodeMarkup(pos, undefined, { ...editor.state.doc.nodeAt(pos)?.attrs, dataSrc: dataUrl });
          editor.view.dispatch(tr);
        } catch (e) {
          console.error('Failed to load image:', src, e);
        }
      }
    };
    loadImages();
  }, [editor]);

  return editor;
}

async function insertImage(editor: ReturnType<typeof useEditor>, bookPath: string) {
  if (!editor) return;
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    title: 'Select image',
  });
  if (!selected) return;
  try {
    const relPath: string = await invoke('save_image_to_book', { bookPath, sourcePath: selected });
    const dataUrl: string = await invoke('read_image_as_data_url', { bookPath, relPath });
    editor.chain().focus().insertContent({
      type: 'image',
      attrs: { src: relPath, dataSrc: dataUrl },
    }).run();
  } catch (e) {
    console.error('Failed to insert image:', e);
  }
}

export default function ChapterEditor({ content, bookPath, onContentChange }: ChapterEditorProps) {
  const editor = useTipTapEditor(content, onContentChange, bookPath);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocItems, setTocItems] = useState<{ level: number; text: string; pos: number }[]>([]);
  const [, forceUpdate] = useState(0);

  // Re-render on selection change to update toolbar button highlights
  useEffect(() => {
    if (!editor) return;
    const handler = () => forceUpdate((n) => n + 1);
    editor.on('selectionUpdate', handler);
    return () => { editor.off('selectionUpdate', handler); };
  }, [editor]);

  // Download external images pasted from clipboard
  useEffect(() => {
    if (!editor) return;
    const processed = new Set<string>();
    const handler = async () => {
      const todo: { pos: number; url: string }[] = [];
      editor.state.doc.descendants((node, pos) => {
        const src = node.attrs.src as string | undefined;
        if (src && (src.startsWith('http://') || src.startsWith('https://')) && !processed.has(src)) {
          todo.push({ pos, url: src });
          processed.add(src);
        }
      });
      if (todo.length === 0) return;
      for (const { url } of todo) {
        try {
          const relPath = await invoke('download_image_url', { bookPath, url });
          const dataUrl = await invoke('read_image_as_data_url', { bookPath, relPath });
          let found = false;
          editor.state.doc.descendants((node, pos) => {
            if (!found && node.attrs.src === url) {
              found = true;
              const tr = editor.state.tr;
              tr.setNodeMarkup(pos, undefined, { src: relPath, dataSrc: dataUrl });
              editor.view.dispatch(tr);
            }
          });
        } catch (e) {
          console.error('Failed to download image:', url, e);
        }
      }
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor]);

  // Update TOC when editor content changes
  useEffect(() => {
    if (!editor || !tocOpen) return;
    const update = () => {
      const items: { level: number; text: string; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          const text = node.textContent;
          if (text) items.push({ level: node.attrs.level, text, pos });
        }
      });
      setTocItems(items);
    };
    update();
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor, tocOpen]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 1, py: 0.3, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.3, minHeight: 38, flexWrap: 'wrap' }}>
        {editor && (
          <>
            <Tooltip title="Paragraph">
              <IconButton size="small" onClick={() => editor.chain().focus().setParagraph().run()}
                color={editor.isActive('paragraph') ? 'primary' : 'default'}>
                <TextFieldsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="H1">
              <IconButton size="small" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                color={editor.isActive('heading', { level: 1 }) ? 'primary' : 'default'}>
                <LooksOneIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="H2">
              <IconButton size="small" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                color={editor.isActive('heading', { level: 2 }) ? 'primary' : 'default'}>
                <LooksTwoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="H3">
              <IconButton size="small" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                color={editor.isActive('heading', { level: 3 }) ? 'primary' : 'default'}>
                <Looks3Icon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Bold">
              <IconButton size="small" onClick={() => editor.chain().focus().toggleBold().run()}
                color={editor.isActive('bold') ? 'primary' : 'default'}>
                <FormatBoldIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Italic">
              <IconButton size="small" onClick={() => editor.chain().focus().toggleItalic().run()}
                color={editor.isActive('italic') ? 'primary' : 'default'}>
                <FormatItalicIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Bullet list">
              <IconButton size="small" onClick={() => editor.chain().focus().toggleBulletList().run()}
                color={editor.isActive('bulletList') ? 'primary' : 'default'}>
                <FormatListBulletedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Ordered list">
              <IconButton size="small" onClick={() => editor.chain().focus().toggleOrderedList().run()}
                color={editor.isActive('orderedList') ? 'primary' : 'default'}>
                <FormatListNumberedIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Insert image">
              <IconButton size="small" onClick={() => insertImage(editor, bookPath)}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Box sx={{ flex: 1 }} />

            <Tooltip title="Table of contents">
              <IconButton size="small" onClick={() => setTocOpen(!tocOpen)}
                color={tocOpen ? 'primary' : 'default'}>
                <ListIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <Box sx={{ p: 4 }}><Typography color="text.secondary">Loading editor...</Typography></Box>
          )}
        </Box>

        {tocOpen && (
          <Box
            sx={{
              width: 220,
              flexShrink: 0,
              borderLeft: 1,
              borderColor: 'divider',
              overflow: 'auto',
              p: 1.5,
              bgcolor: (t: any) => t.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1 }}>
              Contents
            </Typography>
            {tocItems.length === 0 ? (
              <Typography variant="caption" color="text.secondary">No headings</Typography>
            ) : (
              tocItems.map((item, i) => (
                <Box
                  key={i}
                  onClick={() => {
                    editor?.commands.setTextSelection(item.pos);
                    editor?.commands.focus();
                  }}
                  sx={{
                    pl: item.level * 1.5,
                    py: 0.4,
                    cursor: 'pointer',
                    borderRadius: 0.5,
                    fontSize: '0.82rem',
                    color: 'text.secondary',
                    borderLeft: '2px solid transparent',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary', borderLeftColor: 'primary.main' },
                  }}
                >
                  {item.text}
                </Box>
              ))
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
