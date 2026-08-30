import { createContext, useContext, useEffect, useState } from 'react'
import { ScriptOnce } from '@tanstack/react-router'

// shadcn's TanStack Start recipe: a `ScriptOnce` applies the stored/system
// theme before hydration (no flash), then React takes over.

type Theme = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'theme'
const DEFAULT_THEME: Theme = 'system'
// Keep in sync with `applyTheme` below.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=='light'&&t!=='dark'&&t!=='system'){t="${DEFAULT_THEME}"}var d=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`

const ThemeContext = createContext<(theme: Theme) => void>(() => {})

// Storage may be blocked (or absent during SSR); fall back to the default.
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  useEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = (next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage blocked: the choice lasts for this page view only.
    }
    setThemeState(next)
  }

  return (
    <ThemeContext value={setTheme}>
      <ScriptOnce>{THEME_SCRIPT}</ScriptOnce>
      {children}
    </ThemeContext>
  )
}

export function useSetTheme() {
  return useContext(ThemeContext)
}
