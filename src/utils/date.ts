import i18next from 'i18next'

const DAY_MS = 24 * 60 * 60 * 1000

function locale(): string {
  return i18next.language === 'zh' ? 'zh-CN' : 'en-US'
}

/** 把时间戳（秒或毫秒）转成本地日期键 `YYYY-MM-DD` */
export function timestampToDateKey(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts
  return toDateKey(new Date(ms))
}

/** 把 Date 转成本地日期键 `YYYY-MM-DD`（不经过 UTC，避免跨时区偏移） */
export function toDateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

function parseDateKey(key: string): Date | null {
  const parts = key.split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts.map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** 日记分组标题：`2026年11月` / `November 2026` */
export function formatDiaryMonth(key: string): string {
  const d = parseDateKey(`${key}-01`)
  if (!d) return key
  if (i18next.language === 'zh') {
    return `${d.getFullYear()}年${d.getMonth() + 1}月`
  }
  return d.toLocaleDateString(locale(), { year: 'numeric', month: 'long' })
}

/** 日记树的年份节点：`2026年` / `2026` */
export function formatDiaryYear(key: string): string {
  return i18next.language === 'zh' ? `${key}年` : key
}

/** 日记树的日期节点：`11月13日 · 周四` / `Nov 13, Thu` */
export function formatDiaryDay(key: string): string {
  const d = parseDateKey(key)
  if (!d) return key
  if (i18next.language === 'zh') {
    const weekday = d.toLocaleDateString('zh-CN', { weekday: 'short' })
    return `${d.getMonth() + 1}月${d.getDate()}日 · ${weekday}`
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })
}

/** 日记条目显示名：自定义标题优先，缺省用「11月13日 · 周四」这类日期标签 */
export function formatDiaryEntryLabel(key: string, title?: string): string {
  if (title && title !== key) return title
  return formatDiaryDay(key)
}

/**
 * 按当前界面语言格式化书籍更新时间：今天 / 昨天 / 短日期（当年省略年份）。
 * 兼容秒级与毫秒级时间戳（< 1e12 视为秒）。
 */
export function formatBookDate(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts
  if (!ms || ms <= 0) return ''
  const d = new Date(ms)
  const diff = Date.now() - d.getTime()
  if (diff < DAY_MS) return i18next.t('date.today')
  if (diff < 2 * DAY_MS) return i18next.t('date.yesterday')
  const locale = i18next.language === 'zh' ? 'zh-CN' : 'en-US'
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
