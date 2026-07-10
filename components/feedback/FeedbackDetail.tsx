"use client"

/**
 * components/feedback/FeedbackDetail.tsx — Single feedback submission detail with reply thread
 *
 * Notes:  Receives submission + replies as props. Admin controls (status + reply form)
 *         shown when isAdmin=true. Submitter can add follow-up replies.
 */

import { useState } from "react"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FeedbackSubmission, FeedbackReply, FeedbackStatus } from "@/lib/feedback/queries"
import type { BugContext } from "@/lib/feedback/bug-context"
import { BugDiagnosticsPanel } from "./BugDiagnosticsPanel"
import { fmtDateZA } from "@/lib/dates"

const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved",    label: "Resolved" },
  { value: "wont_fix",    label: "Won\'t fix" },
]

const STATUS_COLOURS: Record<string, string> = {
  open:        "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved:    "bg-green-100 text-green-800",
  wont_fix:    "bg-muted text-muted-foreground",
}

interface FeedbackDetailProps {
  submission: FeedbackSubmission & { replies: FeedbackReply[]; bugContext?: BugContext | null }
  isAdmin:    boolean
}

export function FeedbackDetail({ submission, isAdmin }: FeedbackDetailProps) {
  const [replies,    setReplies]    = useState<FeedbackReply[]>(submission.replies)
  const [status,     setStatus]     = useState<FeedbackStatus>(submission.status)
  const [adminNote,  setAdminNote]  = useState(submission.admin_note ?? "")
  const [replyBody,  setReplyBody]  = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [savingRpl,  setSavingRpl]  = useState(false)

  async function handleStatusSave() {
    setSavingNote(true)
    try {
      const res = await fetch(`/api/feedback/${submission.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: adminNote || null }),
      })
      if (!res.ok) { toast.error("Failed to update status."); return }
      toast.success("Status updated.")
    } finally {
      setSavingNote(false)
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyBody.trim() || savingRpl) return
    setSavingRpl(true)
    try {
      const res = await fetch(`/api/feedback/${submission.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      })
      if (!res.ok) { toast.error("Failed to send reply."); return }
      const { reply } = await res.json() as { reply: FeedbackReply }
      setReplies((prev) => [...prev, reply])
      setReplyBody("")
    } finally {
      setSavingRpl(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Submission header */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{submission.subject}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {submission.role} · {submission.category}
              {submission.rating != null ? ` · ${"★".repeat(submission.rating)}` : ""}
              {" · "}{formatDate(submission.created_at)}
            </p>
          </div>
          <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOURS[status] ?? "bg-muted text-muted-foreground"}`}>
            {STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}
          </span>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{submission.body}</p>
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin</p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Internal note</label>
              <Textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={1}
                placeholder="Not visible to submitter"
                className="text-sm resize-none"
              />
            </div>
            <ActionButton tone="secondary" size="sm" onClick={handleStatusSave} disabled={savingNote}>
              {savingNote ? "Saving…" : "Save"}
            </ActionButton>
          </div>
        </div>
      )}

      {/* Bug diagnostics (admin-only, bug reports only) */}
      {isAdmin && submission.bugContext && (
        <BugDiagnosticsPanel ctx={submission.bugContext} submitterId={submission.submitter_id} />
      )}

      {/* Reply thread */}
      {replies.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Replies</p>
          {replies.map((r) => (
            <div
              key={r.id}
              className={`rounded-lg border p-4 ${
                r.is_admin_reply ? "border-brand/20 bg-brand/5" : "border-border bg-surface"
              }`}
            >
              <p className="mb-1 text-[11px] text-muted-foreground">
                {r.is_admin_reply ? "Pleks team" : "You"} · {formatDate(r.created_at)}
              </p>
              <p className="whitespace-pre-wrap text-sm">{r.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      <form onSubmit={handleReply} className="space-y-2">
        <Textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          rows={3}
          placeholder="Add a reply…"
          className="text-sm"
        />
        <div className="flex justify-end">
          <ActionButton type="submit" tone="primary" size="sm" disabled={savingRpl || replyBody.trim().length < 5}>
            {savingRpl ? "Sending…" : "Send reply"}
          </ActionButton>
        </div>
      </form>
    </div>
  )
}

function formatDate(iso: string): string {
  return fmtDateZA(iso)
}
