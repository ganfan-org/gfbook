import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';
import { useState, useCallback, useMemo } from 'react';

import ChapterEditor from '../components/ChapterEditor';
import ChapterTree from '../components/ChapterTree';
import { useBook } from '../hooks/useBook';
import type { Chapter } from '../types';

const DRAWER_WIDTH = 280;

interface BookDetailProps {
  bookPath: string;
  onBack: () => void;
}

export default function BookDetail({ bookPath, onBack }: BookDetailProps) {
  const {
    meta,
    selectedChapterId,
    chapterContent,
    selectChapter,
    saveChapter,
    createChapter,
    removeChapter,
    renameChapterById,
    moveUp,
    moveDown,
    moveChapterTo,
  } = useBook(bookPath);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState('');

  const selectedChapter = useMemo(() => {
    if (!meta || !selectedChapterId) return null;
    const find = (chapters: Chapter[]): Chapter | null => {
      for (const ch of chapters) {
        if (ch.id === selectedChapterId) return ch;
        const found = find(ch.chapters);
        if (found) return found;
      }
      return null;
    };
    return find(meta.chapters);
  }, [meta, selectedChapterId]);

  const handleAddChapter = useCallback((parentId: string | null) => {
    setAddParentId(parentId);
    setAddTitle('');
    setAddDialogOpen(true);
  }, []);

  const handleCreateChapter = async () => {
    if (!addTitle.trim()) return;
    try {
      const chapter = await createChapter(addParentId, addTitle.trim());
      setAddDialogOpen(false);
      setAddTitle('');
      selectChapter(chapter.id);
    } catch (e) {
      console.error('Failed to create chapter:', e);
    }
  };

  const handleSaveContent = useCallback(
    async (markdown: string) => {
      if (!selectedChapterId) return;
      try {
        await saveChapter(selectedChapterId, markdown);
      } catch (e) {
        console.error('Failed to save chapter:', e);
      }
    },
    [selectedChapterId, saveChapter],
  );

  const handleDeleteChapter = useCallback(
    async (id: string) => {
      try {
        await removeChapter(id);
      } catch (e) {
        console.error('Failed to delete chapter:', e);
      }
    },
    [removeChapter],
  );

  const handleRenameChapter = useCallback(
    async (id: string, title: string) => {
      try {
        await renameChapterById(id, title);
      } catch (e) {
        console.error('Failed to rename chapter:', e);
      }
    },
    [renameChapterById],
  );

  const handleMoveChapter = useCallback(
    async (chapterId: string, targetId: string | null, position: 'inner' | 'before' | 'after') => {
      console.log('[BookDetail] handleMoveChapter:', { chapterId, targetId, position });
      try {
        await moveChapterTo(chapterId, targetId, position);
        console.log('[BookDetail] moveChapterTo succeeded');
      } catch (e) {
        console.error('[BookDetail] moveChapterTo failed:', e);
      }
    },
    [moveChapterTo],
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'grey.50',
            borderRight: 1,
            borderColor: 'divider',
          },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={onBack} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={600} noWrap>
            {meta?.title || 'Loading...'}
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
          {meta && (
            <ChapterTree
              chapters={meta.chapters}
              selectedId={selectedChapterId}
              onSelect={selectChapter}
              onAddChild={handleAddChapter}
              onRename={handleRenameChapter}
              onDelete={handleDeleteChapter}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              onMoveChapter={handleMoveChapter}
            />
          )}
        </Box>
      </Drawer>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedChapter ? (
          <ChapterEditor
            key={selectedChapter.id}
            content={chapterContent}
            chapterTitle={selectedChapter.title}
            onContentChange={handleSaveContent}
          />
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
            }}
          >
            <Typography variant="h6">Select a chapter from the sidebar to start editing</Typography>
          </Box>
        )}
      </Box>

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Chapter</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Chapter Title"
            fullWidth
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateChapter()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateChapter} variant="contained" disabled={!addTitle.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
