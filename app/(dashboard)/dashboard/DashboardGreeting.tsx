"use client"

/**
 * app/(dashboard)/dashboard/DashboardGreeting.tsx — personal, device-time dashboard greeting
 *
 * Notes:  Section (morning/afternoon/evening) is read from the user's DEVICE clock, not the server, so
 *         it's always accurate to their timezone. Each section has 15 phrasings; one is chosen by a
 *         per-day seed so it stays stable across refreshes (max one rotation a day) yet varies day to
 *         day, so it reads as personal. SSR renders the server-computed `fallback` to avoid a hydration
 *         mismatch; the effect corrects to device-time on mount.
 */
import { useEffect, useState } from "react"

// Each phrase is rendered as `${phrase}, ${firstName}.` — so it must read naturally with a name
// appended (no "Evening, all" or trailing "?" which would become "…, Stéan.").
const GREETINGS: Record<"morning" | "afternoon" | "evening", string[]> = {
  morning: [
    "Good morning", "Morning", "Rise and shine", "Top of the morning", "Bright and early",
    "Here's to a fresh start", "Ready when you are", "Let's make today count", "The day is yours",
    "Off to a good start", "Good to see you", "Let's get to it", "A new day", "Welcome back", "Hope you slept well",
  ],
  afternoon: [
    "Good afternoon", "Afternoon", "Hope it's going well", "Halfway there", "Keep it rolling",
    "Good to see you", "Back at it", "Steady as she goes", "Making progress", "Welcome back",
    "Onwards", "Still going strong", "Hope the day's treating you well", "Powering through", "Good to have you back",
  ],
  evening: [
    "Good evening", "Evening", "Winding down", "Hope it was a good one", "Almost there",
    "Good to see you", "Wrapping up", "Nearly done", "Welcome back", "Hope you're well",
    "Easy does it", "One more look", "Still here", "Burning the midnight oil", "Long day behind you",
  ],
}

function sectionFor(hour: number): keyof typeof GREETINGS {
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}

/** Stable per-day integer seed from the device date (so the pick rotates at most once a day). */
function daySeed(d: Date): number {
  const s = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function DashboardGreeting({ firstName, fallback }: Readonly<{ firstName: string; fallback: string }>) {
  const [text, setText] = useState(fallback)

  useEffect(() => {
    const now = new Date()
    const list = GREETINGS[sectionFor(now.getHours())]
    const phrase = list[daySeed(now) % list.length]
    setText(`${phrase}, ${firstName}.`)
  }, [firstName])

  return <>{text}</>
}
