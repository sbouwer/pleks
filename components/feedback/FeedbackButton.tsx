"use client"

/**
 * components/feedback/FeedbackButton.tsx — Floating feedback trigger button
 *
 * Notes: Fixed bottom-right, renders FeedbackDialog on click. Mounts in all
 *        four portal layouts. Role prop indicates which user type is submitting.
 */

import { useState } from "react"
import { MessageSquarePlus } from "lucide-react"
import { FeedbackDialog } from "./FeedbackDialog"
import type { FeedbackRole } from "@/lib/feedback/queries"

interface FeedbackButtonProps {
  role: FeedbackRole
}

export function FeedbackButton({ role }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        aria-label="Send feedback"
        title="Send feedback"
      >
        <MessageSquarePlus className="h-4 w-4" />
      </button>

      <FeedbackDialog open={open} onOpenChange={setOpen} role={role} />
    </>
  )
}
