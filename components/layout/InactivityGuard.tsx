"use client"

/**
 * components/layout/InactivityGuard.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const TIMEOUT_MS = 120 * 60 * 1000 // 120 minutes
const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const

export function InactivityGuard() {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function signOut() {
      await fetch("/api/auth/logout", { method: "POST" })
      toast.info("You were signed out due to inactivity.")
      router.replace("/login")
    }

    function reset() {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(signOut, TIMEOUT_MS)
    }

    reset()
    for (const event of EVENTS) window.addEventListener(event, reset, { passive: true })

    return () => {
      if (timer.current) clearTimeout(timer.current)
      for (const event of EVENTS) window.removeEventListener(event, reset)
    }
  }, [router])

  return null
}
