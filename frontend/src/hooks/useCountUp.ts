import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number | null | undefined, duration = 750): number {
  const [value, setValue] = useState(0)
  const raf = useRef<number>(0)
  const prev = useRef(0)

  useEffect(() => {
    if (target == null) return
    const from = prev.current
    const to = target
    if (from === to) { setValue(to); return }

    const start = performance.now()
    cancelAnimationFrame(raf.current)

    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1)
      const ease = 1 - (1 - t) ** 3  // ease-out cubic
      setValue(Math.round(from + (to - from) * ease))
      if (t < 1) {
        raf.current = requestAnimationFrame(tick)
      } else {
        prev.current = to
        setValue(to)
      }
    }

    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])

  return value
}
