import * as React from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const [dark, setDark] = React.useState(() =>
    document.documentElement.classList.contains('dark')
      || window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  return (
    <button
      type="button"
      className="host-icon-button"
      onClick={() => setDark((value) => !value)}
      aria-label={dark ? '切换到浅色主题' : '切换到深色主题'}
      title={dark ? '浅色主题' : '深色主题'}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  )
}
