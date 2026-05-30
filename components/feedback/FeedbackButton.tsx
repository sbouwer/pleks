"use client"

/**
 * components/feedback/FeedbackButton.tsx — Floating help trigger (feedback + bug report)
 *
 * Notes: Fixed bottom-right FAB — the quick door into help (BUILD_68). Opens a menu:
 *        "Browse help" (→ /help Help Centre, agent only for now), "Report a problem"
 *        (BugReportDialog — auto-captured diagnostics, ADDENDUM_68) and "Send feedback"
 *        (the existing FeedbackDialog). Mounts in all four portal layouts; role prop
 *        indicates which user type is submitting.
 */

import { useState } from "react"
import Link from "next/link"
import { MessageSquarePlus, Bug, X, LifeBuoy } from "lucide-react"
import { FeedbackDialog } from "./FeedbackDialog"
import { BugReportDialog } from "./BugReportDialog"
import type { FeedbackRole } from "@/lib/feedback/queries"

interface FeedbackButtonProps {
  role: FeedbackRole
}

export function FeedbackButton({ role }: Readonly<FeedbackButtonProps>) {
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [bugOpen,      setBugOpen]      = useState(false)

  const itemClass =
    "flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-lg ring-1 ring-border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {menuOpen && (
          <>
            {role === "agent" && (
              <Link href="/help" className={itemClass} onClick={() => setMenuOpen(false)}>
                <LifeBuoy className="h-4 w-4 text-brand" />
                Browse help
              </Link>
            )}
            <button className={itemClass} onClick={() => { setMenuOpen(false); setBugOpen(true) }}>
              <Bug className="h-4 w-4 text-danger" />
              Report a problem
            </button>
            <button className={itemClass} onClick={() => { setMenuOpen(false); setFeedbackOpen(true) }}>
              <MessageSquarePlus className="h-4 w-4 text-brand" />
              Send feedback
            </button>
          </>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-label={menuOpen ? "Close help menu" : "Help & feedback"}
          aria-expanded={menuOpen}
          title="Help & feedback"
        >
          {menuOpen ? <X className="h-4 w-4" /> : <MessageSquarePlus className="h-4 w-4" />}
        </button>
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} role={role} />
      <BugReportDialog open={bugOpen} onOpenChange={setBugOpen} />
    </>
  )
}
