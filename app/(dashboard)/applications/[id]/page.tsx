import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import { getDepositRecommendation } from "@/lib/screening/depositRecommendation"
import { checkVisaLeaseAlignment } from "@/lib/screening/visaLeaseCheck"
import { ApplicationActions } from "./ApplicationActions"
import { BackLink } from "@/components/ui/BackLink"

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: app } = await supabase
    .from("applications")
    .select("*, listings(asking_rent_cents, units(unit_number, properties(name, address_line1)))")
    .eq("id", id)
    .single()

  if (!app) notFound()

  const listing = app.listings as unknown as { asking_rent_cents: number; units: { unit_number: string; properties: { name: string; address_line1: string } } } | null
  const name = `${app.first_name || ""} ${app.last_name || ""}`.trim()
  const bankData = app.bank_statement_extracted as Record<string, unknown> | null

  // Deposit recommendation for foreign nationals
  const permitExpiry = app.permit_expiry_date ? new Date(app.permit_expiry_date) : null
  const depositRec = app.is_foreign_national
    ? getDepositRecommendation(true, app.applicant_nationality_type, permitExpiry)
    : null

  // Visa-lease alignment
  const visaCheck = app.is_foreign_national && app.permit_expiry_date
    ? checkVisaLeaseAlignment(new Date(app.permit_expiry_date), null)
    : null

  // FitScore components
  const fitComponents = app.fitscore_components as Record<string, unknown> | null

  return (
    <div>
      <BackLink href="/applications" label="Applications" />
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/applications" className="hover:text-foreground">Applications</Link> &rsaquo; {name}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl">{name}</h1>
            {app.fitscore !== null && (
              <span className="font-heading text-2xl text-brand">{app.fitscore}/100</span>
            )}
          </div>
          <p className="text-muted-foreground">
            {listing ? `${listing.units.unit_number}, ${listing.units.properties.name}` : ""}
            {app.is_foreign_national && " · Foreign national"}
            {app.has_co_applicant && " · Joint application"}
          </p>
        </div>
        <ApplicationActions
          applicationId={id}
          orgId={app.org_id}
          stage1Status={app.stage1_status}
          stage2Status={app.stage2_status}
          isForeignNational={app.is_foreign_national}
          immigrationConfirmed={app.immigration_compliance_confirmed}
        />
      </div>

      {/* Foreign national warnings */}
      {app.is_foreign_national && (
        <Card className="mb-4 border-info/30 bg-info-bg">
          <CardContent className="pt-4 text-sm space-y-2">
            <p className="font-medium">Foreign National — Limited SA Credit Data</p>
            <p>Permit: {app.permit_type || "Not specified"} · Expires: {app.permit_expiry_date || "—"}</p>
            {app.tpn_listing_limited && (
              <p className="text-warning">TPN listing limited — cannot be negatively listed in event of default.</p>
            )}
            {depositRec && (
              <p>Deposit recommendation: {depositRec.recommendedMonths} months — {depositRec.reason}</p>
            )}
            {visaCheck && !visaCheck.compatible && (
              <p className="text-danger">{visaCheck.warning}</p>
            )}
            {!app.immigration_compliance_confirmed && (
              <p className="text-danger font-medium">Immigration compliance not yet confirmed by agent.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal details */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Applicant Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{app.applicant_email}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{app.applicant_phone || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ID Type</span><span className="capitalize">{app.id_type?.replaceAll("_", " ") || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Employment</span><span className="capitalize">{app.employment_type || "—"}</span></div>
            {app.employer_name && <div className="flex justify-between"><span className="text-muted-foreground">Employer</span><span>{app.employer_name}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Stated Income</span><span>{app.gross_monthly_income_cents ? formatZAR(app.gross_monthly_income_cents) + "/mo" : "—"}</span></div>
          </CardContent>
        </Card>

        {/* Pre-screen (Stage 1) */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Pre-screen (Stage 1)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span className="font-heading">{app.prescreen_score ?? "—"}/45</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Income</span><span>{app.prescreen_income_score ?? "—"}/25</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Employment</span><span>{app.prescreen_employment_score ?? "—"}/15</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">References</span><span>{app.prescreen_refs_score ?? "—"}/5</span></div>
            {app.prescreen_affordability_flag && (
              <p className="text-warning text-xs">Affordability concern — rent exceeds 30% of income</p>
            )}
            {bankData && (
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground mb-1">Bank Statement Analysis</p>
                <p>Income: {(bankData.avg_monthly_income_cents as number) ? formatZAR(bankData.avg_monthly_income_cents as number) + "/mo" : "—"}</p>
                <p>Consistency: {bankData.income_consistency ? `${Math.round((bankData.income_consistency as number) * 100)}%` : "—"}</p>
                {(bankData.bounced_debit_orders as number) > 0 && <p className="text-danger">Bounced debits: {bankData.bounced_debit_orders as number}</p>}
                {(bankData.red_flags as string[])?.length > 0 && <p className="text-warning">Flags: {(bankData.red_flags as string[]).join(", ")}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FitScore (Stage 2) */}
      {app.fitscore !== null && fitComponents && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">FitScore (Stage 2) — {app.fitscore}/100</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.entries((fitComponents as Record<string, unknown>).components as Record<string, { score: number; weight: number }> || {}).map(([key, comp]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground capitalize">{key.replaceAll("_", " ")}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${comp.score}%` }} />
                  </div>
                  <span className="w-12 text-right">{comp.score}/100</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(comp.weight * 100)}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* FitScore narrative */}
      {app.fitscore_summary && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-lg">AI Summary</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{app.fitscore_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Motivation */}
      <Card className="mt-4">
        <CardHeader><CardTitle className="text-lg">Applicant Motivation</CardTitle></CardHeader>
        <CardContent>
          {app.applicant_motivation ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">In applicant&apos;s own words — not processed by AI</p>
              <p className="text-sm whitespace-pre-wrap">&ldquo;{app.applicant_motivation}&rdquo;</p>
              {app.motivation_doc_path && <p className="text-xs text-muted-foreground mt-2">Supporting document attached</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No motivation provided</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">This information is not reflected in the pre-screen score.</p>
        </CardContent>
      </Card>

      {/* Agent notes */}
      <Card className="mt-4">
        <CardHeader><CardTitle className="text-lg">Agent Notes</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{app.agent_notes || "No notes yet."}</p>
        </CardContent>
      </Card>
    </div>
  )
}
