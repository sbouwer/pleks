"use client"

/**
 * app/(applicant)/apply/[slug]/DocumentCheckCard.tsx — the review's document check: the 14M pre-screen's to-dos.
 *
 * Auth:   the applicant's application token (GET/POST /api/applications/[id]/screen check it against THIS id).
 * Data:   polls GET /screen → { status, todos, canRecheck }. "Check again" POSTs /screen with recheck: true.
 * Notes:  A18, Stéan ruling 2026-10-06 (verify-14m row 15): the applicant sees the to-dos, NOT the two-axis
 *         ruling — the endpoint never sends the ruling, so there is nothing here to hide. A clean scan and an
 *         integrity case both render the same neutral line (lib/applications/applicantTodos.ts says why). The
 *         scan never blocks submitting: the applicant may submit while it runs, and the agent sees the result.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { FileSearch, Loader2, Pencil, RefreshCw } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import type { ScreenStatusView } from "@/lib/applications/screeningJobs"
import { nextPollDelayMs, shouldPoll } from "./documentCheck"

const BOX = "flex flex-col gap-3 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4"

export function DocumentCheckCard({ applicationId, token, onAmend }: Readonly<{
  applicationId: string; token: string; onAmend?: (s: number) => void
}>) {
  const [view, setView] = useState<ScreenStatusView | null>(null)
  const [rechecking, setRechecking] = useState(false)
  const [pollKey, setPollKey] = useState(0) // bumped to restart polling after a re-check
  const attempt = useRef(0)
  // After "check again", the first polls can land before the POST has queued its job and would show the OLD
  // result. Hold a settled answer until the server has said "processing" once (or a few polls have passed).
  const awaitingRecheck = useRef(false)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    attempt.current = 0
    async function poll() {
      let next: ScreenStatusView | null = null
      try {
        const res = await fetch(`/api/applications/${applicationId}/screen?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) })
        if (res.ok) next = await res.json() as ScreenStatusView
        // The token expired or the application is gone: no later poll can succeed, so stop and render nothing.
        else if (res.status === 401 || res.status === 404) next = { status: "none", todos: [], canRecheck: false }
      } catch { /* offline or slow — back off and try again */ }
      if (stopped) return
      if (next?.status === "processing") awaitingRecheck.current = false
      const held = awaitingRecheck.current && attempt.current < 3
      if (next && !held) setView(next)
      if (held || shouldPoll(next?.status ?? null)) {
        timer = setTimeout(poll, nextPollDelayMs(attempt.current++))
      } else awaitingRecheck.current = false
    }
    void poll()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [applicationId, token, pollKey])

  const recheck = useCallback(async () => {
    setRechecking(true)
    awaitingRecheck.current = true
    setView({ status: "processing", todos: [], canRecheck: false })
    // The POST runs the pass itself (it can take a minute); don't hold the UI on it — poll instead. If the request
    // dies, the job stays queued and the screening-jobs cron finishes it.
    void fetch(`/api/applications/${applicationId}/screen`, {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ token, recheck: true }),
    }).then((r) => { if (r.status === 429) toast.error("Please wait a moment before checking again.") }).catch(() => {})
    setPollKey((k) => k + 1)
    setRechecking(false)
  }, [applicationId, token])

  if (!view || view.status === "none") return null

  if (view.status === "processing") {
    return (
      <div className={BOX}>
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]"><Loader2 className="size-4 animate-spin text-[var(--amber)]" /> Checking your documents…</p>
        <p className="text-xs leading-relaxed text-[var(--ink-soft)]">This usually takes under a minute. You can submit now — your agent will see the result either way.</p>
      </div>
    )
  }

  if (view.status === "failed") {
    return (
      <div className={BOX}>
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]"><FileSearch className="size-4 text-[var(--ink-mute)]" /> Document check</p>
        <p className="text-xs leading-relaxed text-[var(--ink-soft)]">We couldn&apos;t check your documents automatically. Your agent will review them.</p>
      </div>
    )
  }

  if (view.todos.length === 0) {
    return (
      <div className={BOX}>
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]"><FileSearch className="size-4 text-[var(--ink-mute)]" /> Document check</p>
        <p className="text-xs leading-relaxed text-[var(--ink-soft)]">Your documents have been checked. Your agent will review the result.</p>
      </div>
    )
  }

  return (
    <div className={BOX}>
      <h3 className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]"><span className="shrink-0">Strengthen your application</span><span aria-hidden className="h-px flex-1 bg-[var(--rule)]" /></h3>
      <ul className="flex flex-col gap-3 text-sm">
        {view.todos.map((t) => (
          <li key={t.key} className="flex flex-col gap-0.5">
            <span className="font-medium text-[var(--ink)]">{t.title}</span>
            <span className="text-xs leading-relaxed text-[var(--ink-soft)]">{t.action}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--rule)] pt-3">
        {onAmend && <ActionButton tone="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => onAmend(0)}>Update my details</ActionButton>}
        {view.canRecheck && <ActionButton tone="secondary" size="sm" icon={<RefreshCw className="size-4" />} disabled={rechecking} onClick={recheck}>I&apos;ve updated them — check again</ActionButton>}
      </div>
    </div>
  )
}
