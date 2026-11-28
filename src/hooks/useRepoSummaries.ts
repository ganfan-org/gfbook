import { useEffect, useState } from 'react'

import type { RepoSummary } from '../types'
import { getRepoSummaries } from '../utils/commands'

/**
 * 书架首屏渲染后再批量读取仓库状态。
 * 后端在阻塞线程中执行，这里只做一次性批量请求，避免每张卡片单独扫描。
 */
export function useRepoSummaries(bookPaths: string[]) {
  const [summaries, setSummaries] = useState<Record<string, RepoSummary>>({})
  const key = bookPaths.join('\n')

  useEffect(() => {
    if (!key) {
      setSummaries({})
      return
    }
    let cancelled = false
    const paths = key.split('\n')
    const timer = window.setTimeout(() => {
      getRepoSummaries(paths)
        .then(list => {
          if (cancelled) return
          setSummaries(
            Object.fromEntries(list.map(summary => [summary.path, summary])),
          )
        })
        .catch(() => {
          if (!cancelled) setSummaries({})
        })
    }, 80)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [key])

  return summaries
}
