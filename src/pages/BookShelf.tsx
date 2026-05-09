import AddIcon from '@mui/icons-material/Add';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SyncIcon from '@mui/icons-material/Sync';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  Card,
  CardMedia,
  CardContent,
  CardActionArea,
  Switch,
  FormControlLabel,
  Alert,
  Tooltip,
} from '@mui/material';
import { open } from '@tauri-apps/plugin-dialog';
import { useState, useEffect } from 'react';

import { useBooks } from '../hooks/useBooks';
import type { BookInfo, SyncConfig } from '../types';

interface BookShelfProps {
  onOpenBook: (bookPath: string) => void;
}

const COVER_COLORS = [
  ['#4A90D9', '#357ABD'],
  ['#D94A4A', '#BD3535'],
  ['#5CB85C', '#449D44'],
  ['#F0AD4E', '#EC971F'],
  ['#9B59B6', '#8E44AD'],
  ['#1ABC9C', '#16A085'],
  ['#E67E22', '#D35400'],
  ['#3498DB', '#2980B9'],
  ['#E74C3C', '#C0392B'],
  ['#2ECC71', '#27AE60'],
  ['#F39C12', '#D68910'],
  ['#2980B9', '#1A5276'],
  ['#8E44AD', '#6C3483'],
  ['#D35400', '#A04000'],
  ['#16A085', '#0E6655'],
  ['#27AE60', '#1E8449'],
];

