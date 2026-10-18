// Ganfan Design Tokens — MUI 主题用色值
// 与 src/styles/tokens.css 保持一致（tokens.css 为唯一事实源，改色需两处同步）
// 对齐 gfjournal Brand 阶梯 + Moss 墨绿 + 护眼米绿

export type ThemeMode = 'light' | 'dark'

export interface ColorTokens {
  accent: string
  accentHover: string
  accentText: string
  bgPrimary: string
  bgSecondary: string
  bgHover: string
  bgSelected: string
  textPrimary: string
  textSecondary: string
  borderPrimary: string
  success: string
  warning: string
  error: string
  shadowSm: string
  shadowMd: string
  shadowLg: string
  fontFamilySans: string
}

export const colorTokens: Record<ThemeMode, ColorTokens> = {
  // 护眼米绿：与 Moss 同 HSL 166° 反相，主色用 Brand.darker #B8731A
  light: {
    accent: '#B8731A',
    accentHover: '#8E5814',
    accentText: '#FFFFFF',
    bgPrimary: '#F2F5F2',
    bgSecondary: '#FAFAF7',
    bgHover: 'rgba(0, 0, 0, 0.04)',
    bgSelected: 'rgba(184, 115, 26, 0.10)',
    textPrimary: '#2D3B36',
    textSecondary: '#6B7A73',
    borderPrimary: '#D8DED8',
    success: '#22C55E',
    warning: '#EAB308',
    error: '#EF4444',
    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    shadowMd: '0 4px 12px rgba(0, 0, 0, 0.08)',
    shadowLg: '0 8px 30px rgba(0, 0, 0, 0.12)',
    fontFamilySans:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  // Moss 墨绿：gfjournal 完全统一
  dark: {
    accent: '#F4B040',
    accentHover: '#E89B26',
    accentText: '#0C1A17',
    bgPrimary: '#0C1A17',
    bgSecondary: '#142B26',
    bgHover: 'rgba(244, 176, 64, 0.06)',
    bgSelected: 'rgba(244, 176, 64, 0.15)',
    textPrimary: '#EDEBDD',
    textSecondary: '#A7B6AC',
    borderPrimary: '#1E3D36',
    success: '#4ADE80',
    warning: '#FACC15',
    error: '#F87171',
    shadowSm: 'none',
    shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
    shadowLg: '0 8px 30px rgba(0, 0, 0, 0.5)',
    fontFamilySans:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
}
