import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
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
  Tooltip,
} from '@mui/material';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ChapterEditor from '../components/ChapterEditor';
import ChapterTree from '../components/ChapterTree';
import { useBook } from '../hooks/useBook';
import { revealInFinder } from '../utils/commands';
import type { Chapter } from '../types';

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
    gitStatusText,
    commit,
    autoCommit,
    getRemoteUrl,
    setRemoteUrl:     setRemoteUrlApi,
    fetchRemote,
    pullRemote,
    pushRemote,
    getAheadBehind,
    getUserConfig,
    refreshGitStatus,
  } = useBook(bookPath);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState('');
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [remoteUrlState, setRemoteUrlState] = useState('');
  const [syncingType, setSyncingType] = useState<string | null>(null);
  const [remoteUrlDraft, setRemoteUrlDraft] = useState('');
  const [syncOutput, setSyncOutput] = useState('');
  const [gitName, setGitName] = useState('');
  const [gitEmail, setGitEmail] = useState('');
  const [drawerWidth, setDrawerWidth] = useState(280);
  const resizingRef = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = drawerWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.max(180, Math.min(500, startWidth + ev.clientX - startX));
      setDrawerWidth(newWidth);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [drawerWidth]);



  // Auto-commit every 10 minutes
  useEffect(() => {
    const id = setInterval(() => {
      autoCommit('auto-save');
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [autoCommit]);

  // Auto-commit on chapter switch
  const prevChapterRef = useRef(selectedChapterId);
  useEffect(() => {
    if (prevChapterRef.current && prevChapterRef.current !== selectedChapterId) {
      autoCommit('auto-save before switch');
    }
    prevChapterRef.current = selectedChapterId;
  }, [selectedChapterId, autoCommit]);

  // Auto-commit on unmount (app close / back to shelf)
  useEffect(() => {
    return () => { autoCommit('auto-save'); };
  }, [autoCommit]);

  // Listen for async git operation results
  useEffect(() => {
    const unlisten = listen<{ type: string; ok: boolean; message: string }>('git:done', (event) => {
      setSyncingType(null);
      setSyncOutput(event.payload.message);
      if (event.payload.ok) {
        refreshGitStatus();
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [refreshGitStatus]);

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

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    try {
      await commit(commitMessage.trim());
      setCommitDialogOpen(false);
      setCommitMessage('');
    } catch (e) {
      console.error('Failed to commit:', e);
    }
  }, [commitMessage, commit]);

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
      <Box sx={{ width: drawerWidth, minWidth: 180, maxWidth: 500, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: (t) => t.palette.mode === 'dark' ? 'grey.900' : 'grey.50', borderRight: 1, borderColor: 'divider', minWidth: 0 }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={onBack} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" fontWeight={600} noWrap sx={{ flex: 1 }}>
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
          <Box
            onClick={async () => {
              setCommitMessage('');
              setSyncOutput('');
              const url = await getRemoteUrl();
              setRemoteUrlState(url || '');
              setRemoteUrlDraft(url || '');
              const [name, email] = await getUserConfig();
              setGitName(name);
              setGitEmail(email);
              setCommitDialogOpen(true);
            }}
            sx={{ p: 1, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: gitStatusText ? 'warning.main' : 'success.main' }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', flex: 1 }}>
              {gitStatusText ? 'dirty' : 'clean'}
            </Typography>
            <SettingsIcon sx={{ fontSize: 16, color: 'text.secondary', opacity: 0.6 }} />
          </Box>
        </Box>
        {/* Drag handle */}
        <Box
          onMouseDown={handleResizeStart}
          sx={{
            width: 6,
            cursor: 'col-resize',
            flexShrink: 0,
            bgcolor: 'transparent',
            backgroundClip: 'content-box',
            px: 1,
            mx: '-1px',
            zIndex: 10,
            '&:hover': { bgcolor: 'primary.main', opacity: 0.2 },
            '&:active': { bgcolor: 'primary.main', opacity: 0.35 },
            transition: 'background-color 0.1s',
          }}
        />
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedChapter ? (
          <ChapterEditor
            key={selectedChapter.id}
            bookPath={bookPath}
            content={chapterContent}
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

      <Dialog open={commitDialogOpen} onClose={() => {
        setCommitDialogOpen(false);
        setSyncOutput('');
      }} maxWidth="sm" fullWidth>
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" gutterBottom>Storage</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', mb: 1 }}>
            {bookPath}
          </Typography>
          <Button size="small" startIcon={<FolderOpenIcon />} variant="outlined" onClick={() => revealInFinder(bookPath)}>
            {navigator.platform.includes('Win') ? 'Show in Explorer' : navigator.platform.includes('Mac') ? 'Reveal in Finder' : 'Open Folder'}
          </Button>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>Git Changes</Typography>
          <Typography variant="body2" color="text.secondary" mb={2} sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
            {gitStatusText || 'No changes'}
          </Typography>

          {gitStatusText && (
            <>
              <TextField
                autoFocus
                margin="dense"
                label="Commit Message"
                fullWidth
                multiline
                rows={2}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleCommit();
                  }
                }}
              />
              <Box textAlign="right" mt={1} mb={2}>
                <Button onClick={handleCommit} variant="contained" size="small" disabled={!commitMessage.trim()}>
                  Commit
                </Button>
              </Box>
            </>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>Remote</Typography>
          {remoteUrlState && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontFamily: 'monospace', fontSize: '0.75rem' }}>
              current: {remoteUrlState}
            </Typography>
          )}
          <TextField
            size="small"
            fullWidth
            placeholder="https://github.com/user/repo.git"
            value={remoteUrlDraft}
            onChange={(e) => setRemoteUrlDraft(e.target.value)}
            sx={{ mb: 1 }}
          />
          <Box display="flex" gap={1} mb={1}>
            <Button size="small" variant="outlined" onClick={async () => {
              try {
                const url = await getRemoteUrl();
                setRemoteUrlState(url || '');
                setRemoteUrlDraft(url || '');
              } catch { /* ignore */ }
            }}>Load</Button>
            <Button size="small" variant="outlined" onClick={async () => {
              try {
                await setRemoteUrlApi(remoteUrlDraft);
                setRemoteUrlState(remoteUrlDraft);
              } catch (e) { console.error(e); }
            }}>Set URL</Button>
          </Box>

          <Box display="flex" gap={1} mb={1}>
            <Button size="small" variant="outlined" disabled={!!syncingType} onClick={async () => {
              setSyncingType('fetch'); setSyncOutput('');
              await fetchRemote();
            }}>{syncingType === 'fetch' ? 'Fetching...' : 'Fetch'}</Button>
            <Button size="small" variant="outlined" disabled={!!syncingType} onClick={async () => {
              setSyncingType('pull'); setSyncOutput('');
              await pullRemote();
            }}>{syncingType === 'pull' ? 'Pulling...' : 'Pull'}</Button>
            <Button size="small" variant="outlined" disabled={!!syncingType} onClick={async () => {
              setSyncingType('push'); setSyncOutput('');
              await pushRemote();
            }}>{syncingType === 'push' ? 'Pushing...' : 'Push'}</Button>
          </Box>

          <Box sx={{ bgcolor: 'grey.900', color: '#a8d85a', p: 1.5, borderRadius: 1, mt: 2, minHeight: 60, maxHeight: 150, overflow: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {syncingType ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, border: '2px solid #a8d85a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </Box>
                <span>{syncingType === 'fetch' ? 'Fetching...' : syncingType === 'pull' ? 'Pulling...' : 'Pushing...'}</span>
              </Box>
            ) : syncOutput ? (
              syncOutput
            ) : (
              <span style={{ color: '#666' }}>Ready</span>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCommitDialogOpen(false); setSyncOutput(''); }}>Close</Button>
        </DialogActions>
      </Dialog>

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
