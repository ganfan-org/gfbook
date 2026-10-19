import { useEffect } from 'react'

import { useBookChapters } from './useBookChapters'
import { useBookGit } from './useBookGit'
import { useBookGitRemote } from './useBookGitRemote'

export function useBook(bookPath: string | null) {
  const chapters = useBookChapters(bookPath)
  const git = useBookGit(bookPath)
  const remote = useBookGitRemote(bookPath, git.refreshGitStatus)

  useEffect(() => {
    if (bookPath) {
      chapters.refreshMeta()
      git.refreshGitStatus()
    }
  }, [bookPath, chapters.refreshMeta, git.refreshGitStatus])

  return {
    ...chapters,
    ...git,
    ...remote,
  }
}
