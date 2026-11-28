import { useCallback } from 'react'

import {
  gitFetch,
  gitPull,
  gitPush,
  gitRemoteSetUrl,
  gitRemoteUrl,
} from '../utils/commands'

/**
 * 异步 Git 操作只负责启动；完成与状态刷新由 `git:done` 事件驱动。
 */
export function useBookGitRemote(bookPath: string | null) {
  const getRemoteUrl = useCallback(async (): Promise<string | null> => {
    if (!bookPath) return null
    return gitRemoteUrl(bookPath)
  }, [bookPath])

  const setRemoteUrl = useCallback(
    async (url: string): Promise<void> => {
      if (!bookPath) throw new Error('No book selected')
      await gitRemoteSetUrl(bookPath, url)
    },
    [bookPath],
  )

  const fetchRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected')
    await gitFetch(bookPath)
    return 'started'
  }, [bookPath])

  const pullRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected')
    await gitPull(bookPath)
    return 'started'
  }, [bookPath])

  const pushRemote = useCallback(async (): Promise<string> => {
    if (!bookPath) throw new Error('No book selected')
    await gitPush(bookPath)
    return 'started'
  }, [bookPath])

  return { getRemoteUrl, setRemoteUrl, fetchRemote, pullRemote, pushRemote }
}
