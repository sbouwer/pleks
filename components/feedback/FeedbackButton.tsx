"use client"

/**
 * components/feedback/FeedbackButton.tsx — edge-tab help launcher (ADDENDUM_68A B9)
 *
 * Notes: A "Feedback" tab stuck to the RIGHT EDGE, lower-right — the door-square shape rounded only on
 *        the inner (left) side so it reads as a label sticking out of the viewport. Desktop: icon-only
 *        at rest, expands leftward on hover/focus to reveal the word. Mobile: the label shows by default
 *        (no hover) and the tab sits ABOVE the bottom nav (h-14). Click/tap opens the unified HelpModal.
 *        The whole tab is the target, so it works on touch without a hover state (D-68A-03). Mounts in
 *        all four portal layouts; the `role` prop scopes feedback submission.
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
        className="group fixed right-0 bottom-20 z-40 flex items-center rounded-l-[var(--r-button)] rounded-r-none bg-primary py-2.5 pl-3 pr-2.5 text-primary-foreground shadow-lg transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:bottom-24"
      >
        {/* Label: shown by default on mobile (no hover); collapsed on desktop until hover/focus. */}
        <span className="mr-2 max-w-[6rem] overflow-hidden whitespace-nowrap text-sm font-medium opacity-100 transition-all duration-200 lg:mr-0 lg:max-w-0 lg:opacity-0 lg:group-hover:mr-2 lg:group-hover:max-w-[6rem] lg:group-hover:opacity-100 lg:group-focus-visible:mr-2 lg:group-focus-visible:max-w-[6rem] lg:group-focus-visible:opacity-100">
          Feedback
        </span>
        <MessageSquarePlus className="h-5 w-5 shrink-0" />
      </button>

      <HelpModal open={open} onOpenChange={setOpen} role={role} />
    </>
  )
}
