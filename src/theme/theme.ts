import { createTheme } from '@mui/material'
import type { Shadows, Theme } from '@mui/material/styles'

import { colorTokens, type ThemeMode } from './tokens'

/**
 * 同步 data-theme 到 <html>，ChapterEditor.css 等原生 CSS 依赖此属性切换变量。
 * 只能在 commit 阶段调用（useLayoutEffect），render 阶段禁止副作用。
 */
export function applyMode(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode)
}

/* MUI 需要 25 级阴影数组；映射到 token 的 3 档：
   1-2 → sm（卡片、按钮），3-8 → md（菜单、悬浮层），9-24 → lg（弹窗） */
function buildShadows(sm: string, md: string, lg: string): Shadows {
  return [
    'none',
    sm, sm,
    md, md, md, md, md, md,
    lg, lg, lg, lg, lg, lg, lg, lg,
    lg, lg, lg, lg, lg, lg, lg, lg,
  ] as Shadows
}

/** 纯函数：从 tokens.ts（与 tokens.css 一致）构建 MUI 主题，可安全用于 render。 */
export function buildTheme(mode: ThemeMode): Theme {
  const c = colorTokens[mode]

  return createTheme({
    palette: {
      mode,
      primary: { main: c.accent, dark: c.accentHover, contrastText: c.accentText },
      background: { default: c.bgPrimary, paper: c.bgSecondary },
      text: { primary: c.textPrimary, secondary: c.textSecondary },
      divider: c.borderPrimary,
      success: { main: c.success },
      warning: { main: c.warning },
      error: { main: c.error },
      action: { hover: c.bgHover, selected: c.bgSelected },
    },
    typography: {
      fontFamily: c.fontFamilySans,
    },
    shape: { borderRadius: 8 }, // 对应 --radius-md
    shadows: buildShadows(c.shadowSm, c.shadowMd, c.shadowLg),
    components: {
      MuiButton: {
        styleOverrides: { root: { textTransform: 'none' } },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 'var(--radius-lg)' } },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-elevated)',
          },
        },
      },
    },
  })
}
