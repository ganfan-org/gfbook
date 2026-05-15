import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoIcon from '@mui/icons-material/Info';
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
    setRemoteUrl: setRemoteUrlApi,
    fetchRemote,
    pullRemote,
    pushRemote,
    getAheadBehind,
    getUserConfig,
    changeUserConfig,
  } = useBook(bookPath);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState('');
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [remoteUrlState, setRemoteUrlState] = useState('');
  const [remoteUrlDraft, setRemoteUrlDraft] = useState('');
  const [syncOutput, setSyncOutput] = useState('');
  const [syncing, setSyncing] = useState(false);
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

  const [infoOpen, setInfoOpen] = useState(false);
  const [infoRemoteUrl, setInfoRemoteUrl] = useState('');
  const [infoAhead, setInfoAhead] = useState(0);
  const [infoBehind, setInfoBehind] = useState(0);
  const [infoSyncing, setInfoSyncing] = useState(false);
  const [infoOutput, setInfoOutput] = useState('');

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
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: 'grey.50', borderRight: 1, borderColor: 'divider', minWidth: 0 }}>
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
          <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
              sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', py: 0.5, px: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: gitStatusText ? 'warning.main' : 'success.main' }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                {gitStatusText ? 'dirty' : 'clean'}
              </Typography>
            </Box>
            <Tooltip title="Book info">
              <IconButton size="small" sx={{ width: 26, height: 26 }} onClick={async () => {
                const url = await getRemoteUrl();
                setInfoRemoteUrl(url || '(not set)');
                const [ahead, behind] = await getAheadBehind();
                setInfoAhead(ahead);
                setInfoBehind(behind);
                setInfoOpen(true);
              }}>
                <InfoIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
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

      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Book Info</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" gutterBottom>Storage</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', mb: 1 }}>
            {bookPath}
          </Typography>
          <Button size="small" startIcon={<FolderOpenIcon />} variant="outlined" onClick={() => revealInFinder(bookPath)}>
            {navigator.platform.includes('Win') ? 'Show in Explorer' : navigator.platform.includes('Mac') ? 'Reveal in Finder' : 'Open Folder'}
          </Button>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>Git Remote</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', mb: 1 }}>
            {infoRemoteUrl}
          </Typography>
          <Box display="flex" gap={1} mb={1}>
            <Typography variant="caption" color={infoAhead > 0 ? 'warning.main' : 'text.secondary'}>
              {infoAhead} ahead
            </Typography>
            <Typography variant="caption" color={infoBehind > 0 ? 'warning.main' : 'text.secondary'}>
              {infoBehind} behind
            </Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Button size="small" variant="outlined" disabled={infoSyncing} onClick={async () => {
              setInfoSyncing(true); setInfoOutput('');
              try { const r = await fetchRemote(); setInfoOutput(r); } catch (e: any) { setInfoOutput(String(e)); }
              const [a, b] = await getAheadBehind(); setInfoAhead(a); setInfoBehind(b);
              setInfoSyncing(false);
            }}>Fetch</Button>
            <Button size="small" variant="outlined" disabled={infoSyncing} onClick={async () => {
              setInfoSyncing(true); setInfoOutput('');
              try { const r = await pullRemote(); setInfoOutput(r); } catch (e: any) { setInfoOutput(String(e)); }
              const [a, b] = await getAheadBehind(); setInfoAhead(a); setInfoBehind(b);
              setInfoSyncing(false);
            }}>Pull</Button>
            <Button size="small" variant="outlined" disabled={infoSyncing} onClick={async () => {
              setInfoSyncing(true); setInfoOutput('');
              try { const r = await pushRemote(); setInfoOutput(r); } catch (e: any) { setInfoOutput(String(e)); }
              setInfoSyncing(false);
            }}>Push</Button>
          </Box>
          {infoOutput && (
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', bgcolor: 'grey.100', p: 1, borderRadius: 1, mt: 1 }}>
              {infoOutput}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={commitDialogOpen} onClose={() => {
        setCommitDialogOpen(false);
        setSyncOutput('');
      }} maxWidth="sm" fullWidth>
        <DialogTitle>Git</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" gutterBottom>Changes</Typography>
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

          <Typography variant="subtitle2" gutterBottom>Author</Typography>
          <Box display="flex" gap={1} mb={2}>
            <TextField size="small" label="Name" placeholder="Your Name"
              value={gitName} onChange={(e) => setGitName(e.target.value)}
              sx={{ flex: 1 }} />
            <TextField size="small" label="Email" placeholder="you@example.com"
              value={gitEmail} onChange={(e) => setGitEmail(e.target.value)}
              sx={{ flex: 1 }} />
            <Button size="small" variant="outlined" sx={{ mt: 0.5, alignSelf: 'flex-end' }}
              onClick={async () => {
                try { await changeUserConfig(gitName, gitEmail); } catch (e) { console.error(e); }
              }}>
              Save
            </Button>
          </Box>

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
            <Button size="small" variant="outlined" disabled={syncing} onClick={async () => {
              setSyncing(true); setSyncOutput('');
              try { setSyncOutput(await fetchRemote()); } catch (e: any) { setSyncOutput(String(e)); }
              setSyncing(false);
            }}>Fetch</Button>
            <Button size="small" variant="outlined" disabled={syncing} onClick={async () => {
              setSyncing(true); setSyncOutput('');
              try { setSyncOutput(await pullRemote()); } catch (e: any) { setSyncOutput(String(e)); }
              setSyncing(false);
            }}>Pull</Button>
            <Button size="small" variant="outlined" disabled={syncing} onClick={async () => {
              setSyncing(true); setSyncOutput('');
              try { setSyncOutput(await pushRemote()); } catch (e: any) { setSyncOutput(String(e)); }
              setSyncing(false);
            }}>Push</Button>
          </Box>

          {syncOutput && (
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', bgcolor: 'grey.100', p: 1, borderRadius: 1, mt: 1 }}>
              {syncOutput}
            </Typography>
          )}
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
