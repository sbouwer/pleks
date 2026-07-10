"use client"

/**
 * components/feedback/FeedbackInbox.tsx — Feedback submissions list
 *
 * Data:   Receives submissions as props (fetched server-side by parent page)
 * Notes:  Used in both org-admin settings pages and the platform admin inbox.
 */

import Link from "next/link"
import type { FeedbackSubmission } from "@/lib/feedback/queries"
import { fmtDateZA } from "@/lib/dates"

const STATUS_LABELS: Record<string, string> = {
  open:        "Open",
  in_progress: "In progress",
  resolved:    "Resolved",
  wont_fix:    "Won\'t fix",
}

const STATUS_COLOURS: Record<string, string> = {
  open:        "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved:    "bg-green-100 text-green-800",
  wont_fix:    "bg-muted text-muted-foreground",
}

const CATEGORY_LABELS: Record<string, string> = {
  bug:     "Bug",
  feature: "Feature",
  general: "General",
  billing: "Billing",
  ux:      "UX",
}

interface FeedbackInboxProps {
  submissions: FeedbackSubmission[]
  /** Base path for detail links — e.g. "/settings/feedback" or "/admin/feedback" */
  detailBasePath: string
  /** Show role column (platform admin only) */
  showRole?: boolean
}

export function FeedbackInbox({ submissions, detailBasePath, showRole = false }: FeedbackInboxProps) {
  if (submissions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">No feedback submissions yet.</p>
    )
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {submissions.map((s) => (
        <Link
          key={s.id}
          href={`${detailBasePath}/${s.id}`}
          className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOURS[s.status] ?? "bg-muted text-muted-foreground"}`}>
                {STATUS_LABELS[s.status] ?? s.status}
              </span>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                {CATEGORY_LABELS[s.category] ?? s.category}
              </span>
              {showRole && (
                <span className="text-[11px] text-muted-foreground">· {s.role}</span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-foreground truncate">{s.subject}</p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{s.body.slice(0, 120)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
            {s.rating != null && (
              <p className="text-xs text-amber-500">{"★".repeat(s.rating)}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function formatDate(iso: string): string {
  return fmtDateZA(iso)
}
