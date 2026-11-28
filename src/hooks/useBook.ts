import { useEffect } from 'react'

import { useBookChapters } from './useBookChapters'
import { useBookGit } from './useBookGit'
import { useBookGitRemote } from './useBookGitRemote'

export function useBook(bookPath: string | null) {
  const chapters = useBookChapters(bookPath)
  const git = useBookGit(bookPath)
  const remote = useBookGitRemote(bookPath)

  const { refreshMeta } = chapters

  useEffect(() => {
    if (bookPath) {
      refreshMeta()
    }
  }, [bookPath, refreshMeta])

  return {
    ...chapters,
    ...git,
    ...remote,
  }
}
