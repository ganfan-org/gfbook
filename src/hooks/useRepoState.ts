import { useCallback, useEffect, useRef, useState } from 'react'

import type { RepoState } from '../types'
import { formatInvokeError, getRepoState } from '../utils/commands'

/**
 * 每本书唯一的仓库状态来源：挂载、窗口聚焦、Git 操作后刷新。
 * 写盘后通过 scheduleRefresh 做一次节流刷新，避免每次自动保存都执行 git status。
 */
export function useRepoState(bookPath: string | null) {
  const [repoState, setRepoState] = useState<RepoState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async (): Promise<RepoState | null> => {
    if (!bookPath) {
      setRepoState(null)
      return null
    }
    const request = requestRef.current + 1
    requestRef.current = request
    setLoading(true)
    try {
      const state = await getRepoState(bookPath)
      if (request === requestRef.current) {
        setRepoState(state)
        setError(null)
      }
      return state
    } catch (e) {
      if (request === requestRef.current) {
        setError(formatInvokeError(e))
      }
      return null
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [bookPath])

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void refresh()
    }, 1500)
  }, [refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return { repoState, loading, error, refresh, scheduleRefresh }
}
