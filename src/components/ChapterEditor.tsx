import { invoke } from '@tauri-apps/api/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import ImageIcon from '@mui/icons-material/Image';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import { useEffect, useMemo, useRef } from 'react';
import { Markdown } from 'tiptap-markdown';
import MarkdownIt from 'markdown-it';
import { open } from '@tauri-apps/plugin-dialog';
import './ChapterEditor.css';

const md = new MarkdownIt({ html: true, breaks: true, linkify: true });

interface ChapterEditorProps {
  content: string;
  chapterTitle: string;
  bookPath: string;
  onContentChange: (markdown: string) => void;
}

function useTipTapEditor(content: string, onContentChange: (markdown: string) => void, bookPath: string) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onContentChange);
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
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: 'tight',
        bulletListMarker: '-',
        linkify: true,
        breaks: true,
      }),
    ],
    content: content ? md.render(content) : '<p></p>',
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
      const markdown = (ed.storage as any).markdown.getMarkdown();
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

export default function ChapterEditor({ content, chapterTitle, bookPath, onContentChange }: ChapterEditorProps) {
  const editor = useTipTapEditor(content, onContentChange, bookPath);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 3, pt: 2, pb: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h5" fontWeight={600} sx={{ flex: 1 }}>
          {chapterTitle || 'Select a chapter'}
        </Typography>
        {editor && (
            <Tooltip title="Insert image (supports png, jpg, gif, webp)">
            <IconButton size="small" onClick={() => insertImage(editor, bookPath)}>
              <ImageIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <Box sx={{ p: 4 }}><Typography color="text.secondary">Loading editor...</Typography></Box>
        )}
      </Box>
    </Box>
  );
}
