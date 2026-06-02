"use client"

/**
 * components/parties/partySteps.tsx — the three step bodies + success view for the add-party modal
 *
 * Notes:  Identity (entity-aware, fullFica progressive disclosure) → Details (role-specific) →
 *         Review → Success. All copy/behaviour is driven by PARTY_ROLES + the role flags, so this
 *         file renders all three party types from one set of components (DRY).
 */
import { SA_PROVINCES } from "@/lib/constants"
import { PARTY_ROLES, SPECIALITY_OPTIONS, type PartyRole, type PartyEntity } from "@/lib/parties/partyConfig"
import type { PartyFormState, PartyErrors } from "@/lib/parties/partyValidation"
import {
  SectLabel, TextField, SelectField, IdField, EntityToggle, ChipPicker, CheckRow,
} from "./partyFields"

type SetFn = (k: keyof PartyFormState, v: string | string[] | boolean) => void

const PROVINCE_OPTIONS = [{ value: "", label: "Select…" }, ...SA_PROVINCES.map((p) => ({ value: p, label: p }))]

function entityBlurb(entity: PartyEntity, fullFica: boolean): string {
  if (entity === "individual") {
    return fullFica
      ? "A natural person — FICA captured against the individual."
      : "A sole trader or individual contractor."
  }
  return fullFica
    ? "A registered entity — we'll capture the company plus its mandated signatory (the person who signs on its behalf)."
    : "A registered business — we'll capture the company plus your main day-to-day contact there."
}

