import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DeleteIcon from '@mui/icons-material/Delete';

import type { Chapter } from '../types';

type DropPos = 'before' | 'after' | 'inner' | null;

interface ChapterTreeProps {
  chapters: Chapter[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveChapter: (chapterId: string, targetId: string | null, position: 'inner' | 'before' | 'after') => void;
}

function ChapterItem(props: {
  chapter: Chapter; depth: number; selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveChapter: (chapterId: string, targetId: string | null, position: 'inner' | 'before' | 'after') => void;
  dragOverId: string | null; dropPos: DropPos;
  onItemMouseDown: (e: React.MouseEvent, id: string) => void;
  onRequestRename: (id: string, title: string) => void;
}) {
  const { chapter, depth, selectedId, onSelect, onAddChild, onRename, onDelete, onMoveUp, onMoveDown, dragOverId, dropPos, onItemMouseDown, onRequestRename } = props;
  const [expanded, setExpanded] = useState(true);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const hasChildren = chapter.chapters.length > 0;

  const isOver = dragOverId === chapter.id;

  const borderStyle = isOver
    ? dropPos === 'before'
      ? { borderTop: '2px solid #1976d2' }
      : dropPos === 'after'
        ? { borderBottom: '2px solid #1976d2' }
        : {}
    : {};

  const bgStyle = isOver && dropPos === 'inner'
    ? { bgcolor: 'primary.light', opacity: 0.15 }
    : {};

  return (
    <Box>
      <Box
        data-chapter-id={chapter.id}
        onMouseDown={(e) => onItemMouseDown(e, chapter.id)}

        sx={{
          pl: 1.5 + depth * 2, pr: 0.5, py: 0.5,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center',
          borderRadius: 1,
          userSelect: 'none',
          bgcolor: selectedId === chapter.id ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
          ...borderStyle, ...bgStyle,
        }}
        onClick={() => onSelect(chapter.id)}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', mr: 0.5, minWidth: 20, cursor: hasChildren ? 'pointer' : 'default' }}
          onClick={(e) => { if (hasChildren) { e.stopPropagation(); setExpanded(!expanded); } }}
        >
          {hasChildren ? (
            <FolderIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          ) : (
            <DescriptionIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          )}
        </Box>

        <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
          {chapter.title}
        </Typography>

        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
          sx={{ opacity: 0.4, '&:hover': { opacity: 1 }, ml: 0.5 }}>
          <MoreVertIcon sx={{ fontSize: 16 }} />
        </IconButton>

        <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)} onClick={(e) => e.stopPropagation()}>
          <MenuItem onClick={() => { setMenuAnchor(null); onAddChild(chapter.id); }}>
            <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>Add sub-chapter
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); onRequestRename(chapter.id, chapter.title); }}>
            <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon>Rename
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); onDelete(chapter.id); }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <Typography color="error" variant="body2">Delete</Typography>
          </MenuItem>
        </Menu>
      </Box>

      {hasChildren && expanded && (
        <Box>
          {chapter.chapters.map((child) => (
            <ChapterItem key={child.id}
              chapter={child} depth={depth + 1}
              selectedId={selectedId} onSelect={onSelect}
              onAddChild={onAddChild} onRename={onRename} onDelete={onDelete}
              onMoveUp={onMoveUp} onMoveDown={onMoveDown} onMoveChapter={props.onMoveChapter}
              dragOverId={dragOverId} dropPos={dropPos}
              onItemMouseDown={onItemMouseDown}
              onRequestRename={onRequestRename}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function ChapterTree({ chapters, selectedId, onSelect, onAddChild, onRename, onDelete, onMoveUp, onMoveDown, onMoveChapter }: ChapterTreeProps) {
  const [renameDialog, setRenameDialog] = useState<{ id: string; title: string } | null>(null);
  const [renameDialogValue, setRenameDialogValue] = useState('');

  const dragState = useRef<{
    sourceId: string;
    startX: number;
    startY: number;
    isDragging: boolean;
    targetId: string | null;
    dropPos: DropPos;
  } | null>(null);

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<DropPos>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    document.body.style.cursor = isDragging ? 'grabbing' : '';
    document.body.style.userSelect = isDragging ? 'none' : '';
  }, [isDragging]);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const ds = dragState.current;
    if (!ds) return;

    if (!ds.isDragging) {
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        dragState.current = { ...ds, isDragging: true };
        setIsDragging(true);
      }
      return;
    }

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) {
      dragState.current = { ...ds, targetId: null, dropPos: null };
      setDragOverId(null);
      setDropPos(null);
      return;
    }

    const chapterItem = (el as HTMLElement).closest('[data-chapter-id]');
    if (!chapterItem) {
      dragState.current = { ...ds, targetId: null, dropPos: null };
      setDragOverId(null);
      setDropPos(null);
      return;
    }

    const targetId = chapterItem.getAttribute('data-chapter-id');
    if (targetId === ds.sourceId) {
      dragState.current = { ...ds, targetId: null, dropPos: null };
      setDragOverId(null);
      setDropPos(null);
      return;
    }

    const rect = chapterItem.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    const pos: DropPos = y < h * 0.25 ? 'before' : y > h * 0.75 ? 'after' : 'inner';

    dragState.current = { ...ds, targetId, dropPos: pos };
    setDragOverId(targetId);
    setDropPos(pos);
  }, []);

  const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
    const ds = dragState.current;
    if (!ds) return;

    dragState.current = null;
    setIsDragging(false);

    if (ds.isDragging) {
      console.log('[Drag] drop:', { sourceId: ds.sourceId, targetId: ds.targetId, pos: ds.dropPos });
      if (ds.sourceId && ds.targetId && ds.sourceId !== ds.targetId) {
        const finalPos: 'inner' | 'before' | 'after' =
          ds.dropPos === 'before' || ds.dropPos === 'after' ? ds.dropPos : 'inner';
        onMoveChapter(ds.sourceId, ds.targetId, finalPos);
      } else if (ds.sourceId && !ds.targetId) {
        onMoveChapter(ds.sourceId, null, 'after');
      }
    }

    setDragOverId(null);
    setDropPos(null);
  }, [onMoveChapter]);

  useEffect(() => {
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleGlobalMouseMove, handleGlobalMouseUp]);

  const handleItemMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return;
    dragState.current = {
      sourceId: id,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
      targetId: null,
      dropPos: null,
    };
  }, []);

  const handleRenameConfirm = () => {
    if (renameDialog && renameDialogValue.trim() && renameDialogValue.trim() !== renameDialog.title) {
      onRename(renameDialog.id, renameDialogValue.trim());
    }
    setRenameDialog(null);
  };

  const renderChapterItems = (chaptersList: Chapter[], depth: number) => {
    return chaptersList.map((chapter) => (
      <ChapterItem key={chapter.id}
        chapter={chapter} depth={depth}
        selectedId={selectedId} onSelect={onSelect}
        onAddChild={onAddChild} onRename={onRename} onDelete={onDelete}
        onMoveUp={onMoveUp} onMoveDown={onMoveDown} onMoveChapter={onMoveChapter}
        dragOverId={dragOverId} dropPos={dropPos}
        onItemMouseDown={handleItemMouseDown}
        onRequestRename={(id, title) => { setRenameDialog({ id, title }); setRenameDialogValue(title); }}
      />
    ));
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} px={1}>
        <Typography variant="subtitle2" color="text.secondary">Chapters</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onAddChild(null)}>Add</Button>
      </Box>

      {chapters.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
          No chapters yet.
        </Typography>
      ) : (
        renderChapterItems(chapters, 0)
      )}

      <Dialog open={!!renameDialog} onClose={() => setRenameDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Chapter</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Chapter Title"
            fullWidth
            value={renameDialogValue}
            onChange={(e) => setRenameDialogValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRenameConfirm(); } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog(null)}>Cancel</Button>
          <Button onClick={handleRenameConfirm} variant="contained" disabled={!renameDialogValue.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
