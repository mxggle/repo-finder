import type { ReactNode } from 'react'
import { MonitorIcon, MoonIcon, SunIcon } from '../shared/ui/icons'
import { useTheme, type ThemePreference } from './theme'

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
  { value: 'system', label: 'System', icon: <MonitorIcon /> },
]

/** A compact segmented control; native radios give arrow-key selection for free. */
export function ThemeSwitcher() {
  const [preference, setPreference] = useTheme()

  return (
    <fieldset className="theme-switcher">
      <legend className="visually-hidden">Theme</legend>
      {OPTIONS.map(({ value, label, icon }) => (
        <label key={value} className="theme-switcher__option" title={`${label} theme`}>
          <input
            type="radio"
            name="theme"
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
          />
          {icon}
          <span className="visually-hidden">{label}</span>
        </label>
      ))}
    </fieldset>
  )
}
