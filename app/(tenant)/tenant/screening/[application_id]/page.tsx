/**
 * app/(tenant)/tenant/screening/[application_id]/page.tsx — Applicant screening status & bureau PDF downloads
 *
 * Route:  /tenant/screening/[application_id]
 * Auth:   Supabase magic-link session → tenants.auth_user_id → applications.tenant_id
 * Data:   applications.current_screening_run_id, application_screening_lines (pdf_storage_path)
 * Notes:  Three-state UI: Ready / Running / Results ready. Applicants see bureau PDFs (Stream 1 —
 *         screening-reports bucket via §28.4 RLS); FitScore (Stream 2) is agent-only. POPIA s23(3) data-
 *         controller list from COMBINED_DATA_CONTROLLERS. Canon DetailPageLayout + DetailCard (door style).
 */
import { redirect, notFound } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { COMBINED_DATA_CONTROLLERS } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import type { DetailStatus } from "@/lib/detail/types"
import { FileDown, Clock, CheckCircle2, ShieldCheck, ExternalLink } from "lucide-react"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATE_STATUS: Record<"ready" | "running" | "results", DetailStatus> = {
  ready: { kind: "neutral", label: "Not started" },
  running: { kind: "vacant", label: "In progress" },
  results: { kind: "occupied", label: "Report ready" },
}

export default async function ScreeningPage({
  params,
}: {
  params: Promise<{ application_id: string }>
}) {
  const { application_id } = await params

  // ── Auth: Supabase magic-link session → tenant ──────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/tenant/access")

  const service = await createServiceClient()

  const { data: tenant, error: tenantErr } = await service
    .from("tenants")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  if (tenantErr || !tenant) redirect("/tenant/access")

  // ── Application: must belong to this tenant ─────────────────────────────────
  const { data: app, error: appErr } = await service
    .from("applications")
    .select("id, first_name, last_name, searchworx_check_status, current_screening_run_id, org_id")
    .eq("id", application_id)
    .eq("tenant_id", tenant.id)
    .single()

  if (appErr || !app) notFound()

  const state = deriveState(app.searchworx_check_status as string | null)

  // ── Results ready: fetch screening lines with PDF paths ─────────────────────
  let pdfLines: { product_key: string; pdf_storage_path: string | null; result_summary: string | null }[] = []

  if (state === "results" && app.current_screening_run_id) {
    const { data: lines, error: linesErr } = await service
      .from("application_screening_lines")
      .select("product_key, pdf_storage_path, result_summary")
      .eq("application_id", application_id)
      .eq("screening_run_id", app.current_screening_run_id)
      .eq("status", "completed")
      .not("pdf_storage_path", "is", null)

    if (linesErr) {
      console.error("[screening page] lines query failed:", linesErr.message)
    } else {
      pdfLines = lines ?? []
    }
  }

  // ── Generate signed URLs for bureau PDFs ────────────────────────────────────
  const signedLinks: { label: string; url: string }[] = []
  for (const line of pdfLines) {
    if (!line.pdf_storage_path) continue
    const { data: signed, error: signedError } = await service
      .storage
      .from("screening-reports")
      .createSignedUrl(line.pdf_storage_path, 3600)
    logQueryError("ScreeningPage screening-reports", signedError)  // 1-hour expiry
    if (signed?.signedUrl) {
      signedLinks.push({
        label: productKeyLabel(line.product_key),
        url:   signed.signedUrl,
      })
    }
  }

  const applicantName = [app.first_name, app.last_name].filter(Boolean).join(" ") || "Applicant"

  return (
    <DetailPageLayout
      category="Home"
      backHref="/tenant"
      title="Credit screening"
      status={STATE_STATUS[state]}
      facts={[{ k: "Applicant", v: applicantName }]}
    >
      <DetailFullWidth>
        <div className="max-w-2xl space-y-4">
          {state === "ready" && <ReadyState />}
          {state === "running" && <RunningState />}
          {state === "results" && <ResultsState links={signedLinks} />}
        </div>
      </DetailFullWidth>
    </DetailPageLayout>
  )
}

// ─── State derivation ─────────────────────────────────────────────────────────

function deriveState(status: string | null): "ready" | "running" | "results" {
  if (status === "running") return "running"
  if (status === "complete") return "results"
  return "ready"
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function ReadyState() {
  return (
    <>
      <DetailCard title="Credit & identity check">
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-3 text-foreground">
            <ShieldCheck className="h-5 w-5 shrink-0 text-brand" />
            <span className="font-semibold">Multi-bureau check</span>
          </div>
          <p>
            Your managing agent will initiate a multi-bureau credit check as part of the application process.
            This check covers TransUnion, XDS, Experian Sigma, and VeriCred — and includes a Home Affairs
            identity verification and SAFPS fraud register check.
          </p>
          <p>You will be notified when your report is ready for download.</p>
        </div>
      </DetailCard>

      <DetailCard title="Personal information processed by">
        <p className="mb-3 text-xs text-muted-foreground">
          POPIA s23(3) — the following registered credit bureaux will process your personal information:
        </p>
        <ul className="space-y-2">
          {COMBINED_DATA_CONTROLLERS.map((dc) => (
            <li key={dc.name} className="border-l-2 border-amber-400/40 pl-3 text-sm">
              <span className="font-medium text-foreground">{dc.name}</span>
              {dc.contact !== "TBD" && (
                <span className="text-muted-foreground"> · {dc.contact}</span>
              )}
            </li>
          ))}
        </ul>
      </DetailCard>
    </>
  )
}

function RunningState() {
  return (
    <div className="flex items-start gap-4 rounded-[var(--r-button)] border border-warning/30 bg-warning/10 p-6">
      <Clock className="mt-0.5 h-6 w-6 shrink-0 animate-pulse text-warning" />
      <div>
        <h2 className="font-semibold text-foreground">Credit check in progress</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;re pulling your credit profile from multiple bureaux. This typically takes 1–3 minutes.
          Refresh this page to check if your report is ready.
        </p>
      </div>
    </div>
  )
}

function ResultsState({ links }: { links: { label: string; url: string }[] }) {
  return (
    <>
      <div className="flex items-start gap-4 rounded-[var(--r-button)] border border-success/30 bg-success/5 p-6">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
        <div>
          <h2 className="font-semibold text-foreground">Credit report ready</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your multi-bureau credit report is available below. These are your personal reports from each credit bureau.
          </p>
        </div>
      </div>

      {links.length > 0 ? (
        <DetailCard title="Download your bureau reports">
          <div className="space-y-3">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[var(--r-button)] border border-border px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <FileDown className="h-4 w-4 shrink-0 text-brand" />
                <span className="flex-1 text-sm font-medium text-foreground">{link.label}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </DetailCard>
      ) : (
        <DetailCard title="Reports">
          <p className="text-sm text-muted-foreground">
            Your reports are being prepared. Check back shortly or contact your managing agent.
          </p>
        </DetailCard>
      )}

      <p className="text-xs text-muted-foreground">
        Download links expire after 1 hour. Reload this page to generate fresh links.
      </p>
    </>
  )
}

// ─── Label helper ─────────────────────────────────────────────────────────────

function productKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    combined_consumer_credit_report: "Multi-bureau credit report (TransUnion, XDS, Experian Sigma, VeriCred)",
    vccb_income_estimator:           "Income estimate report (VeriCred)",
  }
  return labels[key] ?? key
}
