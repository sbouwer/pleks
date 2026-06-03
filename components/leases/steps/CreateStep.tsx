"use client"

/**
 * components/leases/steps/CreateStep.tsx — step 4 of the lease modal: the document-source fork (moved to the end)
 *
 * Auth:   client-only; the chosen create action (createLease / createUploadedLease) enforces requireAgentWriteAccess
 * Data:   reads WizardData via context; default source from organisations.default_lease_document_source (Phase 3, optional)
 * Notes:  ADDENDUM_LEASE_CREATION_MODAL §1/§2/D-3,D-4,D-7,D-10. "Generate with Pleks" → createLease (template_source
 *         stays 'pleks', server-redirects to the lease); "Upload signed lease" → file picker + createUploadedLease
 *         ('uploaded'). LeaseDisclaimerGate gates the GENERATE branch only (D-10). When the org default column is
 *         absent/null the fork is shown (degrade gracefully — do NOT add the column, that's Phase 3). Registers a
 *         submit handler the footer's "Create lease" invokes; create never advances the wizard (it navigates away).
 */
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Paperclip, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useOrg } from "@/hooks/useOrg"
import { createLease, createUploadedLease } from "@/lib/actions/leases"
import { LeaseDisclaimerGate } from "@/components/leases/LeaseDisclaimerGate"
import { writeBackUnitRuleSet } from "@/lib/actions/units"
import { determineCpaApplicability } from "@/lib/leases/cpaApplicability"
import { useLeaseWizard } from "../LeaseWizardContext"
import type { WizardData } from "../wizardData"
import type { StepHandle } from "../stepHandle"

type Source = "pleks" | "uploaded"

interface Props {
  register: (handle: StepHandle) => void
  /** initial disclaimer-acceptance state resolved server-side (Pleks-generated liability disclaimer). */
  disclaimerAccepted: boolean
}

/** Map the org's stored default ('pleks'/'external') onto the per-lease source axis, or null when undecided. */
function defaultSourceFromOrg(org: Record<string, unknown> | null): Source | null {
  const raw = org?.default_lease_document_source
  if (raw === "pleks") return "pleks"
  if (raw === "external") return "uploaded"
  return null
}

/** Shared lease fields written by both create paths. */
function appendCommonFields(formData: FormData, data: WizardData, cpaApplies: boolean) {
  formData.set("unit_id", data.unitId)
  formData.set("property_id", data.propertyId)
  formData.set("tenant_id", data.tenantId)
  formData.set("lease_type", data.leaseType)
  formData.set("tenant_is_juristic", String(data.tenantIsJuristic))
  formData.set("cpa_applies", String(cpaApplies))
  formData.set("start_date", data.startDate)
  if (data.endDate) formData.set("end_date", data.endDate)
  formData.set("is_fixed_term", String(data.isFixedTerm))
  formData.set("notice_period_days", data.noticePeriod)
  formData.set("rent_amount", data.rent)
  formData.set("payment_due_day", data.paymentDueDay)
  formData.set("escalation_percent", data.escalationPercent)
  formData.set("escalation_type", data.escalationType)
  if (data.deposit) formData.set("deposit_amount", data.deposit)
  if (data.coTenants.length > 0) formData.set("co_tenants_json", JSON.stringify(data.coTenants.map((c) => c.id)))
}

function buildGeneratedFormData(data: WizardData, cpaApplies: boolean): FormData {
  const formData = new FormData()
  appendCommonFields(formData, data, cpaApplies)
  formData.set("is_franchise_agreement", String(data.isFranchiseAgreement))
  formData.set("deposit_interest_to", data.depositInterestTo)
  formData.set("deposit_interest_rate", data.depositInterestRate)
  formData.set("arrears_interest_enabled", String(data.arrearsInterestEnabled))
  formData.set("arrears_interest_margin", data.arrearsMargin)
  formData.set("special_terms", JSON.stringify(data.specialTerms.filter((t) => t.detail.trim())))
  formData.set("clause_selections", JSON.stringify(data.clauseSelections))
  if (data.acknowledgedConflicts.length > 0) formData.set("acknowledged_conflicts", JSON.stringify(data.acknowledgedConflicts))
  if (data.charges.length > 0) formData.set("charges_json", JSON.stringify(data.charges))
  if (data.onceOffCharges.length > 0) formData.set("once_off_charges_json", JSON.stringify(data.onceOffCharges))
  return formData
}

function buildUploadedFormData(data: WizardData, cpaApplies: boolean, file: File | null): FormData {
  const formData = new FormData()
  appendCommonFields(formData, data, cpaApplies)
  if (file) formData.set("document", file)
  return formData
}

function ForkCard({
  active, icon, title, description, onClick, children,
}: Readonly<{ active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void; children?: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border bg-card p-5 transition-colors",
        active ? "border-brand ring-1 ring-brand bg-brand/5" : "border-border/60 hover:border-brand/40 hover:bg-brand/5"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{description}</p>
      {children}
    </button>
  )
}

