import { flushSync } from 'react-dom'

/**
 * Applies a React state update inside a View Transition so the browser can
 * animate between the old and new page. Falls back to a plain update when the
 * API is missing, the page is hidden (the update would wait for the next
 * rendered frame), or the user prefers reduced motion.
 */
export function withViewTransition(update: () => void) {
  if (
    typeof document.startViewTransition !== 'function' ||
    document.visibilityState !== 'visible' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
