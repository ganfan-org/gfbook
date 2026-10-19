import i18next from 'i18next'

const DAY_MS = 24 * 60 * 60 * 1000

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
