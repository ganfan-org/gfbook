import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { open } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';

import { useBooks } from '../hooks/useBooks';
import type { BookInfo } from '../types';

interface BookShelfProps {
  onOpenBook: (bookPath: string) => void;
}

export default function BookShelf({ onOpenBook }: BookShelfProps) {
  const { books, loading, createBook, removeBook, importExternalBook } = useBooks();
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<BookInfo | null>(null);

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
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select book folder',
    });
    if (selected) {
      try {
        await importExternalBook(selected);
      } catch (e) {
        console.error('Failed to import book:', e);
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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 4 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={4}>
        <Box display="flex" alignItems="center" gap={1}>
          <LibraryBooksIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight="bold">
            GTBook
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={handleImport}>
            Import
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewDialogOpen(true)}>
            New Book
          </Button>
        </Box>
      </Box>

      {books.length === 0 ? (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" mb={2}>
            No books yet
          </Typography>
          <Typography color="text.secondary" mb={3}>
            Create a new book or import an existing one
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewDialogOpen(true)}>
            Create Your First Book
          </Button>
        </Box>
      ) : (
        <Box>
          {books.map((book) => (
            <Card
              key={book.path}
              sx={{ mb: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={() => onOpenBook(book.path)}
            >
              <CardContent sx={{ pb: 1 }}>
                <Typography variant="h6">{book.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(book.updated_time).toLocaleDateString()}
                </Typography>
              </CardContent>
              <CardActions sx={{ pt: 0 }}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(book);
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
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
