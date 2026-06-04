/**
 * app/(tenant)/tenant/screening/[application_id]/page.tsx — Applicant screening status & bureau PDF downloads
 *
 * Route:  /tenant/screening/[application_id]
 * Auth:   Supabase magic-link session → tenants.auth_user_id → applications.tenant_id
 * Data:   applications.current_screening_run_id, application_screening_lines (pdf_storage_path)
 * Notes:  Three-state UI: Ready / Running / Results ready.
 *         Applicants see bureau PDFs (Stream 1 — screening-reports bucket via §28.4 RLS).
 *         FitScore document (Stream 2) is agent-only — excluded by storage RLS; not linked here.
 *         POPIA s23(3) data-controller list sourced from COMBINED_DATA_CONTROLLERS.
 */
import { redirect, notFound } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { COMBINED_DATA_CONTROLLERS } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { FileDown, Clock, CheckCircle2, ShieldCheck, ExternalLink } from "lucide-react"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="font-heading text-2xl mb-1">Credit screening</h1>
      <p className="text-sm text-muted-foreground mb-8">Application for {applicantName}</p>

      {state === "ready" && <ReadyState />}
      {state === "running" && <RunningState />}
      {state === "results" && <ResultsState links={signedLinks} />}
    </div>
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
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-brand shrink-0" />
          <h2 className="font-semibold text-lg">Credit & identity check</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Your managing agent will initiate a multi-bureau credit check as part of the application process.
          This check covers TransUnion, XDS, Experian Sigma, and VeriCred — and includes a Home Affairs
          identity verification and SAFPS fraud register check.
        </p>
        <p className="text-sm text-muted-foreground">
          You will be notified when your report is ready for download.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
        <h3 className="font-semibold text-sm">Personal information processed by</h3>
        <p className="text-xs text-muted-foreground mb-3">
          POPIA s23(3) — the following registered credit bureaux will process your personal information:
        </p>
        <ul className="space-y-2">
          {COMBINED_DATA_CONTROLLERS.map((dc) => (
            <li key={dc.name} className="text-sm border-l-2 border-brand/30 pl-3">
              <span className="font-medium">{dc.name}</span>
              {dc.contact !== "TBD" && (
                <span className="text-muted-foreground"> · {dc.contact}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function RunningState() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-4">
      <Clock className="h-6 w-6 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
      <div>
        <h2 className="font-semibold text-amber-900">Credit check in progress</h2>
        <p className="text-sm text-amber-800 mt-1">
          We&apos;re pulling your credit profile from multiple bureaux. This typically takes 1–3 minutes.
          Refresh this page to check if your report is ready.
        </p>
      </div>
    </div>
  )
}

function ResultsState({ links }: { links: { label: string; url: string }[] }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-success/30 bg-success/5 p-6 flex items-start gap-4">
        <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold">Credit report ready</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your multi-bureau credit report is available below. These are your personal reports from each credit bureau.
          </p>
        </div>
      </div>

      {links.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-6 space-y-3">
          <h3 className="font-semibold text-sm mb-4">Download your bureau reports</h3>
          {links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <FileDown className="h-4 w-4 text-brand shrink-0" />
              <span className="text-sm font-medium flex-1">{link.label}</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Your reports are being prepared. Check back shortly or contact your managing agent.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Download links expire after 1 hour. Reload this page to generate fresh links.
      </p>
    </div>
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
