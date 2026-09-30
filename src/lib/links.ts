import type { MouseEvent } from 'react'

/** True for a plain left click; modified clicks should keep native link behaviour. */
export function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