export function CreateStep({ register, disclaimerAccepted }: Readonly<Props>) {
  const { data } = useLeaseWizard()
  const { org } = useOrg()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [source, setSource] = useState<Source | null>(() => defaultSourceFromOrg(org))
  const [sourceTouched, setSourceTouched] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [accepted, setAccepted] = useState(disclaimerAccepted)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [error, setError] = useState("")

  // useOrg() resolves async — apply the org's default source once it lands, unless the user already chose (D-7).
  const orgDefault = defaultSourceFromOrg(org)
  useEffect(() => {
    if (!sourceTouched && source === null && orgDefault) setSource(orgDefault)
  }, [orgDefault, source, sourceTouched])

  function chooseSource(next: Source) {
    setSourceTouched(true)
    setSource(next)
  }

  const cpaDetermination = determineCpaApplicability({
    tenant: {
      entityType: data.tenantIsJuristic ? "organisation" : "individual",
      juristicType: data.tenantJuristicType,
      turnoverUnder2m: data.tenantTurnoverUnder2m,
      assetValueUnder2m: data.tenantAssetUnder2m,
      sizeBandsCapturedAt: data.tenantSizeBandsCapturedAt,
    },
    lease: { isFranchiseAgreement: data.isFranchiseAgreement },
  })
  const cpaApplies = cpaDetermination.applies === "yes"

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) return
    if (f.type !== "application/pdf") { toast.error("PDF files only"); return }
    if (f.size > 20 * 1024 * 1024) { toast.error("Max 20 MB"); return }
    setFile(f)
  }

  function removeFile() {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // Write back rule-set fields whose unit column is empty (§3). The action re-checks the live unit and
  // only fills currently-empty columns — populated unit values stay put and the lease keeps its override.
  // Best-effort, non-fatal.
  async function runWriteBack() {
    try {
      const rentCents = data.rent ? Math.round(Number.parseFloat(data.rent) * 100) : null
      await writeBackUnitRuleSet(data.unitId, { askingRentCents: rentCents })
    } catch { /* non-fatal — the canonical store is enriched best-effort */ }
  }

  async function runCreate(): Promise<void> {
    await runWriteBack()
    if (source === "pleks") {
      const result = await createLease(buildGeneratedFormData(data, cpaApplies)) // redirects on success
      if (result?.error) { toast.error(result.error); setError(result.error) }
      return
    }
    const result = await createUploadedLease(buildUploadedFormData(data, cpaApplies, file))
    if ("error" in result) { toast.error(result.error); setError(result.error); return }
    router.push(`/leases/${result.leaseId}`)
  }

  // The footer "Create lease" calls this. Create navigates away on success, so it never advances the wizard
  // (returns void per the StepHandle contract).
  async function submit(): Promise<void> {
    setError("")
    if (!data.unitId || !data.propertyId || !data.tenantId) { toast.error("Missing required fields"); return }
    if (!cpaDetermination.canActivate) {
      setError("CPA status is indeterminate. Go back to the Tenant step and confirm the tenant's size bands.")
      return
    }
    if (!source) { setError("Choose how to create this lease."); return }
    if (source === "pleks" && !accepted) { setShowDisclaimer(true); return } // D-10: gate generate branch only
    await runCreate()
  }

  register({ submit })

  function handleDisclaimerAccepted() {
    setAccepted(true)
    setShowDisclaimer(false)
  }

  return (
    <div className="space-y-6">
      {data.unitLabel && (
        <p className="text-sm text-muted-foreground">{data.unitLabel} — {data.propertyName}</p>
      )}

      <p className="text-sm font-medium">How would you like to create this lease?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ForkCard
          active={source === "pleks"}
          icon={<FileText className="size-5 text-brand" />}
          title="Generate with Pleks"
          description="Build an SA-compliant lease from your Pleks template, with clauses, annexures, and digital signing."
          onClick={() => chooseSource("pleks")}
        >
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Standard + optional clauses</li>
            <li>• Four annexures</li>
            <li>• Conflict checker</li>
            <li>• Digital signing (DocuSeal / wet ink)</li>
          </ul>
        </ForkCard>

        <ForkCard
          active={source === "uploaded"}
          icon={<Paperclip className="size-5 text-brand" />}
          title="Upload signed lease"
          description="Upload a signed lease or your agency's own template. Pleks tracks the key terms for invoicing and arrears."
          onClick={() => chooseSource("uploaded")}
        >
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Your own clause set & signing</li>
            <li>• Pleks tracks rent, deposit, dates</li>
            <li>• Escalation & payment day</li>
          </ul>
        </ForkCard>
      </div>

      {/* Upload branch — file picker */}
      {source === "uploaded" && (
        <div className="space-y-3">
          {file ? (
            <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <Paperclip className="size-4 text-brand shrink-0" />
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              </div>
              <button type="button" onClick={removeFile} className="text-muted-foreground hover:text-danger ml-2"><X className="size-4" /></button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-border/60 hover:border-brand/40 transition-colors px-6 py-8 flex flex-col items-center gap-2 text-center"
            >
              <Paperclip className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Drop your lease PDF here</p>
              <p className="text-xs text-muted-foreground">or click to browse · PDF only · Max 20 MB · optional, you can upload later</p>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <p className="text-xs text-muted-foreground">
        Both paths create a <span className="font-medium">draft</span> lease that drives invoicing, arrears, deposits, and
        renewal notices. You activate it from the lease page after signing, deposit receipt, and move-in inspection.
      </p>

      {/* Disclaimer gate — only the generate branch (D-10). Shown on demand from submit(); its own
          scroll-to-accept overlay records acceptance, then onAccepted unblocks the footer's Create. */}
      {showDisclaimer && (
        <LeaseDisclaimerGate initialAccepted={false} onAccepted={handleDisclaimerAccepted}>
          <p className="text-sm text-muted-foreground">
            Accept the lease template disclaimer to generate the lease, then press “Create lease” again.
          </p>
        </LeaseDisclaimerGate>
      )}
    </div>
  )
}
