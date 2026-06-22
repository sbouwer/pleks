/**
 * app/(dashboard)/listings/[slug]/applications/[id]/page.tsx — Rental application detail view with Stream 2 FitScore surface
 *
 * Route:  /listings/[slug]/applications/[id]
 * Auth:   gatewaySSR (agent workspace — service client, explicit org_id filter on every query)
 * Data:   applications + application_co_applicants + listings → units → properties
 * Notes:  FitScoreReport renders when fitscore_band is set (Stream 2 orchestrator has run).
 *         Legacy pre-band display retained for applications not yet re-run under Stream 2.
 *         ID reveal gated to agent role; logs to audit_log per ADDENDUM_14H §8.7.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §10.7.
 */
import type { ReactNode } from "react"
import { redirect, notFound } from "next/navigation"
import { formatZAR } from "@/lib/constants"
import { getDepositRecommendation } from "@/lib/screening/depositRecommendation"
import { checkVisaLeaseAlignment } from "@/lib/screening/visaLeaseCheck"
import { assembleReportData } from "@/lib/screening/assembleReportData"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { AssigneePicker } from "@/components/work/AssigneePicker"
import { ApplicationActions } from "./ApplicationActions"
import { ApplicationDetailShell } from "./ApplicationDetailShell"
import { DetailCard } from "@/components/detail/DetailCard"
import { DetailFullWidth } from "@/components/detail/DetailPageLayout"
import type { DetailFact, DetailStatus, DetailTab } from "@/lib/detail/types"
import { FitScoreReport } from "@/lib/reports/screening/_web/FitScoreReport"
import { FitScorePdfDownload } from "./_components/FitScorePdfDownload"
import { IdReveal } from "./_components/IdReveal"
import { ScreeningRulingCard, type ScreeningEvaluationRow } from "./_components/ScreeningRulingCard"
import { FreeAssessmentCard } from "./_components/FreeAssessmentCard"
import type { FreeAssessmentResult } from "@/lib/applications/freeAssessment"
import { logQueryError } from "@/lib/supabase/logQueryError"

const STEP1_LABEL: Record<string, string> = {
  "verify-ready": "Verify-ready", "missing-docs": "Missing docs", "does-not-qualify": "Doesn't qualify", incomplete: "Didn't finish",
}

function applicationStatus(stage1: string | null, stage2: string | null): DetailStatus {
  if (stage1 === "not_shortlisted") return { kind: "flag", label: "Declined" }
  if (stage2 === "approved") return { kind: "occupied", label: "Approved" }
  if (stage1 === "shortlisted") return { kind: "occupied", label: "Shortlisted" }
  if (stage1 === "pre_screen_complete") return { kind: "neutral", label: "Submitted" }
  return { kind: "neutral", label: "Application" }
}

function ForeignNationalBanner({ permitType, permitExpiry, tpnLimited, depositRec, visaCheck, immigrationConfirmed }: Readonly<{
  permitType: string | null; permitExpiry: string | null; tpnLimited: boolean
  depositRec: { recommendedMonths: number; reason: string } | null
  visaCheck: { compatible: boolean; warning: string | null } | null
  immigrationConfirmed: boolean
}>) {
  return (
    <DetailFullWidth>
      <div className="rounded-[var(--r-button)] border border-info/30 bg-info-bg p-4 text-sm space-y-1.5">
        <p className="font-medium">Foreign national — limited SA credit data</p>
        <p>Permit: {permitType || "Not specified"} · Expires: {permitExpiry || "—"}</p>
        {tpnLimited && <p className="text-warning">TPN listing limited — cannot be negatively listed on default.</p>}
        {depositRec && <p>Deposit recommendation: {depositRec.recommendedMonths} months — {depositRec.reason}</p>}
        {visaCheck && !visaCheck.compatible && <p className="text-danger">{visaCheck.warning}</p>}
        {!immigrationConfirmed && <p className="text-danger font-medium">Immigration compliance not yet confirmed by agent.</p>}
      </div>
    </DetailFullWidth>
  )
}

