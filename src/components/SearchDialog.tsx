import SearchIcon from '@mui/icons-material/Search'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useRef, useState } from 'react'
import type { SearchMatch, SearchProgressEvent } from '../utils/commands'
import { startSearch } from '../utils/commands'

interface SearchResult {
  book_path: string
  book_title: string
  chapter_id: string
  chapter_title: string
  matches: SearchMatch[]
}

interface SearchDialogProps {
  open: boolean
  onClose: () => void
  bookPaths: string[]
  onSelectChapter: (bookPath: string, chapterId: string) => void
}

export default function SearchDialog({
  open,
  onClose,
  bookPaths,
  onSelectChapter,
}: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [done, setDone] = useState(true)
  const searchIdRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const onEntered = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = async (q: string) => {
    // Cleanup previous listeners
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    if (!q.trim()) {
      setResults([])
      setDone(true)
      return
    }
    setResults([])
    setDone(false)
    const searchId = ++searchIdRef.current

    const unlistenProgress = await listen<SearchProgressEvent>(
      'search:progress',
      (event) => {
        if (searchId !== searchIdRef.current) return
        setResults((prev) => [...prev, event.payload])
      },
    )

    const unlistenDone = await listen<void>('search:done', () => {
      if (searchId !== searchIdRef.current) return
      setDone(true)
    })

    cleanupRef.current = () => {
      unlistenProgress()
      unlistenDone()
    }

    startSearch(bookPaths, q.trim())
  }

  const handleQueryChange = (q: string) => {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(q), 300)
  }

  const handleClose = () => {
    if (cleanupRef.current) cleanupRef.current()
    cleanupRef.current = null
    setQuery('')
    setResults([])
    setDone(true)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ transition: { onEntered } }}
    >
      <DialogTitle sx={{ pb: 0 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          placeholder="Search full text..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          variant="standard"
          slotProps={{
            input: {
              startAdornment: (
                <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
              ),
            },
          }}
        />
      </DialogTitle>
      <DialogContent>
        {!done && (
          <Typography variant="caption" color="text.secondary">
            Searching... ({results.length} chapters matched)
          </Typography>
        )}
        {done && query.trim() && results.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No results
          </Typography>
        )}
        {results.length > 0 && (
          <Box>
            {results.map((r) => (
              <Box
                key={`${r.book_path}-${r.chapter_id}`}
                sx={{
                  py: 0.5,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => {
                  handleClose()
                  onSelectChapter(r.book_path, r.chapter_id)
                }}
              >
                <Typography variant="body2" fontWeight={600} noWrap>
                  {r.book_title} — {r.chapter_title}
                </Typography>
                {r.matches.slice(0, 3).map((m, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{
                      display: 'block',
                      pl: 1,
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: '0.7rem',
                    }}
                  >
                    Ln {m.line}: {m.text}
                  </Typography>
                ))}
                {r.matches.length > 3 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ pl: 1 }}
                  >
                    ... +{r.matches.length - 3} more
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
