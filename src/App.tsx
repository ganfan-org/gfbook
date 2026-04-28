import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useState } from 'react';

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