function buildFitscorePanel(opts: Readonly<{
  hasStream2: boolean
  reportData: Parameters<typeof FitScoreReport>[0]["data"] | null
  legacyFitComponents: Record<string, { score: number; weight: number }> | null
  fitscore: number | null
  fitscoreSummary: string | null
  applicationId: string
  canGenerateS23: boolean
}>): ReactNode {
  let content: ReactNode = <DetailCard title="FitScore"><p className="text-sm text-muted-foreground">No FitScore yet.</p></DetailCard>
  if (opts.hasStream2 && opts.reportData) {
    content = <FitScoreReport data={opts.reportData} applicationId={opts.applicationId} canGenerateS23={opts.canGenerateS23} />
  } else if (opts.legacyFitComponents) {
    content = (
      <DetailCard title={`FitScore · ${opts.fitscore}/100`}>
        <div className="space-y-2 text-sm">
          {Object.entries(opts.legacyFitComponents).map(([key, comp]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-muted-foreground capitalize">{key.replaceAll("_", " ")}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-border rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full" style={{ width: `${comp.score}%` }} /></div>
                <span className="w-12 text-right">{comp.score}/100</span>
                <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(comp.weight * 100)}%</span>
              </div>
            </div>
          ))}
          {opts.fitscoreSummary && <p className="pt-2 text-sm whitespace-pre-wrap border-t border-border">{opts.fitscoreSummary}</p>}
        </div>
      </DetailCard>
    )
  }
  return <DetailFullWidth>{content}</DetailFullWidth>
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { slug, id } = await params
  const initialTab = (await searchParams).tab ?? "applicant"
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: app, error: appErr } = await db
    .from("applications")
    .select(`
      id, org_id, assigned_user_id, assigned_team_id, first_name, last_name, applicant_email, applicant_phone,
      id_type, id_number, employment_type, employer_name,
      gross_monthly_income_cents, bank_statement_extracted,
      applicant_nationality_type, is_foreign_national,
      permit_type, permit_expiry_date, tpn_listing_limited,
      immigration_compliance_confirmed,
      pleks_network_history_status, pleks_network_tenancy_count,
      identity_match_status, employer_verification_status,
      salary_reconciliation_status, document_consistency_status,
      bank_account_ownership_status,
      free_assessment,
      stage1_status, stage2_status,
      fitscore, fitscore_band, fitscore_confidence_index,
      fitscore_verification_integrity, fitscore_material_flags,
      fitscore_components, fitscore_component_snapshot, fitscore_narrative,
      fitscore_computed_at, fitscore_engine_version,
      fitscore_narrative_prompt_version, fitscore_interpretation_version,
      fitscore_synthesis_template_version, fitscore_inputs_hash,
      fitscore_summary, has_co_applicant,
      applicant_motivation, motivation_doc_path, agent_notes,
      listing_id, unit_id,
      listings(asking_rent_cents, units(unit_number, properties(name, address_line1)))
    `)
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (appErr || !app) notFound()

  const { data: coApplicants, error: coApplicantsError } = await db
    .from("application_co_applicants")
    .select(`
      id, first_name, last_name, id_type, co_applicant_index,
      identity_match_status, employer_verification_status,
      salary_reconciliation_status, document_consistency_status,
      bank_account_ownership_status,
      pleks_network_history_status, pleks_network_tenancy_count
    `)
    .eq("primary_application_id", id)
    .order("co_applicant_index", { ascending: true })
    logQueryError("ApplicationDetailPage application_co_applicants", coApplicantsError)

  // Latest 14M pre-screen ruling (ADDENDUM_14M) — the two-axis evaluation + flags + reconciliation.
  const { data: screeningEval, error: screeningEvalErr } = await db
    .from("application_screening_evaluations")
    .select("iteration_number, ruling_tier, affordability_tier, affordability_ratio_pct, demonstrated_housing_cents, confidence_tier, flags, reconciliation, fraud_signals, reconciler_version, ruling_version, generated_at")
    .eq("application_id", id).eq("org_id", orgId)
    .order("iteration_number", { ascending: false }).limit(1).maybeSingle()
  logQueryError("ApplicationDetailPage screening_evaluation", screeningEvalErr)

  const [{ data: idCap }, { data: s23Cap }, { data: orgRow }] = await Promise.all([
    db
      .from("user_capabilities")
      .select("id")
      .eq("user_id", gw.userId)
      .eq("org_id", orgId)
      .eq("capability_name", "can_view_sensitive_identity_data")
      .maybeSingle(),
    db
      .from("user_capabilities")
      .select("id")
      .eq("user_id", gw.userId)
      .eq("org_id", orgId)
      .eq("capability_name", "can_generate_popia_s23")
      .maybeSingle(),
    db.from("organisations").select("name").eq("id", orgId).single(),
  ])

  const canViewId      = !!idCap
  const canGenerateS23 = !!s23Cap

  const listing = app.listings as unknown as {
    asking_rent_cents: number
    units: { unit_number: string; properties: { name: string; address_line1: string } }
  } | null

  const name = `${app.first_name || ""} ${app.last_name || ""}`.trim()

  // Step-1 free assessment (the administrative readiness checklist; zero-AI, declared/unverified). Replaces the
  // legacy prescreen_score box; verified figures live in the Step-2 ruling card below. (ADDENDUM_14M funnel)
  const fa = app.free_assessment as FreeAssessmentResult | null

  const permitExpiry = app.permit_expiry_date ? new Date(app.permit_expiry_date) : null
  const depositRec = app.is_foreign_national
    ? getDepositRecommendation(true, app.applicant_nationality_type, permitExpiry)
    : null

  const visaCheck = app.is_foreign_national && app.permit_expiry_date
    ? checkVisaLeaseAlignment(new Date(app.permit_expiry_date), null)
    : null

  // Legacy v0 FitScore components (pre-Stream 2 — nested .components structure)
  const legacyFitComponents = (() => {
    const raw = app.fitscore_components as Record<string, unknown> | null
    if (!raw || app.fitscore_band) return null
    return raw.components as Record<string, { score: number; weight: number }> | null
  })()

  const hasStream2 = !!app.fitscore_band

  // Assemble FitScoreReportData for the dashboard surface (same shape as PDF)
  const reportData = hasStream2
    ? assembleReportData(app, coApplicants ?? [], orgRow?.name ?? 'Pleks')
    : null

  // ── Header model ──────────────────────────────────────────────────────────
  const rentCents = (listing?.asking_rent_cents as number | undefined) ?? 0
  const incomeCents = (app.gross_monthly_income_cents as number | null) ?? 0
  const ratioPct = fa?.declaredRatioPct ?? (incomeCents > 0 && rentCents > 0 ? Math.round((rentCents / incomeCents) * 100) : null)
  const status = applicationStatus(app.stage1_status as string | null, app.stage2_status as string | null)
  let badge = "INDIVIDUAL"
  if (app.has_co_applicant) badge = "JOINT"
  else if (app.is_foreign_national) badge = "FOREIGN"

  const facts: DetailFact[] = [
    { k: "Rent", v: rentCents ? `${formatZAR(rentCents)}/mo` : "—", mono: true },
    { k: "Stated income", v: incomeCents ? `${formatZAR(incomeCents)}/mo` : "—", mono: true },
    { k: "Rent-to-income", v: ratioPct != null ? `${ratioPct}%` : "—" },
  ]
  if (fa?.rollup) facts.push({ k: "Step 1", v: STEP1_LABEL[fa.rollup] ?? fa.rollup })
  if (app.fitscore != null) facts.push({ k: "FitScore", v: `${app.fitscore}/100`, tone: "ok" })

  const hasFitscore = hasStream2 || app.fitscore != null
  const tabs: DetailTab[] = [
    { id: "applicant", label: "Applicant & documents" },
    { id: "assessment", label: "Assessment" },
  ]
  if (hasFitscore) tabs.push({ id: "fitscore", label: "FitScore" })

  const actions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {hasStream2 && <FitScorePdfDownload applicationId={id} />}
      <ApplicationActions
        applicationId={id}
        orgId={app.org_id}
        stage1Status={app.stage1_status}
        stage2Status={app.stage2_status}
        isForeignNational={app.is_foreign_national}
        immigrationConfirmed={app.immigration_compliance_confirmed}
      />
    </div>
  )

  // ── Tab 1 · Applicant & documents ───────────────────────────────────────────
  const applicantPanel = (
    <>
      <DetailFullWidth>
        <div className="max-w-xs">
          <AssigneePicker workTable="applications" recordId={id} currentAssigneeId={(app.assigned_user_id as string | null) ?? null} currentTeamId={(app.assigned_team_id as string | null) ?? null} />
        </div>
      </DetailFullWidth>

      {app.is_foreign_national && (
        <ForeignNationalBanner
          permitType={app.permit_type as string | null}
          permitExpiry={app.permit_expiry_date as string | null}
          tpnLimited={!!app.tpn_listing_limited}
          depositRec={depositRec}
          visaCheck={visaCheck}
          immigrationConfirmed={!!app.immigration_compliance_confirmed}
        />
      )}

      <DetailCard title="Applicant details">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Email</span><span className="text-right">{app.applicant_email}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Phone</span><span>{app.applicant_phone || "—"}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">ID type</span><span className="capitalize">{app.id_type?.replaceAll("_", " ") || "—"}</span></div>
          <IdReveal applicationId={id} idType={app.id_type} hasIdNumber={!!app.id_number} hasCapability={canViewId} />
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Employment</span><span className="capitalize">{app.employment_type || "—"}</span></div>
          {app.employer_name && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Employer</span><span>{app.employer_name}</span></div>}
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Stated income</span><span>{incomeCents ? `${formatZAR(incomeCents)}/mo` : "—"}</span></div>
        </div>
      </DetailCard>

      <DetailCard title="Documents" count={fa?.documents?.length}>
        {fa?.documents && fa.documents.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {fa.documents.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3">
                <span className="text-foreground">{d.label}{d.required && <span className="text-muted-foreground"> · required</span>}</span>
                <span className={d.present ? "text-success" : "text-warning"}>{d.present ? "✓ uploaded" : "✗ missing"}</span>
              </li>
            ))}
            <li className="pt-1.5 text-xs text-muted-foreground border-t border-border">Uploaded, unverified — contents are checked in the Step-2 deep scan.</li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No itemised documents for this record.</p>
        )}
      </DetailCard>

      <DetailFullWidth>
        <DetailCard title="Applicant motivation">
          {app.applicant_motivation ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">In the applicant&apos;s own words — not processed by AI.</p>
              <p className="text-sm whitespace-pre-wrap">&ldquo;{app.applicant_motivation}&rdquo;</p>
              {app.motivation_doc_path && <p className="text-xs text-muted-foreground mt-2">Supporting document attached.</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No motivation provided.</p>
          )}
        </DetailCard>
      </DetailFullWidth>

      <DetailFullWidth>
        <DetailCard title="Agent notes">
          <p className="text-sm text-muted-foreground">{app.agent_notes || "No notes yet."}</p>
        </DetailCard>
      </DetailFullWidth>
    </>
  )

  // ── Tab 2 · Assessment (Step 1 free | Step 2 verified) ──────────────────────
  const assessmentPanel = (
    <>
      <FreeAssessmentCard assessment={fa} rentCents={rentCents} />
      {screeningEval
        ? <ScreeningRulingCard evaluation={screeningEval as unknown as ScreeningEvaluationRow} />
        : (
          <DetailCard title="Verified ruling · Step 2">
            <p className="text-sm text-muted-foreground">Not yet deep-scanned. The verified ruling — corroborated income, document confidence and fraud signals — appears here once this applicant is shortlisted and scanned.</p>
          </DetailCard>
        )}
    </>
  )

  // ── Tab 3 · FitScore (only if it exists) ────────────────────────────────────
  const fitscorePanel = buildFitscorePanel({
    hasStream2, reportData, legacyFitComponents,
    fitscore: app.fitscore as number | null, fitscoreSummary: app.fitscore_summary as string | null,
    applicationId: id, canGenerateS23,
  })

  return (
    <ApplicationDetailShell
      backHref={`/listings/${slug}`}
      title={name}
      status={status}
      badge={badge}
      sub={listing ? `${listing.units.unit_number}, ${listing.units.properties.name}` : undefined}
      facts={facts}
      actions={actions}
      tabs={tabs}
      initialTab={initialTab}
      panels={{ applicant: applicantPanel, assessment: assessmentPanel, fitscore: fitscorePanel }}
    />
  )
}
