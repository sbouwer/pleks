"use client"

/**
 * components/feedback/FeedbackButton.tsx — Floating help launcher (ADDENDUM_68A B9)
 *
 * Notes: A single "Feedback" pill, fixed bottom-right — icon-only at rest, expands on hover/focus
 *        to reveal the word "Feedback". Click/tap opens the unified "How can we help?" modal
 *        (HelpModal: feedback / bug / support). The label expansion is a hover nicety only — the
 *        whole pill is always the click target, so it works on touch without a hover state
 *        (D-68A-03). Mounts in all four portal layouts; the `role` prop scopes feedback submission.
 */
import { useState } from "react"
import { MessageSquarePlus } from "lucide-react"
import { HelpModal } from "./HelpModal"
import type { FeedbackRole } from "@/lib/feedback/queries"

interface FeedbackButtonProps {
  role: FeedbackRole
}

export function FeedbackButton({ role }: Readonly<FeedbackButtonProps>) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help & feedback"
        className="group fixed bottom-6 right-6 z-40 flex h-12 items-center rounded-full bg-primary px-3.5 text-primary-foreground shadow-lg transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
      >
        <MessageSquarePlus className="h-5 w-5 shrink-0" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-[6rem] group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-[6rem] group-focus-visible:opacity-100">
          Feedback
        </span>
      </button>

      <HelpModal open={open} onOpenChange={setOpen} role={role} />
    </>
  )
}
