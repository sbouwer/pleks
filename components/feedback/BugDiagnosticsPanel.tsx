"use client"

/**
 * components/feedback/BugDiagnosticsPanel.tsx — Admin diagnostics for a bug report (ADDENDUM_68)
 *
 * Auth:   Rendered only when FeedbackDetail isAdmin and a bug_context row exists.
 * Notes:  Shows the auto-captured device/route context + console errors + failed
 *         requests inline, and turns the correlation keys into action: a one-click
 *         copy of the Supabase log filter (pleks_trace + user_id + ±2-min window for
 *         MCP get_logs) and a link to the Vercel logs (x_vercel_id shown for paste).
 */

import { toast } from "sonner"
import { Copy, ExternalLink } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import type { BugContext } from "@/lib/feedback/bug-context"

const VERCEL_LOGS_URL = "https://vercel.com/stean-bouwers-projects/pleks/logs"

export function BugDiagnosticsPanel({ ctx, submitterId }: Readonly<{ ctx: BugContext; submitterId: string }>) {
  const t = ctx.client_timestamp ? new Date(ctx.client_timestamp) : null
  const window2m = t
    ? `${new Date(t.getTime() - 120_000).toISOString()} … ${new Date(t.getTime() + 120_000).toISOString()}`
    : "n/a"
  const logFilter = [
    ctx.pleks_trace ? `pleks_trace=${ctx.pleks_trace}` : null,
    `user_id=${submitterId}`,
    `window=[${window2m}]`,
  ].filter(Boolean).join("  ")

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error("Copy failed"))
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnostics</p>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted-foreground">Page</dt>
        <dd className="font-mono break-all">{ctx.route_path ?? "—"}</dd>
        <dt className="text-muted-foreground">Device</dt>
        <dd>{ctx.user_agent_parsed ?? "—"} · {ctx.viewport ?? "—"}</dd>
        <dt className="text-muted-foreground">Connection</dt>
        <dd>{ctx.online_state ?? "—"}{ctx.pwa_mode ? " · installed" : ""}</dd>
        <dt className="text-muted-foreground">Build</dt>
        <dd className="font-mono">{ctx.app_version ?? "—"}</dd>
        <dt className="text-muted-foreground">Trace</dt>
        <dd className="font-mono break-all">{ctx.pleks_trace ?? "—"}</dd>
        <dt className="text-muted-foreground">Vercel</dt>
        <dd className="font-mono break-all">{ctx.x_vercel_id ?? "—"}</dd>
        <dt className="text-muted-foreground">When</dt>
        <dd>{ctx.client_timestamp ? new Date(ctx.client_timestamp).toLocaleString("en-ZA") : "—"}</dd>
      </dl>

      {ctx.console_errors.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            Console errors ({ctx.console_errors.length})
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px] leading-relaxed">
            {ctx.console_errors.map((e) => `[${e.level}] ${e.message}`).join("\n\n")}
          </pre>
        </div>
      )}

      {ctx.failed_requests.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            Failed requests ({ctx.failed_requests.length})
          </p>
          <pre className="max-h-32 overflow-auto rounded bg-background p-2 text-[10px] leading-relaxed">
            {ctx.failed_requests.map((r) => `${r.status} ${r.method} ${r.path}`).join("\n")}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <ActionButton tone="secondary" size="sm" onClick={() => copy(logFilter, "Supabase log filter")}>
          <Copy className="h-3.5 w-3.5" /> Copy Supabase log filter
        </ActionButton>
        <a
          href={VERCEL_LOGS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open in Vercel
        </a>
      </div>
    </div>
  )
}
