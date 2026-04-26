"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Circle, Minus, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  confirmChecklistItem,
  unconfirmChecklistItem,
  markItemNotApplicable,
  unmarkItemNotApplicable,
  addChecklistItemNote,
} from "./insuranceChecklistActions"

export interface ChecklistItemRow {
  id: string
  item_code: string
  state: "confirmed" | "unknown" | "not_applicable"
  confirmed_at: string | null
  confirmed_via: string | null
  notes: string | null
  renewal_reset_at: string | null
  label: string
  description: string
  help_text: string | null
  severity: "critical" | "important" | "optional"
  is_auto_derived: boolean
}

interface Props {
  propertyId: string
  rows: ChecklistItemRow[]
  canTick: boolean  // false for Owner free tier
}

function progressBarClass(pct: number): string {
  if (pct === 100) return "bg-green-500"
  if (pct >= 60) return "bg-amber-400"
  return "bg-muted-foreground/30"
}

function pctTextClass(pct: number): string {
  if (pct === 100) return "text-green-600"
  if (pct >= 60) return "text-amber-600"
  return "text-muted-foreground"
}

const VIA_LABELS: Record<string, string> = {
  agent_inline:    "verified inline",
  owner_response:  "owner confirmed",
  broker_pdf_reply: "broker confirmed",
  auto_derived:    "auto-derived",
  document_upload: "document attached",
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function StateIcon({ state, severity }: { state: ChecklistItemRow["state"]; severity: ChecklistItemRow["severity"] }) {
  if (state === "confirmed") {
    return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
  }
  if (state === "not_applicable") {
    return <Minus className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
  }
  return (
    <Circle
      className={cn(
        "h-4 w-4 shrink-0 mt-0.5",
        severity === "critical" ? "text-amber-500" : "text-muted-foreground/40"
      )}
    />
  )
}

function ChecklistRow({
  row,
  propertyId,
  canTick,
}: {
  row: ChecklistItemRow
  propertyId: string
  canTick: boolean
}) {
  const [open, setOpen] = useState(false)
  const [naReason, setNaReason] = useState("")
  const [showNaForm, setShowNaForm] = useState(false)
  const [noteText, setNoteText] = useState(row.notes ?? "")
  const [pending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await confirmChecklistItem(row.id, propertyId)
    })
  }

  function handleUnconfirm() {
    startTransition(async () => {
      await unconfirmChecklistItem(row.id, propertyId)
    })
  }

  function handleMarkNA() {
    if (!naReason.trim()) return
    startTransition(async () => {
      await markItemNotApplicable(row.id, propertyId, naReason.trim())
      setShowNaForm(false)
    })
  }

  function handleUnmarkNA() {
    startTransition(async () => {
      await unmarkItemNotApplicable(row.id, propertyId)
    })
  }

  function handleSaveNote() {
    startTransition(async () => {
      await addChecklistItemNote(row.id, propertyId, noteText)
    })
  }

  const isNA = row.state === "not_applicable"
  const isConfirmed = row.state === "confirmed"

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        isConfirmed && "border-green-200 bg-green-50/40 dark:border-green-900/30 dark:bg-green-950/20",
        !isConfirmed && !isNA && "border-border bg-background",
        isNA && "border-border/40 bg-muted/20 opacity-60"
      )}
    >
      {/* Row header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <StateIcon state={row.state} severity={row.severity} />
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              "text-sm font-medium leading-tight",
              isNA && "line-through text-muted-foreground"
            )}
          >
            {row.label}
          </span>
          {isConfirmed && row.confirmed_at && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {VIA_LABELS[row.confirmed_via ?? ""] ?? row.confirmed_via} ·{" "}
              {formatRelativeDate(row.confirmed_at)}
            </p>
          )}
          {!isConfirmed && !isNA && (
            <p className="text-xs text-muted-foreground mt-0.5">needs verification</p>
          )}
          {isNA && row.notes && (
            <p className="text-xs text-muted-foreground mt-0.5 italic">N/A — {row.notes}</p>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </button>

      {/* Expanded detail panel */}
      {open && (
        <div className="px-3 pb-3 border-t border-inherit space-y-3">
          {row.help_text && (
            <p className="text-xs text-muted-foreground pt-3">{row.help_text}</p>
          )}

          {canTick ? (
            <div className="space-y-2">
              {/* Primary actions */}
              <div className="flex flex-wrap gap-2">
                {!isConfirmed && !isNA && (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium"
                  >
                    {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Confirm covered
                  </button>
                )}
                {isConfirmed && (
                  <button
                    type="button"
                    onClick={handleUnconfirm}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50 font-medium"
                  >
                    {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Unconfirm
                  </button>
                )}
                {!isNA && !showNaForm && (
                  <button
                    type="button"
                    onClick={() => setShowNaForm(true)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
                  >
                    <Minus className="h-3 w-3" />
                    Mark not applicable
                  </button>
                )}
                {isNA && (
                  <button
                    type="button"
                    onClick={handleUnmarkNA}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
                  >
                    {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Restore item
                  </button>
                )}
              </div>

              {/* N/A reason form */}
              {showNaForm && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={naReason}
                    onChange={(e) => setNaReason(e.target.value)}
                    placeholder="Why doesn't this apply? (required)"
                    className="w-full text-xs px-3 py-2 rounded-md border bg-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleMarkNA}
                      disabled={!naReason.trim() || pending}
                      className="text-xs px-3 py-1.5 rounded-md bg-muted text-foreground hover:bg-muted/80 disabled:opacity-50 font-medium"
                    >
                      {pending ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
                      Confirm N/A
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNaForm(false); setNaReason("") }}
                      className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Notes (optional)</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={2}
                  className="w-full text-xs px-3 py-2 rounded-md border bg-background resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Add a note about this item..."
                />
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={noteText === (row.notes ?? "") || pending}
                  className="text-xs text-brand hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Save note
                </button>
              </div>
            </div>
          ) : (
            /* Owner free: read-only with upgrade CTA */
            row.item_code !== "POLICY_HEADER" && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground">
                  Upgrade to Steward to verify this item inline, send broker briefs, and ask the
                  owner via a secure link.
                </p>
                <a
                  href="/onboarding?tier=steward"
                  className="inline-block mt-2 text-xs text-brand font-medium hover:underline"
                >
                  Upgrade to Steward →
                </a>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

export function InsuranceChecklist({ propertyId, rows, canTick }: Props) {
  const applicable = rows.filter((r) => r.state !== "not_applicable")
  const confirmed = applicable.filter((r) => r.state === "confirmed").length
  const total = applicable.length
  const pct = total === 0 ? 100 : Math.round((confirmed / total) * 100)

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            Verification checklist
          </span>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Checklist not yet initialized for this property.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            Verification checklist
          </span>
          <span className={cn("text-xs font-semibold", pctTextClass(pct))}>
            {confirmed} of {total} · {pct}%
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", progressBarClass(pct))}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <div className="px-3 py-3 space-y-1.5">
        {rows.map((row) => (
          <ChecklistRow
            key={row.id}
            row={row}
            propertyId={propertyId}
            canTick={canTick}
          />
        ))}
      </div>
    </div>
  )
}
