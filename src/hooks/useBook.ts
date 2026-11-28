import { useEffect } from 'react'

import { useBookChapters } from './useBookChapters'
import { useBookGit } from './useBookGit'
import { useBookGitRemote } from './useBookGitRemote'

export function useBook(bookPath: string | null) {
  const chapters = useBookChapters(bookPath)
  const git = useBookGit(bookPath)
  const remote = useBookGitRemote(bookPath, git.refreshGitStatus)

  const { refreshMeta } = chapters
  const { refreshGitStatus } = git

  useEffect(() => {
    if (bookPath) {
      refreshMeta()
      refreshGitStatus()
    }
  }, [bookPath, refreshMeta, refreshGitStatus])

  return {
    ...chapters,
    ...git,
    ...remote,
  }
}
