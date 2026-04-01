"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

const TIMEOUT_MS = 120 * 60 * 1000 // 120 minutes
const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const

export function InactivityGuard() {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function signOut() {
      await supabase.auth.signOut()
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
