import { useContext } from 'react'
import { ThemeContext, type ThemeContextValue } from './context'

/** 读取 / 切换当前主题，必须在 <ThemeProvider> 内使用。 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme 必须在 <ThemeProvider> 内部使用')
  }
  return context
}
