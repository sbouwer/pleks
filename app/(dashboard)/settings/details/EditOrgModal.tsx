"use client"

/**
 * app/(dashboard)/settings/details/EditOrgModal.tsx — the org-details editor (Organisation → Details cards)
 *
 * Route:  opened from OrgDetailsCards (Organisation → Details tab)
 * Auth:   client island; org steps → PATCH /api/org/details; banking → saveOrgBusinessAccount (agent write gate)
 * Data:   seeded from the cards' loaded org + business account; opens jumped to the clicked card's step.
 * Notes:  Same WizardModal door-grammar as the supplier/party edit modal. Steps: Organisation · Contact ·
 *         Address · Banking. Banking edits the BUSINESS (operating) account only; trust accounts show
 *         read-only with an info note routing to the Trust account section (a separate, governed process).
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { WizardModal } from "@/components/ui/wizard-modal"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { FieldGrid, TextField, SelectField, type FieldOption } from "@/components/forms/fields"
import { SA_PROVINCES } from "@/lib/constants"
import { saveOrgBusinessAccount, type OrgBusinessAccount, type OrgTrustAccountSummary } from "@/lib/actions/orgBanking"
import type { OrgFormState, OrgStepId } from "./types"

const STEPS: { id: OrgStepId | "banking"; label: string }[] = [
  { id: "organisation", label: "Organisation" },
  { id: "contact", label: "Contact details" },
  { id: "address", label: "Address" },
  { id: "banking", label: "Banking" },
]

const PROVINCE_OPTIONS: FieldOption[] = [{ value: "", label: "Province…" }, ...SA_PROVINCES.map((p) => ({ value: p, label: p }))]
const ADDRESS_TYPE_OPTIONS: FieldOption[] = [
  { value: "", label: "Type…" },
  ...["residential", "postal", "work", "business", "other"].map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
]
const ACCOUNT_TYPE_OPTIONS: FieldOption[] = [
  { value: "", label: "Account type…" },
  { value: "cheque", label: "Cheque" },
  { value: "savings", label: "Savings" },
  { value: "transmission", label: "Transmission" },
]

const TRUST_TYPE_LABEL: Record<string, string> = { trust: "Trust account", ppra_trust: "PPRA trust", deposit_holding: "Deposit holding" }
const mask = (n: string | null) => (n && n.length >= 4 ? `••••${n.slice(-4)}` : n || "—")

/** Parse a user-typed URL/domain to its lowercased hostname, or null if it lacks a real domain + TLD. */
function parseHost(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  try {
    const host = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase()
    return host.includes(".") && /\.[a-z]{2,}$/.test(host) ? host : null
  } catch { return null }
}

/** Per-social expected-domain checks (the field is labelled, so the host should match the platform). */
const SOCIAL_RULES: Record<"linkedin_url" | "facebook_url" | "instagram_url" | "x_url", { name: string; match: (host: string) => boolean }> = {
  linkedin_url: { name: "LinkedIn", match: (h) => h.includes("linkedin.") || h.includes("lnkd.in") },
  facebook_url: { name: "Facebook", match: (h) => h.includes("facebook.") || h.includes("fb.com") || h.includes("fb.me") },
  instagram_url: { name: "Instagram", match: (h) => h.includes("instagram.") || h.includes("instagr.am") },
  x_url: { name: "X", match: (h) => h === "x.com" || h.endsWith(".x.com") || h.includes("twitter.") || h.includes("t.co") },
}

type BizState = { bank_name: string; account_holder: string; account_number: string; branch_code: string; account_type: string }

function AddressBlock({ prefix, form, set, onRemove }: Readonly<{
  prefix: "addr" | "addr2"; form: OrgFormState; set: (f: keyof OrgFormState, v: string) => void; onRemove?: () => void
}>) {
  const t = (col: string) => `${prefix}_${col}` as keyof OrgFormState
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {prefix === "addr" ? "Primary" : "Additional"}
        </span>
        {onRemove && (
          <button type="button" onClick={onRemove}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive">Remove</button>
        )}
      </div>
      <FieldGrid>
        <TextField label="Street address" value={form[t("line1")]} onChange={(v) => set(t("line1"), v)} span placeholder="14 Rose Street" />
        <TextField label="Suburb" value={form[t("suburb")]} onChange={(v) => set(t("suburb"), v)} placeholder="Sea Point" />
        <TextField label="City / Town" value={form[t("city")]} onChange={(v) => set(t("city"), v)} placeholder="Cape Town" />
        <SelectField label="Province" value={form[t("province")]} onChange={(v) => set(t("province"), v)} options={PROVINCE_OPTIONS} />
        <TextField label="Postal code" value={form[t("postal_code")]} onChange={(v) => set(t("postal_code"), v)} maxLength={4} placeholder="8005" />
        <SelectField label="Address type" value={form[t("type")]} onChange={(v) => set(t("type"), v)} options={ADDRESS_TYPE_OPTIONS} />
      </FieldGrid>
    </div>
  )
}

