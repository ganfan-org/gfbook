import { useState, useCallback } from 'react'
import type { CommitInfo } from '../types'
import {
  gitStatus,
  gitCommit,
  gitLog,
  gitUserConfig,
  gitSetUserConfig,
  gitGetProxy,
  gitSetProxy,
} from '../utils/commands'

export function useBookGit(bookPath: string | null) {
  const [gitStatusText, setGitStatusText] = useState('')
  const [commits, setCommits] = useState<CommitInfo[]>([])

  const refreshGitStatus = useCallback(async () => {
    if (!bookPath) return
    try {
      const status = await gitStatus(bookPath)
      setGitStatusText(status)
      const log = await gitLog(bookPath)
      setCommits(log)
    } catch {
      // git not available
    }
  }, [bookPath])

  const commit = useCallback(
    async (message: string) => {
      if (!bookPath) throw new Error('No book selected')
      await gitCommit(bookPath, message)
      await refreshGitStatus()
    },
    [bookPath, refreshGitStatus],
  )

  const autoCommit = useCallback(
    async (message: string) => {
      if (!bookPath) return
      const status = await gitStatus(bookPath)
      if (!status.trim()) return
      await gitCommit(bookPath, message)
      await refreshGitStatus()
    },
    [bookPath, refreshGitStatus],
  )

  const getUserConfig = useCallback(async (): Promise<[string, string]> => {
    if (!bookPath) return ['', '']
    return gitUserConfig(bookPath)
  }, [bookPath])

  const changeUserConfig = useCallback(
    async (name: string, email: string): Promise<void> => {
      if (!bookPath) throw new Error('No book selected')
      await gitSetUserConfig(bookPath, name, email)
    },
    [bookPath],
  )

  const getProxy = useCallback(async (): Promise<string> => {
    if (!bookPath) return ''
    return gitGetProxy(bookPath)
  }, [bookPath])

  const setProxy = useCallback(
    async (proxy: string): Promise<void> => {
      if (!bookPath) throw new Error('No book selected')
      await gitSetProxy(bookPath, proxy)
    },
    [bookPath],
  )

  return {
    gitStatusText,
    commits,
    refreshGitStatus,
    commit,
    autoCommit,
    getUserConfig,
    changeUserConfig,
    getProxy,
    setProxy,
  }
}
