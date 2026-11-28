import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useCallback, useEffect, useRef, useState } from 'react'

const START_DELAY_MS = 15_000
const CHECK_RETRY_DELAYS = [30_000, 5 * 60_000]
const DOWNLOAD_RETRY_DELAYS = [10_000, 60_000]
const CHECK_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 120_000

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdaterApi {
  status: UpdaterStatus
  error: string | null
  checkNow: () => Promise<void>
  install: () => Promise<void>
  dismiss: () => void
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const text = String(error)
  return text && text !== '[object Object]' ? text : ''
}

/** 静默流程传入退避重试；手动检查传入空数组，失败立即上报。 */
async function downloadUpdate(
  update: Update,
  retryDelays: number[],
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await update.download(undefined, { timeout: DOWNLOAD_TIMEOUT_MS })
      return
    } catch (error) {
      if (attempt >= retryDelays.length) throw error
      await delay(retryDelays[attempt])
    }
  }
}

/**
 * 统一的更新流程：
 * - 启动后静默检查并下载更新（仅生产环境），失败按退避重试、最终安静放弃。
 * - 手动检查不受生产环境限制，立即执行一次，失败把原因暴露给界面。
 * 两者共用同一套 check / download / install 逻辑。
 */
export function useUpdater(): UpdaterApi {
  const [status, setStatus] = useState<UpdaterStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const updateRef = useRef<Update | null>(null)
  const manualRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD || !isTauriRuntime()) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async (attempt: number) => {
      // 用户已手动触发检查时，静默流程让路，避免两路同时下载
      if (manualRef.current) return

      let update: Update | null = null
      try {
        update = await check({ timeout: CHECK_TIMEOUT_MS })
        if (!update) return
        if (cancelled) {
          await update.close().catch(() => {})
          return
        }
        await downloadUpdate(update, DOWNLOAD_RETRY_DELAYS)
        if (cancelled) {
          await update.close().catch(() => {})
          return
        }
        updateRef.current = update
        if (mountedRef.current) setStatus('ready')
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

  const checkNow = useCallback(async () => {
    if (manualRef.current) return

    if (!isTauriRuntime()) {
      setStatus('error')
      setError(null)
      return
    }

    // 已下载完成时直接复用，避免重复下载
    if (updateRef.current) {
      setStatus('ready')
      return
    }

    manualRef.current = true
    setError(null)
    setStatus('checking')

    let update: Update | null = null
    try {
      update = await check({ timeout: CHECK_TIMEOUT_MS })
      if (!update) {
        if (mountedRef.current) setStatus('up-to-date')
        return
      }
      if (mountedRef.current) setStatus('downloading')
      // 手动检查只尝试一次，失败立刻把错误交给界面
      await downloadUpdate(update, [])
      if (!mountedRef.current) {
        await update.close().catch(() => {})
        return
      }
      updateRef.current = update
      setStatus('ready')
    } catch (e) {
      if (update) await update.close().catch(() => {})
      if (mountedRef.current) {
        setStatus('error')
        setError(describeError(e))
      }
    } finally {
      manualRef.current = false
    }
  }, [])

  const install = useCallback(async () => {
    const update = updateRef.current
    if (!update) return
    try {
      await update.install()
      await relaunch()
    } catch (e) {
      updateRef.current = null
      void update.close().catch(() => {})
      if (mountedRef.current) {
        setStatus('error')
        setError(describeError(e))
      }
    }
  }, [])

  const dismiss = useCallback(() => {
    setStatus((current) => (current === 'ready' ? 'idle' : current))
  }, [])

  return { status, error, checkNow, install, dismiss }
}