export function EditOrgModal({
  open, onOpenChange, initialStep, data, business, trust, isAgency, onSaved,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  initialStep: OrgStepId | "banking"
  data: OrgFormState
  business: OrgBusinessAccount | null
  trust: OrgTrustAccountSummary[]
  isAgency: boolean
  onSaved?: () => void
}>) {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [form, setForm] = useState<OrgFormState>(data)
  const [biz, setBiz] = useState<BizState>({ bank_name: "", account_holder: "", account_number: "", branch_code: "", account_type: "" })
  const [showSecondAddr, setShowSecondAddr] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trustNote, setTrustNote] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setForm(data)
    setBiz({
      bank_name: business?.bank_name ?? "", account_holder: business?.account_holder ?? "",
      account_number: business?.account_number ?? "", branch_code: business?.branch_code ?? "",
      account_type: business?.account_type ?? "",
    })
    setShowSecondAddr(!!data.addr2_line1)
    setError(null)
    setFieldErrors({})
    const idx = STEPS.findIndex((s) => s.id === initialStep)
    setCurrent(Math.max(0, idx))
  }, [open, initialStep, data, business])

  const set = (k: keyof OrgFormState, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v || null }))
    setFieldErrors((prev) => (prev[k] ? (() => { const n = { ...prev }; delete n[k]; return n })() : prev))
  }
  const setBizField = (k: keyof BizState, v: string) => setBiz((prev) => ({ ...prev, [k]: v }))

  /** Validate website + social URLs (require a real domain/TLD; socials must match their platform). */
  function validateLinks(): Record<string, string> {
    const e: Record<string, string> = {}
    const website = (form.website ?? "").trim()
    if (website && !parseHost(website)) e.website = "Include a domain, e.g. example.com"
    for (const key of Object.keys(SOCIAL_RULES) as Array<keyof typeof SOCIAL_RULES>) {
      const val = (form[key] ?? "").trim()
      if (!val) continue
      const host = parseHost(val)
      if (!host) e[key] = "Include a domain, e.g. example.com"
      else if (!SOCIAL_RULES[key].match(host)) e[key] = `Use a ${SOCIAL_RULES[key].name} link`
    }
    return e
  }

  function removeSecondAddr() {
    setShowSecondAddr(false)
    setForm((prev) => ({ ...prev, addr2_type: null, addr2_line1: null, addr2_suburb: null, addr2_city: null, addr2_province: null, addr2_postal_code: null }))
  }

  async function saveOrg() {
    const linkErrors = validateLinks()
    if (Object.keys(linkErrors).length > 0) {
      setFieldErrors(linkErrors)
      setCurrent(1) // website + socials live on the Contact step
      setError("Please fix the highlighted links.")
      return
    }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/org/details", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (res.ok) { toast.success("Details saved"); onSaved?.(); onOpenChange(false) }
      else setError("Couldn't save — please try again.")
    } catch { setError("Couldn't save — please try again.") }
    finally { setSaving(false) }
  }

  async function saveBanking() {
    setSaving(true); setError(null)
    const res = await saveOrgBusinessAccount({
      bank_name: biz.bank_name, account_holder: biz.account_holder,
      account_number: biz.account_number, branch_code: biz.branch_code, account_type: biz.account_type,
    })
    setSaving(false)
    if ("error" in res) { setError(res.error); return }
    toast.success("Banking saved"); onSaved?.(); onOpenChange(false)
  }

  const onBanking = current === 3
  const steps = STEPS.map((s) => ({ ...s, done: true }))

  return (
    <>
      <WizardModal
        open={open}
        onOpenChange={onOpenChange}
        eyebrow="ORGANISATION"
        steps={steps}
        current={current}
        onStepSelect={setCurrent}
        title={STEPS[current].label}
        backLabel="Close"
        onBack={() => onOpenChange(false)}
        primaryLabel={saving ? "Saving…" : "Save changes"}
        onPrimary={onBanking ? saveBanking : saveOrg}
        primaryDisabled={saving}
        footerError={error}
      >
        {current === 0 && (
          <FieldGrid>
            <TextField label="Legal entity name" value={form.name} onChange={(v) => set("name", v)} required span placeholder="Coastline Holdings (Pty) Ltd" />
            <TextField label="Trading as" value={form.trading_as} onChange={(v) => set("trading_as", v)} placeholder="Coastline Rentals" />
            <TextField label="CIPC registration" value={form.reg_number} onChange={(v) => set("reg_number", v)} required={isAgency} placeholder="2020/123456/07" />
            <TextField label="EAAB / FFC number" value={form.eaab_number} onChange={(v) => set("eaab_number", v)} required={isAgency} placeholder="Estate agencies only" />
            <TextField label="VAT number" value={form.vat_number} onChange={(v) => set("vat_number", v)} placeholder="Optional" />
          </FieldGrid>
        )}

        {current === 1 && (
          <div className="space-y-6">
            <FieldGrid>
              <TextField label="Email" value={form.email} onChange={(v) => set("email", v)} required type="email" placeholder="info@agency.co.za" />
              <TextField label="Phone" value={form.phone} onChange={(v) => set("phone", v)} type="tel" placeholder="021 000 0000" />
              <TextField label="Website" value={form.website} onChange={(v) => set("website", v)} type="url" span placeholder="example.com" error={fieldErrors.website} />
            </FieldGrid>
            <div>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Social</p>
              <FieldGrid>
                <TextField label="LinkedIn" value={form.linkedin_url} onChange={(v) => set("linkedin_url", v)} type="url" placeholder="linkedin.com/company/…" error={fieldErrors.linkedin_url} />
                <TextField label="Facebook" value={form.facebook_url} onChange={(v) => set("facebook_url", v)} type="url" placeholder="facebook.com/…" error={fieldErrors.facebook_url} />
                <TextField label="Instagram" value={form.instagram_url} onChange={(v) => set("instagram_url", v)} type="url" placeholder="instagram.com/…" error={fieldErrors.instagram_url} />
                <TextField label="X (Twitter)" value={form.x_url} onChange={(v) => set("x_url", v)} type="url" placeholder="x.com/…" error={fieldErrors.x_url} />
              </FieldGrid>
            </div>
          </div>
        )}

        {current === 2 && (
          <div className="space-y-4">
            <AddressBlock prefix="addr" form={form} set={set} />
            {showSecondAddr ? (
              <div className="border-t border-border/40 pt-4">
                <AddressBlock prefix="addr2" form={form} set={set} onRemove={removeSecondAddr} />
              </div>
            ) : (
              <button type="button" onClick={() => setShowSecondAddr(true)}
                className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                <Plus className="h-4 w-4" /> Add another address
              </button>
            )}
          </div>
        )}

        {current === 3 && (
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
                Your business (operating) account — where management fees are received. This is separate from your trust account.
              </p>
              <FieldGrid>
                <TextField label="Bank" value={biz.bank_name} onChange={(v) => setBizField("bank_name", v)} required placeholder="FNB" />
                <TextField label="Account holder" value={biz.account_holder} onChange={(v) => setBizField("account_holder", v)} required placeholder="Coastline Holdings (Pty) Ltd" />
                <TextField label="Account number" value={biz.account_number} onChange={(v) => setBizField("account_number", v)} placeholder="62012345678" />
                <TextField label="Branch code" value={biz.branch_code} onChange={(v) => setBizField("branch_code", v)} placeholder="250655" />
                <SelectField label="Account type" value={biz.account_type} onChange={(v) => setBizField("account_type", v)} options={ACCOUNT_TYPE_OPTIONS} />
              </FieldGrid>
            </div>

            <div className="border-t border-border/40 pt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Trust accounts</p>
              {trust.length === 0 ? (
                <p className="text-sm text-muted-foreground">No trust account set up yet.</p>
              ) : (
                <div className="space-y-2">
                  {trust.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-[var(--r-button)] border border-border bg-muted/20 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{TRUST_TYPE_LABEL[a.type] ?? a.type}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.bank_name || "—"} · {mask(a.account_number)}</p>
                      </div>
                      <button type="button" onClick={() => setTrustNote(true)} className="pa-edit shrink-0" aria-label="Manage trust account">Manage</button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setTrustNote(true)}
                className="mt-3 text-xs font-medium text-primary underline-offset-4 hover:underline">
                Manage trust accounts in Trust account settings
              </button>
            </div>
          </div>
        )}
      </WizardModal>

      <ConfirmDialog
        open={trustNote}
        onOpenChange={setTrustNote}
        title="Trust account is managed separately"
        description="Your trust account is governed under the Trust account section — a separate, regulated process from your business account. We'll take you there now."
        confirmLabel="Go to Trust account"
        cancelLabel="Stay here"
        onConfirm={() => { setTrustNote(false); onOpenChange(false); router.push("/settings/deposits") }}
      />
    </>
  )
}
