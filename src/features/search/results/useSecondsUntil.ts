import { useEffect, useState } from 'react'

export function useSecondsUntil(target: Date | null): number {
  const [now, setNow] = useState(() => Date.now())
  const remaining = target ? Math.max(0, Math.ceil((target.getTime() - now) / 1000)) : 0

  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [remaining])

  return remaining
}
