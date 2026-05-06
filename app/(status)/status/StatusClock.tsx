/**
 * app/(status)/status/StatusClock.tsx — Live SAST clock + ISR refresh trigger
 *
 * Auth:   public
 * Notes:  Client component. Displays current time in Africa/Johannesburg and
 *         calls router.refresh() every 60 s so the server ISR re-fetches
 *         Better Stack data without a full page reload.
 */
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

function currentSAST(): string {
  return new Date().toLocaleString("en-ZA", {
    timeZone:  "Africa/Johannesburg",
    hour:      "2-digit",
    minute:    "2-digit",
  })
}

export function StatusClock() {
  const router              = useRouter()
  const [time, setTime]     = useState(currentSAST)

  useEffect(() => {
    const tick    = setInterval(() => setTime(currentSAST()), 1000)
    const refresh = setInterval(() => router.refresh(), 60_000)
    return () => { clearInterval(tick); clearInterval(refresh) }
  }, [router])

  return <strong>{time} SAST</strong>
}
