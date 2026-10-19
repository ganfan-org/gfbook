import { useCallback } from 'react'

import {
  gitRemoteUrl,
  gitRemoteSetUrl,
  gitFetch,
  gitPull,
  gitPush,
  gitAheadBehind,
} from '../utils/commands'

export function useBookGitRemote(
  bookPath: string | null,
  refreshGitStatus: () => Promise<void>,
) {
  const getRemoteUrl = useCallback(async (): Promise<string | null> => {
    if (!bookPath) return null
    return gitRemoteUrl(bookPath)
  }, [bookPath])

  const setRemoteUrlApi = useCallback(
    async (url: string): Promise<void> => {
      if (!bookPath) throw new Error('No book selected')
      await gitRemoteSetUrl(bookPath, url)
    },
    [bookPath],
  )

  const fetchRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected')
    await gitFetch(bookPath)
    await refreshGitStatus()
    return 'started'
  }, [bookPath, refreshGitStatus])

  const pullRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected')
    await gitPull(bookPath)
    await refreshGitStatus()
    return 'started'
  }, [bookPath, refreshGitStatus])

  const pushRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected')
    await gitPush(bookPath)
    await refreshGitStatus()
    return 'started'
  }, [bookPath, refreshGitStatus])

  const getAheadBehind = useCallback(async (): Promise<[number, number]> => {
    if (!bookPath) return [0, 0]
    return gitAheadBehind(bookPath)
  }, [bookPath])

  return {
    getRemoteUrl,
    setRemoteUrl: setRemoteUrlApi,
    fetchRemote,
    pullRemote,
    pushRemote,
    getAheadBehind,
  }
}
