"use client"

/**
 * components/feedback/HelpModal.tsx — Unified "How can we help?" modal (ADDENDUM_68A §3)
 *
 * One modal, internal steps (menu → feedback / bug / support; back-arrow returns to menu), in the
 * shared ModalCard (onboarding-card aesthetic, theme-agnostic). The feedback + bug form bodies are
 * LIFTED from FeedbackDialog/BugReportDialog (D-68A-07) — same submit logic, same payloads, same
 * snapshotContext capture-buffer. The mockup's chips/mood map onto the existing FeedbackCategory
 * enum + rating (D-68A-04). "Need support" links to /help in a NEW TAB so it never unmounts an
 * in-progress flow such as the property wizard (D-68A-05).
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Lightbulb, Bug, LifeBuoy, ChevronRight, ArrowRight, CheckCircle2, Mail,
} from "lucide-react"
import { ModalCard } from "@/components/ui/modal-card"
import { snapshotContext, type BugSnapshot } from "@/lib/feedback/capture-buffer"
import type { FeedbackCategory, FeedbackRole } from "@/lib/feedback/queries"

type Step = "menu" | "feedback" | "bug" | "support"

interface HelpModalProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  role:         FeedbackRole
}

const STEP_TITLE: Record<Step, string> = {
  menu:     "How can we help?",
  feedback: "What's on your mind?",
  bug:      "What went wrong?",
  support:  "Need a hand?",
}

export function HelpModal({ open, onOpenChange, role }: Readonly<HelpModalProps>) {
  const [step, setStep] = useState<Step>("menu")

  function handleClose(value: boolean) {
    onOpenChange(value)
    if (!value) setTimeout(() => setStep("menu"), 200)   // reset after the close animation
  }

  return (
    <ModalCard
      open={open}
      onOpenChange={handleClose}
      eyebrow="Help & feedback"
      title={STEP_TITLE[step]}
      onBack={step === "menu" ? undefined : () => setStep("menu")}
    >
      {step === "menu"     && <Menu onPick={setStep} />}
      {step === "feedback" && <FeedbackStep role={role} onClose={() => handleClose(false)} />}
      {step === "bug"      && <BugStep open={open} onClose={() => handleClose(false)} />}
      {step === "support"  && <SupportStep />}
    </ModalCard>
  )
}

// ── Menu ────────────────────────────────────────────────────────────────────────

function Menu({ onPick }: Readonly<{ onPick: (s: Step) => void }>) {
  const items: Array<{ step: Step; icon: React.ReactNode; title: string; sub: string }> = [
    { step: "feedback", icon: <Lightbulb className="h-5 w-5" />, title: "Give us feedback", sub: "Request a feature or share an idea" },
    { step: "bug",      icon: <Bug className="h-5 w-5" />,       title: "Report a bug",      sub: "Something's broken or behaving wrong" },
    { step: "support",  icon: <LifeBuoy className="h-5 w-5" />,  title: "Need support",      sub: "Browse the help centre or email the team" },
  ]
  return (
    <div className="grid gap-2.5">
      {items.map((it) => (
        <button
          key={it.step}
          type="button"
          onClick={() => onPick(it.step)}
          className="flex items-center gap-3.5 rounded-[var(--r-button)] border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-button)] bg-primary/10 text-primary">{it.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{it.title}</span>
            <span className="block text-[13px] leading-snug text-muted-foreground">{it.sub}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

// ── Give us feedback (lifted FeedbackDialog body; chips + mood per the mockup) ───

const FEEDBACK_CHIPS: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "feature", label: "A feature request" },
  { value: "ux",      label: "Something's confusing" },
  { value: "billing", label: "Billing" },
  { value: "praise",  label: "Something I love" },
  { value: "general", label: "Other" },
]
const MOODS: Array<{ rating: number; label: string }> = [
  { rating: 1, label: "Frustrating" },
  { rating: 3, label: "Fine" },
  { rating: 5, label: "Love it" },
]

function FeedbackStep({ role, onClose }: Readonly<{ role: FeedbackRole; onClose: () => void }>) {
  const [category, setCategory] = useState<FeedbackCategory>("feature")
  const [body,     setBody]     = useState("")
  const [rating,   setRating]   = useState<number | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [done,     setDone]     = useState(false)

  async function submit() {
    if (saving) return
    setSaving(true)
    try {
      // Subject isn't a field in this surface — derive it from the chosen chip (always ≥3 chars,
      // satisfies the API) so the existing /api/feedback payload shape is unchanged.
      const subject = FEEDBACK_CHIPS.find((c) => c.value === category)?.label ?? "Feedback"
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, body: body.trim(), rating, role }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? "Failed to send feedback.")
        return
      }
      setDone(true)
    } catch {
      toast.error("Failed to send feedback. Check your connection.")
    } finally {
      setSaving(false)
    }
  }

  if (done) return <DoneState message="We've received your feedback and will review it shortly." onClose={onClose} />

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">Ideas, requests, or a note about how Pleks is working for you — straight to the team.</p>

      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">This is…</p>
        <div className="flex flex-wrap gap-1.5">
          {FEEDBACK_CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`rounded-[var(--r-button)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                category === c.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Tell us more</p>
          <span className="text-[11px] text-muted-foreground">{body.length}/600</span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 600))}
          rows={4}
          placeholder="e.g. It would help if I could schedule a payment in advance."
          className="w-full resize-none rounded-[var(--r-button)] border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">A sentence or two is great.</p>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">How&apos;s Pleks feeling? <span className="lowercase opacity-70">optional</span></p>
        <div className="grid grid-cols-3 gap-2">
          {MOODS.map((m) => (
            <button
              key={m.rating}
              type="button"
              onClick={() => setRating(rating === m.rating ? null : m.rating)}
              className={`rounded-[var(--r-button)] border px-2 py-2.5 text-xs font-medium transition-colors ${
                rating === m.rating ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={saving || body.trim().length < 10}
          className="group inline-flex items-center gap-2 rounded-[var(--r-button)] bg-foreground py-2 pl-2.5 pr-4 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
          {saving ? "Sending…" : "Send feedback"} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Report a bug (lifted BugReportDialog body; snapshotContext intact) ───────────

function BugStep({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const [message,     setMessage]     = useState("")
  const [snapshot,    setSnapshot]    = useState<BugSnapshot | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [done,        setDone]        = useState(false)

  useEffect(() => { if (open) setSnapshot(snapshotContext()) }, [open])

  async function submit() {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/feedback/bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), context: snapshot ?? snapshotContext() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? "Failed to send report.")
        return
      }
      setDone(true)
    } catch {
      toast.error("Failed to send report. Check your connection.")
    } finally {
      setSaving(false)
    }
  }

  if (done) return <DoneState message="We've received your report and the diagnostics needed to investigate." onClose={onClose} />

  const errCount = snapshot?.consoleErrors.length ?? 0
  const reqCount = snapshot?.failedRequests.length ?? 0
  const tooShort = message.trim().length < 10

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">One line is plenty — we&apos;ve already captured the technical details for you.</p>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="sr-only">What went wrong?</span>
          <span />
          <span className="text-[11px] text-muted-foreground">{message.length}/500</span>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="e.g. I tapped Pay and nothing happened."
          className={`w-full resize-none rounded-[var(--r-button)] border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            tooShort && message.length > 0 ? "border-danger focus:ring-danger/30" : "border-input focus:ring-primary/30"
          }`}
        />
        {tooShort && message.length > 0 && (
          <p className="mt-1 text-[11px] text-danger">A little more detail — {10 - message.trim().length} to go</p>
        )}
      </div>

      {/* Technical context — collapsed, transparent (POPIA) */}
      <div className="rounded-[var(--r-button)] border border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={showDetails}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showDetails ? "rotate-90" : ""}`} />
          Technical details attached
          <span className="ml-auto flex gap-1.5">
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px]">{errCount} error{errCount === 1 ? "" : "s"}</span>
            {snapshot?.userAgentParsed && <span className="rounded border border-border px-1.5 py-0.5 text-[10px]">{snapshot.userAgentParsed.split(" ")[0]}</span>}
          </span>
        </button>
        {showDetails && snapshot && (
          <div className="space-y-1 px-3 pb-3 text-[11px] text-muted-foreground">
            <p>Page: {snapshot.routePath}</p>
            <p>Device: {snapshot.userAgentParsed} · {snapshot.viewport}</p>
            <p>Connection: {snapshot.onlineState}{snapshot.pwaMode ? " · installed app" : ""}</p>
            <p>{errCount} console error{errCount === 1 ? "" : "s"} · {reqCount} failed request{reqCount === 1 ? "" : "s"} captured</p>
            {snapshot.plekTrace && <p>Trace: {snapshot.plekTrace.slice(0, 12)}…</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-muted-foreground">Auto-captured details are scrubbed of personal info · POPIA-safe</p>
        <button
          type="button"
          onClick={submit}
          disabled={saving || tooShort}
          className="group inline-flex shrink-0 items-center gap-2 rounded-[var(--r-button)] bg-foreground py-2 pl-2.5 pr-4 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
          {saving ? "Sending…" : "Send report"} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Need support — links to /help in a NEW TAB (never unmounts an in-progress flow) ──

function SupportStep() {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">Search the answers in the Help Centre, or reach the team if you&apos;re still stuck.</p>
      <a
        href="/help"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-[var(--r-button)] border border-border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r-button)] bg-primary/10 text-primary"><LifeBuoy className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Browse the Help Centre</span>
          <span className="block text-[13px] text-muted-foreground">Opens in a new tab — your current work stays put</span>
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </a>
      <a
        href="mailto:support@pleks.co.za"
        className="flex items-center gap-3 rounded-[var(--r-button)] border border-border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r-button)] bg-primary/10 text-primary"><Mail className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Email the team</span>
          <span className="block text-[13px] text-muted-foreground">support@pleks.co.za</span>
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </a>
    </div>
  )
}

// ── Shared done state ────────────────────────────────────────────────────────────

function DoneState({ message, onClose }: Readonly<{ message: string; onClose: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-3 py-3 text-center">
      <CheckCircle2 className="h-10 w-10 text-primary" />
      <p className="text-sm font-medium text-foreground">Thank you</p>
      <p className="max-w-xs text-[13px] text-muted-foreground">{message} You may get a reply by email if we need more.</p>
      <button
        type="button"
        onClick={onClose}
        className="group mt-1 inline-flex items-center gap-2 rounded-[var(--r-button)] bg-foreground py-2 pl-2.5 pr-4 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
        Done
      </button>
    </div>
  )
}
