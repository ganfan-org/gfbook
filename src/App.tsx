import { ThemeProvider, CssBaseline } from '@mui/material'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'

import BookDetail from './pages/BookDetail'
import BookShelf from './pages/BookShelf'
import { applyMode, buildTheme } from './theme/theme'
import type { ThemeMode } from './theme/tokens'
import type { BookInfo } from './types'

function readSavedMode(): ThemeMode | null {
  try {
    const saved = localStorage.getItem('gfbook-theme')
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

function systemMode(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [mode, setMode] = useState<ThemeMode>(() => readSavedMode() ?? systemMode())
  const [currentBook, setCurrentBook] = useState<BookInfo | null>(null)
  const [pendingChapterId, setPendingChapterId] = useState<string | null>(null)

  // 未手动选择过主题时跟随系统
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      if (readSavedMode() === null) setMode(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // buildTheme 是纯函数，可安全用于 render；data-theme 副作用放 commit 阶段
  const theme = useMemo(() => buildTheme(mode), [mode])

  useLayoutEffect(() => {
    applyMode(mode)
  }, [mode])

  const toggleTheme = () => {
    setMode((m) => {
      const next: ThemeMode = m === 'light' ? 'dark' : 'light'
      try {
        localStorage.setItem('gfbook-theme', next)
      } catch {}
      return next
    })
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {currentBook ? (
        <BookDetail
          bookInfo={currentBook}
          initialChapterId={pendingChapterId}
          onBack={() => {
            setCurrentBook(null)
            setPendingChapterId(null)
          }}
        />
      ) : (
        <BookShelf
          onOpenBook={(bookInfo, chapterId) => {
            setCurrentBook(bookInfo)
            setPendingChapterId(chapterId ?? null)
          }}
          onToggleTheme={toggleTheme}
          mode={mode}
        />
      )}
    </ThemeProvider>
  )
}

export default App
