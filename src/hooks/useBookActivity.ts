import { useCallback, useEffect, useState } from 'react'

import type { ActivityItem } from '../types'
import { formatInvokeError, getBookActivity } from '../utils/commands'

/** 书详情设置弹窗打开时才加载，避免日常编辑产生额外 IO。 */
export function useBookActivity(bookPath: string | null, enabled: boolean) {
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!bookPath) {
      setActivity([])
      return
    }
    setLoading(true)
    try {
      const items = await getBookActivity(bookPath, 100)
      setActivity(items)
      setError(null)
    } catch (e) {
      setError(formatInvokeError(e))
    } finally {
      setLoading(false)
    }
  }, [bookPath])

  useEffect(() => {
    if (enabled) void refresh()
  }, [enabled, refresh])

  return { activity, loading, error, refresh }
}
