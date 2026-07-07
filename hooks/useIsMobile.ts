"use client"

/**
 * hooks/useIsMobile.ts — reactive boolean for whether the viewport is at/below a breakpoint (default 768px)
 *
 * Notes:  SSR-safe initial value (false when window is undefined); subscribes to matchMedia change events
 */
import { useState, useEffect } from "react"

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (globalThis.window === undefined) return false
    return globalThis.matchMedia(`(max-width: ${breakpoint}px)`).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])

  return isMobile
}
