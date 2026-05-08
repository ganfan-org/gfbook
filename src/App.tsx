import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import BookDetail from './pages/BookDetail';
import BookShelf from './pages/BookShelf';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  const [currentBookPath, setCurrentBookPath] = useState<string | null>(null);
  const bookPathRef = useRef(currentBookPath);
  bookPathRef.current = currentBookPath;

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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {currentBookPath ? (
        <BookDetail
          bookPath={currentBookPath}
          onBack={() => setCurrentBookPath(null)}
        />
      ) : (
        <BookShelf onOpenBook={(path) => setCurrentBookPath(path)} />
      )}
    </ThemeProvider>
  );
}

export default App;