// ── Step 1 — Identity ─────────────────────────────────────────────────────────
export function IdentityStep({
  role, entity, setEntity, f, set, errors, fullFica,
}: Readonly<{
  role: PartyRole; entity: PartyEntity; setEntity: (v: PartyEntity) => void
  f: PartyFormState; set: SetFn; errors: PartyErrors; fullFica: boolean
}>) {
  const isSupplier = role === "supplier"
  return (
    <>
      <div>
        <SectLabel>Who are you adding?</SectLabel>
        <EntityToggle entity={entity} onChange={setEntity} />
        <p className="mt-3 text-[13px] leading-snug text-muted-foreground">{entityBlurb(entity, fullFica)}</p>
      </div>

      {entity === "individual" ? (
        <div className="mt-6">
          <SectLabel n="01">Personal details</SectLabel>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <TextField label="First name" k="firstName" f={f} set={set} errors={errors} required placeholder="Jane" />
            <TextField label="Last name" k="lastName" f={f} set={set} errors={errors} required placeholder="Smith" />
            {/* ID captured only for FICA parties (landlord/tenant). Suppliers store no ID. */}
            {fullFica && <IdField label="ID" typeKey="idType" numKey="idNumber" f={f} set={set} errors={errors} />}
            <TextField label="Email" k="email" f={f} set={set} errors={errors} required type="email" placeholder="jane@email.co.za" />
            <TextField label="Phone" k="phone" f={f} set={set} errors={errors} required type="tel" placeholder="082 000 0000" />
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <SectLabel n="01">Company</SectLabel>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <TextField label="Registered name" k="companyName" f={f} set={set} errors={errors} required span
                placeholder={isSupplier ? "DW Plumbing CC" : "Coastline Holdings (Pty) Ltd"} />
              <TextField label="CIPC reg. number" k="companyReg" f={f} set={set} errors={errors} placeholder="2023/123456/07" />
              {fullFica && <TextField label="VAT number" k="vatNumber" f={f} set={set} errors={errors} placeholder="Optional" />}
            </div>
          </div>

          {fullFica && (
            <div className="mt-6">
              <SectLabel n="02">Registered address</SectLabel>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <TextField label="Street address" k="addrLine1" f={f} set={set} errors={errors} required span placeholder="12 Main Road" />
                <TextField label="Suburb" k="addrSuburb" f={f} set={set} errors={errors} placeholder="Sea Point" />
                <TextField label="City" k="addrCity" f={f} set={set} errors={errors} required placeholder="Cape Town" />
                <SelectField label="Province" k="addrProvince" f={f} set={set} options={PROVINCE_OPTIONS} />
                <TextField label="Postal code" k="addrPostal" f={f} set={set} errors={errors} placeholder="8005" />
              </div>
            </div>
          )}

          <div className="mt-6">
            <SectLabel n={fullFica ? "03" : "02"}>{fullFica ? "Mandated signatory" : "Primary contact"}</SectLabel>
            <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
              {fullFica
                ? "The director or authorised representative who signs on the company's behalf. Full FICA required."
                : "The person you deal with day-to-day for this supplier."}
            </p>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <TextField label="First name" k="dirFirstName" f={f} set={set} errors={errors} required placeholder="John" />
              <TextField label="Last name" k="dirLastName" f={f} set={set} errors={errors} required={fullFica} placeholder="Doe" />
              {fullFica && <IdField label="ID" typeKey="dirIdType" numKey="dirIdNumber" f={f} set={set} errors={errors} required />}
              <TextField label={fullFica ? "Direct phone" : "Phone"} k="dirPhone" f={f} set={set} errors={errors} required type="tel" placeholder="082 000 0000" />
              <TextField label={fullFica ? "Direct email" : "Email"} k="dirEmail" f={f} set={set} errors={errors} required={fullFica} type="email" span placeholder="contact@company.co.za" />
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── Step 2 — Role-specific details ────────────────────────────────────────────
export function DetailsStep({
  role, f, set, errors,
}: Readonly<{ role: PartyRole; f: PartyFormState; set: SetFn; errors: PartyErrors }>) {
  if (role === "tenant") {
    return (
      <>
        <div>
          <SectLabel n="01">POPIA consent</SectLabel>
          <div className="mb-3 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground">Information notice — processing of personal information</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Personal information is processed to manage the lease, rental payments, communication, inspections and the
              deposit. Stored securely, not shared with third parties except to fulfil these purposes. The tenant may
              access, correct or request deletion at any time.
            </p>
          </div>
          <CheckRow gate checked={!!f.popiaConsent} onChange={(v) => set("popiaConsent", v)}>
            The tenant has been informed of the above and consents to the processing of their personal information.
          </CheckRow>
          {errors.popiaConsent && <span className="mt-1 block text-xs text-destructive">{errors.popiaConsent}</span>}
        </div>
        <div className="mt-6">
          <SectLabel n="02">Background · optional</SectLabel>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <TextField label="Employer" k="employer" f={f} set={set} errors={errors} placeholder="Company or employer" />
            <TextField label="Occupation" k="occupation" f={f} set={set} errors={errors} placeholder="e.g. Engineer" />
            <TextField label="Internal notes (not visible to tenant)" k="notes" f={f} set={set} errors={errors} span placeholder="Optional" />
          </div>
        </div>
      </>
    )
  }

  if (role === "supplier") {
    return (
      <>
        <div>
          <SectLabel n="01">Specialities *</SectLabel>
          <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
            Pick everything this supplier does — these drive which jobs they&apos;re suggested for.
          </p>
          <ChipPicker value={f.specialities || []} onChange={(v) => set("specialities", v)} options={SPECIALITY_OPTIONS} />
          {errors.specialities && <span className="mt-2.5 block text-xs text-destructive">{errors.specialities}</span>}
        </div>
        <div className="mt-6">
          <SectLabel n="02">Status &amp; notes</SectLabel>
          <CheckRow checked={f.isActive !== false} onChange={(v) => set("isActive", v)}>
            Active — available to assign to new maintenance jobs.
          </CheckRow>
          <div className="mt-3.5">
            <TextField label="Internal notes" k="notes" f={f} set={set} errors={errors} span placeholder="Rates, preferred areas, callout terms…" />
          </div>
        </div>
      </>
    )
  }

  // landlord
  return (
    <>
      <div>
        <SectLabel n="01">Payout account · optional</SectLabel>
        <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
          Where collected rent is paid out. You can add this later from their profile.
        </p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <TextField label="Bank" k="bankName" f={f} set={set} errors={errors} placeholder="e.g. FNB" />
          <TextField label="Account number" k="accountNumber" f={f} set={set} errors={errors} placeholder="000 000 0000" />
          <TextField label="Branch code" k="branchCode" f={f} set={set} errors={errors} placeholder="250655" />
        </div>
      </div>
      <div className="mt-6">
        <SectLabel n="02">Welcome pack</SectLabel>
        <div className="mb-3 rounded-lg border border-amber-300/60 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-foreground">Send a branded welcome pack?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Portfolio overview, rental analysis and a compliance calendar — branded with your agency details.
          </p>
        </div>
        <CheckRow checked={f.sendWelcomePack !== false} onChange={(v) => set("sendWelcomePack", v)}>
          Generate the welcome pack once this landlord is added.
        </CheckRow>
      </div>
    </>
  )
}

// ── Step 3 — Review ───────────────────────────────────────────────────────────
function ReviewRow({ k, v }: Readonly<{ k: string; v: string | undefined }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className={v ? "text-right font-medium text-foreground" : "text-right text-muted-foreground/50"}>{v || "—"}</span>
    </div>
  )
}

export function ReviewStep({
  role, entity, f,
}: Readonly<{ role: PartyRole; entity: PartyEntity; f: PartyFormState }>) {
  const isIndividual = entity === "individual"
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {isIndividual ? "Individual" : "Company"}
        </div>
        <div className="divide-y divide-border rounded-lg border border-border px-3">
          {isIndividual ? (
            <>
              <ReviewRow k="Name" v={[f.firstName, f.lastName].filter(Boolean).join(" ")} />
              <ReviewRow k="Email" v={f.email} />
              <ReviewRow k="Phone" v={f.phone} />
            </>
          ) : (
            <>
              <ReviewRow k="Registered name" v={f.companyName} />
              <ReviewRow k="CIPC reg." v={f.companyReg} />
              <ReviewRow k="Address" v={[f.addrLine1, f.addrCity].filter(Boolean).join(", ")} />
              <ReviewRow k="Signatory" v={[f.dirFirstName, f.dirLastName].filter(Boolean).join(" ")} />
              <ReviewRow k="Signatory email" v={f.dirEmail} />
            </>
          )}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {PARTY_ROLES[role].detailsTitle}
        </div>
        <div className="divide-y divide-border rounded-lg border border-border px-3">
          {role === "tenant" && (
            <>
              <ReviewRow k="POPIA consent" v={f.popiaConsent ? "Given" : "Not given"} />
              <ReviewRow k="Employer" v={f.employer} />
              <ReviewRow k="Occupation" v={f.occupation} />
            </>
          )}
          {role === "supplier" && (
            <>
              <ReviewRow k="Specialities" v={(f.specialities || []).join(", ")} />
              <ReviewRow k="Status" v={f.isActive !== false ? "Active" : "Inactive"} />
            </>
          )}
          {role === "landlord" && (
            <>
              <ReviewRow k="Payout bank" v={f.bankName} />
              <ReviewRow k="Account" v={f.accountNumber} />
              <ReviewRow k="Welcome pack" v={f.sendWelcomePack !== false ? "Will send" : "Skip"} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Success ───────────────────────────────────────────────────────────────────
export function SuccessView({
  role, entity, f, displayName, onClose, onAddAnother, onPrimaryAction,
}: Readonly<{
  role: PartyRole; entity: PartyEntity; f: PartyFormState; displayName: string
  onClose: () => void; onAddAnother: () => void; onPrimaryAction?: () => void
}>) {
  const cfg = PARTY_ROLES[role]
  const name = displayName
    || (entity === "individual" ? [f.firstName, f.lastName].filter(Boolean).join(" ") : f.companyName)
    || cfg.singular
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <svg width={60} height={60} viewBox="0 0 64 64" fill="none" className="overflow-visible">
        <path d="M32 5 L55 13 L55 31 C55 45 46 54 32 59 C18 54 9 45 9 31 L9 13 Z"
          className="fill-primary/10 stroke-primary" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M21 33 L29 41 L44 24" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <p className="mt-4 text-lg font-semibold text-foreground">{name} added.</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{cfg.successNote}</p>
      <div className="mt-6 flex flex-col items-stretch gap-2 self-stretch">
        {cfg.successAction && (
          <button type="button" onClick={onPrimaryAction ?? onClose}
            className="rounded-[var(--r-button)] bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            {cfg.successAction}
          </button>
        )}
        <button type="button" onClick={onAddAnother}
          className="rounded-[var(--r-button)] border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40">
          Add another {cfg.singular.toLowerCase()}
        </button>
        <button type="button" onClick={onClose} className="px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          Done
        </button>
      </div>
    </div>
  )
}
