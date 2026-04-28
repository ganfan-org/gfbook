import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { nord } from '@milkdown/theme-nord';
import { Box, Typography } from '@mui/material';
import { useRef } from 'react';

import '@milkdown/theme-nord/style.css';

interface ChapterEditorProps {
  content: string;
  chapterTitle: string;
  onContentChange: (markdown: string) => void;
}

function MilkdownEditorInner({ content, onContentChange }: { content: string; onContentChange: (markdown: string) => void }) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;

  useEditor(
    (root) => {
      return Editor.make()
        .config(ctx => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, content);
        })
        .config(nord)
        .use(commonmark)
        .use(listener)
        .config(ctx => {
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, _prevMarkdown) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              onChangeRef.current(markdown);
            }, 500);
          });
        });
    },
    [],
  );

  return <Milkdown />;
}

export default function ChapterEditor({ content, chapterTitle, onContentChange }: ChapterEditorProps) {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 3, pt: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h5" fontWeight={600}>
          {chapterTitle || 'Select a chapter'}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        <MilkdownProvider>
          <MilkdownEditorInner content={content} onContentChange={onContentChange} />
        </MilkdownProvider>
      </Box>
    </Box>
  );
}
