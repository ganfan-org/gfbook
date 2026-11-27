import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useCallback, useEffect, useRef, useState } from 'react'

const START_DELAY_MS = 15_000
const CHECK_RETRY_DELAYS = [30_000, 5 * 60_000]
const DOWNLOAD_RETRY_DELAYS = [10_000, 60_000]

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function downloadWithRetry(update: Update): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await update.download(undefined, { timeout: 120_000 })
      return
    } catch (error) {
      if (attempt >= DOWNLOAD_RETRY_DELAYS.length) throw error
      await delay(DOWNLOAD_RETRY_DELAYS[attempt])
    }
  }
}

/**
 * 启动后静默检查并下载更新，下载完成才提示重启。
 * 检查/下载失败时按退避静默重试，最终放弃，不打扰日常使用。
 */
export function useSilentUpdater() {
  const [ready, setReady] = useState(false)
  const updateRef = useRef<Update | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD || !('__TAURI_INTERNALS__' in window)) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async (attempt: number) => {
      let update: Update | null = null
      try {
        update = await check({ timeout: 30_000 })
        if (!update) return
        await downloadWithRetry(update)
        if (cancelled) {
          await update.close().catch(() => {})
          return
        }
        updateRef.current = update
        setReady(true)
      } catch {
        if (update) await update.close().catch(() => {})
        if (cancelled || attempt >= CHECK_RETRY_DELAYS.length) return
        timer = setTimeout(
          () => void run(attempt + 1),
          CHECK_RETRY_DELAYS[attempt],
        )
      }
    }

    timer = setTimeout(() => void run(0), START_DELAY_MS)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      void updateRef.current?.close().catch(() => {})
      updateRef.current = null
    }
  }, [])

  const install = useCallback(async () => {
    const update = updateRef.current
    if (!update) return
    try {
      await update.install()
      await relaunch()
    } catch {
      // 安装失败不弹窗，下次启动再检查
      setReady(false)
      updateRef.current = null
      void update.close().catch(() => {})
    }
  }, [])

  const dismiss = useCallback(() => setReady(false), [])

  return { ready, install, dismiss }
}
