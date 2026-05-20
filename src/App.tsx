import { ThemeProvider, createTheme, CssBaseline, useMediaQuery } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import BookDetail from './pages/BookDetail';
import BookShelf from './pages/BookShelf';

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    background: { default: '#f5f5f5' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#90caf9' },
    background: { default: '#121212' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [currentBookPath, setCurrentBookPath] = useState<string | null>(null);
  const bookPathRef = useRef(currentBookPath);
  bookPathRef.current = currentBookPath;

  useEffect(() => {
    try {
      const saved = localStorage.getItem('gtbook-theme');
      if (saved === 'light' || saved === 'dark') {
        setMode(saved);
        return;
      }
    } catch {}
    setMode(prefersDark ? 'dark' : 'light');
  }, [prefersDark]);

  const toggleTheme = () => {
    setMode((m) => {
      const next = m === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('gtbook-theme', next); } catch {}
      return next;
    });
  };

  // Auto-commit on app close
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      const path = bookPathRef.current;
      if (!path) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const status: string = await invoke('git_status', { bookPath: path });
        if (status.trim()) {
          await invoke('git_commit', { bookPath: path, message: 'auto-save before close' });
        }
      } catch (e) {
        console.error('Auto-commit on close failed:', e);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <ThemeProvider theme={mode === 'dark' ? darkTheme : lightTheme}>
      <CssBaseline />
      {currentBookPath ? (
        <BookDetail
          bookPath={currentBookPath}
          onBack={() => setCurrentBookPath(null)}
        />
      ) : (
        <BookShelf
          onOpenBook={(path) => setCurrentBookPath(path)}
          onToggleTheme={toggleTheme}
          mode={mode}
        />
      )}
    </ThemeProvider>
  );
}

export default App;
