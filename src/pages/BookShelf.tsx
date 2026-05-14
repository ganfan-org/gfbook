import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MoreVertIcon from '@mui/icons-material/MoreVert';
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
} from '@mui/material';
import { open } from '@tauri-apps/plugin-dialog';
import { useState, useEffect } from 'react';
import { getBooksDir, pathExists } from '../utils/commands';
import { useBooks } from '../hooks/useBooks';
import type { BookInfo } from '../types';

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
  const { books, loading, createBook, removeBook, changeBookName, importExternalBook } = useBooks();
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState('');
  const [newPathExists, setNewPathExists] = useState(false);
  const [newParentDir, setNewParentDir] = useState('');

  const INVALID_FOLDER_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
  const INVALID_FOLDER_NAMES = ['', '.', '..', 'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

  function validateFolderName(name: string): string {
    if (!name.trim()) return 'Folder name is required';
    if (INVALID_FOLDER_CHARS.test(name)) return 'Folder name cannot contain: < > : " / \\ | ? *';
    if (name.startsWith('.') || name.endsWith('.')) return 'Folder name cannot start or end with a dot';
    if (name.endsWith(' ') || name.endsWith('.')) return 'Folder name cannot end with space or dot';
    if (INVALID_FOLDER_NAMES.includes(name.toUpperCase())) return `"${name}" is not allowed as a folder name`;
    if (name.length > 255) return 'Folder name is too long (max 255 characters)';
    return '';
  }
  const [deleteConfirm, setDeleteConfirm] = useState<BookInfo | null>(null);
  const [renameTarget, setRenameTarget] = useState<BookInfo | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const bookDir = `${newParentDir}/${newFolderName}`;
      await createBook(newTitle.trim(), bookDir);
      setNewDialogOpen(false);
      setNewTitle('');
    } catch (e) {
      console.error('Failed to create book:', e);
    }
  };

  useEffect(() => {
    if (newDialogOpen) {
      getBooksDir().then((dir) => {
        setNewParentDir(dir);
        setNewFolderName('');
        setNewTitle('');
        setNewPathExists(false);
      });
    }
  }, [newDialogOpen]);

  // Check if the target path already exists
  useEffect(() => {
    if (!newFolderName.trim() || !newParentDir.trim()) return;
    const fullPath = `${newParentDir}/${newFolderName}`;
    pathExists(fullPath).then(setNewPathExists);
  }, [newFolderName, newParentDir]);

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

      <Dialog open={newDialogOpen} onClose={() => setNewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Book</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Book Title"
            fullWidth
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value);
              // Auto-generate folder name from title
              let slug = e.target.value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
              slug = slug.replace(INVALID_FOLDER_CHARS, '');
              setNewFolderName(slug);
              setNewFolderError(validateFolderName(slug));
            }}
          />
          <TextField
            margin="dense"
            label="Folder Name"
            fullWidth
            value={newFolderName}
            error={!!newFolderError || newPathExists}
            helperText={newPathExists ? 'This path already exists' : (newFolderError || 'Folder name on disk')}
            onChange={(e) => {
              const val = e.target.value;
              setNewFolderName(val);
              setNewFolderError(validateFolderName(val));
              setNewPathExists(false);
            }}
            sx={{ mt: 1 }}
          />
          <TextField
            margin="dense"
            label="Location"
            fullWidth
            size="small"
            value={newParentDir}
            onChange={(e) => setNewParentDir(e.target.value)}
            sx={{ mt: 1 }}
            InputProps={{
              endAdornment: (
                <Button size="small" sx={{ minWidth: 'auto', textTransform: 'none' }}
                  onClick={async () => {
                    const sel = await open({ directory: true, multiple: false, title: 'Select location' });
                    if (sel) setNewParentDir(sel);
                  }}>
                  Browse
                </Button>
              ),
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Will be created at: {newParentDir}/{newFolderName}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained" disabled={!newTitle.trim() || !newFolderName.trim() || !!newFolderError || newPathExists}>
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
    </Box>
  );
}
