import { useCallback } from 'react'

import { gitCommit, gitStatus } from '../utils/commands'

/**
 * 只保留提交动作；状态与历史统一由 useRepoState 读取。
 */
export function useBookGit(bookPath: string | null) {
  const commit = useCallback(
    async (message: string) => {
      if (!bookPath) throw new Error('No book selected')
      await gitCommit(bookPath, message)
    },
    [bookPath],
  )

  const autoCommit = useCallback(
    async (message: string) => {
      if (!bookPath) return
      const status = await gitStatus(bookPath)
      if (!status.trim()) return
      await gitCommit(bookPath, message)
    },
    [bookPath],
  )

  return { commit, autoCommit }
}
