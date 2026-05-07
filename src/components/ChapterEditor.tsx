import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import MarkdownIt from 'markdown-it';
import { Box, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import { Markdown } from 'tiptap-markdown';
import './ChapterEditor.css';

const md = new MarkdownIt({ html: true, breaks: true, linkify: true });

interface ChapterEditorProps {
  content: string;
  chapterTitle: string;
  onContentChange: (markdown: string) => void;
}

function useTipTapEditor(content: string, onContentChange: (markdown: string) => void) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
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

  return editor;
}

export default function ChapterEditor({ content, chapterTitle, onContentChange }: ChapterEditorProps) {
  const editor = useTipTapEditor(content, onContentChange);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 3, pt: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h5" fontWeight={600}>
          {chapterTitle || 'Select a chapter'}
        </Typography>
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
