import { useCallback, useEffect, useState } from 'react'

import type { BackendInfo } from '../types'
import {
  EXPECTED_BACKEND_API,
  formatInvokeError,
  getBackendInfo,
} from '../utils/commands'

export type BackendHealthState =
  | 'checking'
  | 'ok'
  | 'stale'
  | 'missing'
  | 'error'

export interface BackendHealth {
  state: BackendHealthState
  info: BackendInfo | null
  error: string | null
  checking: boolean
  recheck: () => void
}

/**
 * 启动时校验后端 API 版本。
 * 旧二进制连 get_backend_info 都没有，会得到 “Command ... not found”，
 * 因此任何失败都会被视为需要用户处理的版本不匹配，而不是静默继续。
 */
export function useBackendHealth(): BackendHealth {
  const [state, setState] = useState<BackendHealthState>('checking')
  const [info, setInfo] = useState<BackendInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      const result = await getBackendInfo()
      setInfo(result)
      setError(null)
      setState(result.api_level < EXPECTED_BACKEND_API ? 'stale' : 'ok')
    } catch (e) {
      const message = formatInvokeError(e)
      setInfo(null)
      setError(message)
      setState(/not found/i.test(message) ? 'missing' : 'error')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  return { state, info, error, checking, recheck: check }
}