function hashColor(title: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % COVER_COLORS.length;
  return COVER_COLORS[idx] as [string, string];
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 24 * 60 * 60 * 1000) return 'Today';
  if (diff < 48 * 60 * 60 * 1000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function BookCover({ title, onClick, onDelete, onRename }: { title: string; onClick: () => void; onDelete: () => void; onRename: () => void }) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [primary, secondary] = hashColor(title);

  const initials = title
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  return (
    <Card
      sx={{
        width: 180,
        flexShrink: 0,
        borderRadius: 2,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        },
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <CardActionArea onClick={onClick}>
          <CardMedia
            sx={{
              height: 240,
              background: `linear-gradient(135deg, ${primary}, ${secondary})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              p: 2,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                color: 'rgba(255,255,255,0.15)',
                fontSize: '3rem',
                fontWeight: 800,
                letterSpacing: 2,
                lineHeight: 1,
                mb: 1,
              }}
            >
              {initials}
            </Typography>
          </CardMedia>
        </CardActionArea>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor(e.currentTarget);
          }}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            bgcolor: 'rgba(255,255,255,0.9)',
            '&:hover': { bgcolor: 'white' },
            width: 28,
            height: 28,
          }}
        >
          <MoreVertIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
          <MenuItem onClick={() => { setMenuAnchor(null); onRename(); }}>
            <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon>
            <Typography variant="body2">Rename</Typography>
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); onDelete(); }}>
            <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
            <Typography variant="body2">Delete</Typography>
          </MenuItem>
        </Menu>
      </Box>
      <CardContent sx={{ px: 1.5, py: 1, '&:last-child': { pb: 1 } }}>
        <Typography variant="body2" fontWeight={600} noWrap sx={{ mb: 0.25 }}>
          {title}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function BookShelf({ onOpenBook }: BookShelfProps) {
  const { books, loading, createBook, removeBook, changeBookName, importExternalBook, getSyncConfig, updateSyncConfig, syncNow } = useBooks();
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<BookInfo | null>(null);
  const [renameTarget, setRenameTarget] = useState<BookInfo | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncPath, setSyncPath] = useState('');
  const [savedSyncConfig, setSavedSyncConfig] = useState<SyncConfig | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (syncDialogOpen) {
      (async () => {
        const config = await getSyncConfig();
        setSavedSyncConfig(config);
        if (config) {
          setSyncEnabled(config.enabled);
          setSyncPath(config.path);
        } else {
          setSyncEnabled(false);
          setSyncPath('');
        }
        setSyncMsg(null);
      })();
    }
  }, [syncDialogOpen, getSyncConfig]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      await createBook(newTitle.trim());
      setNewDialogOpen(false);
      setNewTitle('');
    } catch (e) {
      console.error('Failed to create book:', e);
    }
  };

  const handleImport = async () => {
    console.log('[BookShelf] Open Book clicked');
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select book folder',
    });
    console.log('[BookShelf] dialog returned:', selected);
    if (selected) {
      try {
        const result = await importExternalBook(selected);
        console.log('[BookShelf] import success:', result);
      } catch (e) {
        console.error('[BookShelf] Failed to import book:', e);
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await removeBook(deleteConfirm.path);
      setDeleteConfirm(null);
    } catch (e) {
      console.error('Failed to delete book:', e);
    }
  };

  const handleRenameOpen = (book: BookInfo) => {
    setRenameTitle(book.title);
    setRenameTarget(book);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameTitle.trim()) return;
    try {
      await changeBookName(renameTarget.path, renameTitle.trim());
      setRenameTarget(null);
      setRenameTitle('');
    } catch (e) {
      console.error('Failed to rename book:', e);
    }
  };

  const handleSyncToggle = async (enabled: boolean) => {
    setSyncEnabled(enabled);
    try {
      const config = await updateSyncConfig(enabled, syncPath);
      setSavedSyncConfig(config);
    } catch (e) {
      console.error('Failed to update sync config:', e);
    }
  };

  const handleSyncPathChange = async (path: string) => {
    setSyncPath(path);
    try {
      const config = await updateSyncConfig(syncEnabled, path);
      setSavedSyncConfig(config);
    } catch (e) {
      console.error('Failed to update sync config:', e);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: 4, py: 3 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={4}>
        <Typography variant="h4" fontWeight={700}>
          Library
        </Typography>
        <Box display="flex" gap={1} alignItems="center">
          <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={handleImport}>
            Open Book
          </Button>
          <Button variant="outlined" startIcon={<CloudSyncIcon />} onClick={() => setSyncDialogOpen(true)}>
            Sync
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewDialogOpen(true)}>
            New Book
          </Button>
        </Box>
      </Box>

      {books.length === 0 ? (
        <Box textAlign="center" py={12}>
          <Typography variant="h6" color="text.secondary" mb={1}>
            Your library is empty
          </Typography>
          <Typography color="text.secondary" mb={3}>
            Create your first book or import an existing one to get started
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewDialogOpen(true)}>
            Create Your First Book
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            justifyContent: 'flex-start',
          }}
        >
          {books.map((book) => (
            <Box key={book.path}>
              <BookCover
                title={book.title}
                onClick={() => onOpenBook(book.path)}
                onDelete={() => setDeleteConfirm(book)}
                onRename={() => handleRenameOpen(book)}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, pl: 0.5 }}>
                {formatDate(book.updated_time)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Dialog open={newDialogOpen} onClose={() => setNewDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Book</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Book Title"
            fullWidth
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained" disabled={!newTitle.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!renameTarget} onClose={() => setRenameTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Book</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Book Title"
            fullWidth
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button onClick={handleRename} variant="contained" disabled={!renameTitle.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Book</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteConfirm?.title}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={syncDialogOpen} onClose={() => setSyncDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <CloudSyncIcon /> Sync Config
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {syncMsg && (
              <Alert severity={syncMsg.type}>{syncMsg.text}</Alert>
            )}

            <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
              On macOS, set the path to an iCloud Drive file for automatic cross-device sync.
              Config is auto-synced when you add/remove books.
            </Alert>

            <FormControlLabel
              control={
                <Switch
                  checked={syncEnabled}
                  onChange={(e) => handleSyncToggle(e.target.checked)}
                />
              }
              label="Enable iCloud / File Sync"
            />

            <TextField
              label="Sync File Path"
              placeholder={
                '~/Library/Mobile Documents/com~apple~CloudDocs/gtbook-config.json'
              }
              helperText="Full path to the config file in your sync directory"
              fullWidth
              size="small"
              value={syncPath}
              disabled={!syncEnabled}
              onChange={(e) => handleSyncPathChange(e.target.value)}
            />

            {savedSyncConfig && savedSyncConfig.enabled && (
              <Typography variant="caption" color="text.secondary">
                Path: {savedSyncConfig.path}
              </Typography>
            )}

            <Button
              variant="outlined"
              startIcon={<SyncIcon />}
              disabled={syncLoading || !syncEnabled || !syncPath.trim()}
              onClick={async () => {
                setSyncLoading(true);
                setSyncMsg(null);
                try {
                  const result = await syncNow();
                  setSyncMsg({ type: 'success', text: result });
                } catch (e: unknown) {
                  setSyncMsg({ type: 'error', text: String(e) });
                } finally {
                  setSyncLoading(false);
                }
              }}
            >
              Sync Now (Pull from Remote)
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
