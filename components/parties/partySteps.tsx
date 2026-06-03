"use client"

/**
 * components/parties/partySteps.tsx — the three step bodies + success view for the add-party modal
 *
 * Notes:  Identity (entity-aware, fullFica progressive disclosure) → Details (role-specific) →
 *         Review → Success. All copy/behaviour is driven by PARTY_ROLES + the role flags, so this
 *         file renders all three party types from one set of components (DRY).
 */
import { Plus, X } from "lucide-react"
import { PARTY_ROLES, SPECIALITY_OPTIONS, COMPANY_FUNCTION_OPTIONS, type PartyRole, type PartyEntity } from "@/lib/parties/partyConfig"
import type { PartyFormState, PartyErrors, PartyPerson, PartyAddressInput, PartyBankAccountInput } from "@/lib/parties/partyValidation"
import {
  SectLabel, TextField, SelectField, IdField, EntityToggle, ChipPicker, CheckRow, PeopleRepeater, AddressFields, BankAccountsRepeater,
} from "./partyFields"

type SetFn = (k: keyof PartyFormState, v: string | string[] | boolean | PartyPerson[] | PartyAddressInput[] | PartyBankAccountInput[]) => void

const FUNCTION_LABEL: Record<string, string> = Object.fromEntries(COMPANY_FUNCTION_OPTIONS.map((o) => [o.value, o.label]))

const TITLE_OPTIONS = [
  { value: "", label: "Select…" },
  ...["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Adv", "Rev", "Hon"].map((t) => ({ value: t, label: t })),
]

const CHANNEL_OPTIONS = [
  { value: "", label: "No preference" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone call" },
  { value: "post", label: "Post" },
]

const GENDER_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
]

const GENDER_LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" }
const CHANNEL_LABEL: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", phone: "Phone call", post: "Post" }

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
type IdentityBodyProps = Readonly<{ f: PartyFormState; set: SetFn; errors: PartyErrors; fullFica: boolean }>

function IndividualIdentity({ f, set, errors, fullFica }: IdentityBodyProps) {
  return (
    <div className="mt-6">
      <SectLabel n="01">Personal details</SectLabel>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <SelectField label="Title" k="title" f={f} set={set} options={TITLE_OPTIONS} />
        <TextField label="Initials" k="initials" f={f} set={set} errors={errors} placeholder="J.S." />
        <TextField label="First name" k="firstName" f={f} set={set} errors={errors} required placeholder="Jane" />
        <TextField label="Middle name(s)" k="middleNames" f={f} set={set} errors={errors} placeholder="Optional" />
        <TextField label="Last name" k="lastName" f={f} set={set} errors={errors} required placeholder="Smith" />
        <TextField label="Suffix" k="suffix" f={f} set={set} errors={errors} placeholder="Jr / Sr — optional" />
        <TextField label="Designation" k="designation" f={f} set={set} errors={errors} placeholder="Adv., Dr, CA(SA) — optional" />
        <SelectField label="Gender" k="gender" f={f} set={set} options={GENDER_OPTIONS} />
        {/* ID captured only for FICA parties (landlord/tenant). Suppliers store no ID. */}
        {fullFica && <IdField label="ID" typeKey="idType" numKey="idNumber" f={f} set={set} errors={errors} />}
        <TextField label="Email" k="email" f={f} set={set} errors={errors} required type="email" placeholder="jane@email.co.za" />
        <TextField label="Phone" k="phone" f={f} set={set} errors={errors} required type="tel" placeholder="082 000 0000" />
        <SelectField label="Preferred contact" k="preferredChannel" f={f} set={set} options={CHANNEL_OPTIONS} />
      </div>
    </div>
  )
}

const ADDRESS_TYPE_LABEL: Record<string, string> = { physical: "Street address", postal: "Postal address", billing: "Billing address" }

/** Multi-address (25A): physical + collapsed opt-in postal / billing. Physical required unless `optional`. */
function CompanyAddressSection({
  addresses, onChange, error, n = "02", title = "Registered / street address", optional = false,
}: Readonly<{
  addresses: PartyAddressInput[]; onChange: (a: PartyAddressInput[]) => void; error?: string
  n?: string; title?: string; optional?: boolean
}>) {
  const get = (type: PartyAddressInput["type"]) => addresses.find((a) => a.type === type)
  const update = (type: PartyAddressInput["type"], patch: Partial<PartyAddressInput>) =>
    onChange(addresses.some((a) => a.type === type)
      ? addresses.map((a) => (a.type === type ? { ...a, ...patch } : a))
      : [...addresses, { type, ...patch }])
  const addType = (type: PartyAddressInput["type"]) => onChange([...addresses, { type }])
  const removeType = (type: PartyAddressInput["type"]) => onChange(addresses.filter((a) => a.type !== type))

  return (
    <div className="mt-6">
      <SectLabel n={n}>{title}</SectLabel>
      <AddressFields address={get("physical") ?? { type: "physical" }} onUpdate={(p) => update("physical", p)} requiredLine={!optional} />

      {(["postal", "billing"] as const).map((type) => {
        const a = get(type)
        if (!a) {
          return (
            <button key={type} type="button" onClick={() => addType(type)}
              className="mt-3 mr-2 inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
              <Plus className="h-4 w-4" /> Add {type} address
            </button>
          )
        }
        return (
          <div key={type} className="mt-4 rounded-[var(--r-button)] border border-border bg-muted/20 p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{ADDRESS_TYPE_LABEL[type]}</span>
              <button type="button" onClick={() => removeType(type)} aria-label={`Remove ${type} address`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive">
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
            <AddressFields address={a} onUpdate={(p) => update(type, p)} />
          </div>
        )
      })}

      {error && <span className="mt-2 block text-xs text-destructive">{error}</span>}
    </div>
  )
}

function CompanyIdentity({
  f, set, errors, fullFica, companyPeople, isSupplier,
}: IdentityBodyProps & { companyPeople: boolean; isSupplier: boolean }) {
  return (
    <>
      <div className="mt-6">
        <SectLabel n="01">Company</SectLabel>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <TextField label="Registered name" k="companyName" f={f} set={set} errors={errors} required span
            placeholder={isSupplier ? "DW Plumbing CC" : "Coastline Holdings (Pty) Ltd"} />
          <TextField label="CIPC reg. number" k="companyReg" f={f} set={set} errors={errors} placeholder="2023/123456/07" />
          {fullFica && <TextField label="VAT number" k="vatNumber" f={f} set={set} errors={errors} placeholder="Optional" />}
          {companyPeople && <TextField label="Company email" k="companyEmail" f={f} set={set} errors={errors} type="email" placeholder="info@company.co.za" />}
          {companyPeople && <TextField label="Company phone" k="companyPhone" f={f} set={set} errors={errors} type="tel" placeholder="021 000 0000" />}
        </div>
      </div>

      {fullFica && <CompanyAddressSection addresses={f.addresses ?? []} onChange={(a) => set("addresses", a)} error={errors.addresses} />}

      <div className="mt-6">
        <SectLabel n={fullFica ? "03" : "02"}>People</SectLabel>
        <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
          The people you deal with at this company — add as many as you need. Mark who&apos;s the main contact;
          a person&apos;s function routes the right messages to them (accounts → statements, maintenance → repairs).
        </p>
        <PeopleRepeater people={f.people ?? []} onChange={(ppl) => set("people", ppl)} error={errors.people} fica={fullFica} />
      </div>
    </>
  )
}

export function IdentityStep({
  role, entity, setEntity, f, set, errors, fullFica, companyPeople,
}: Readonly<{
  role: PartyRole; entity: PartyEntity; setEntity: (v: PartyEntity) => void
  f: PartyFormState; set: SetFn; errors: PartyErrors; fullFica: boolean; companyPeople: boolean
}>) {
  return (
    <>
      <div>
        <SectLabel>Who are you adding?</SectLabel>
        <EntityToggle entity={entity} onChange={setEntity} />
        <p className="mt-3 text-[13px] leading-snug text-muted-foreground">{entityBlurb(entity, fullFica)}</p>
      </div>

      {entity === "individual" ? (
        <IndividualIdentity f={f} set={set} errors={errors} fullFica={fullFica} />
      ) : (
        <CompanyIdentity f={f} set={set} errors={errors} fullFica={fullFica} companyPeople={companyPeople} isSupplier={role === "supplier"} />
      )}
    </>
  )
}

// ── Step 2 — Role-specific details ────────────────────────────────────────────
export function DetailsStep({
  role, f, set, errors, hideWelcomePack,
}: Readonly<{ role: PartyRole; f: PartyFormState; set: SetFn; errors: PartyErrors; hideWelcomePack?: boolean }>) {
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
          <SectLabel n="02">Rates · optional</SectLabel>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <TextField label="Call-out rate (R)" k="callOutRate" f={f} set={set} errors={errors} type="number" placeholder="e.g. 450" />
            <TextField label="Hourly rate (R)" k="hourlyRate" f={f} set={set} errors={errors} type="number" placeholder="e.g. 350" />
          </div>
        </div>

        <div className="mt-6">
          <SectLabel n="03">VAT · optional</SectLabel>
          <CheckRow checked={!!f.vatRegistered} onChange={(v) => set("vatRegistered", v)}>
            VAT registered
          </CheckRow>
          {f.vatRegistered && (
            <div className="mt-3.5">
              <TextField label="VAT number" k="vatNumber" f={f} set={set} errors={errors} placeholder="4xxxxxxxxx" />
            </div>
          )}
        </div>

        <CompanyAddressSection
          n="04" title="Address · optional" optional
          addresses={f.addresses ?? []} onChange={(a) => set("addresses", a)} error={errors.addresses}
        />

        <div className="mt-6">
          <SectLabel n="05">Banking · optional</SectLabel>
          <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
            Add the supplier&apos;s bank account(s). Many suppliers (e.g. utilities) keep one account per bank —
            add each so payments can route same-bank. The first account is the primary.
          </p>
          <BankAccountsRepeater accounts={f.bankAccounts ?? []} onChange={(a) => set("bankAccounts", a)} />
        </div>

        <div className="mt-6">
          <SectLabel n="06">Status &amp; notes</SectLabel>
          <CheckRow checked={f.isActive !== false} onChange={(v) => set("isActive", v)}>
            Active — available to assign to new maintenance jobs.
          </CheckRow>
          <div className="mt-3.5">
            <TextField label="Internal notes" k="notes" f={f} set={set} errors={errors} span placeholder="Preferred areas, callout terms…" />
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
      {/* Hidden on the "add me as landlord" self path — you don't send yourself a welcome pack. */}
      {!hideWelcomePack && (
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
      )}
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
              <ReviewRow k="Name" v={[f.title, f.initials, f.firstName, f.middleNames, f.lastName, f.suffix].filter(Boolean).join(" ")} />
              {f.designation && <ReviewRow k="Designation" v={f.designation} />}
              {f.gender && <ReviewRow k="Gender" v={GENDER_LABEL[f.gender] ?? f.gender} />}
              <ReviewRow k="Email" v={f.email} />
              <ReviewRow k="Phone" v={f.phone} />
              {f.preferredChannel && <ReviewRow k="Preferred contact" v={CHANNEL_LABEL[f.preferredChannel] ?? f.preferredChannel} />}
            </>
          ) : (
            <>
              <ReviewRow k="Registered name" v={f.companyName} />
              <ReviewRow k="CIPC reg." v={f.companyReg} />
              {(f.addresses ?? []).filter((a) => a.line1?.trim()).map((a) => (
                <ReviewRow key={a.type} k={ADDRESS_TYPE_LABEL[a.type] ?? "Address"} v={[a.line1, a.city].filter(Boolean).join(", ")} />
              ))}
              {(f.people ?? []).map((p, i) => (
                <ReviewRow
                  key={p._uid ?? i}
                  k={`${FUNCTION_LABEL[p.companyFunction ?? ""] ?? "Contact"}${p.isPrimary ? " · primary" : ""}${p.isSignatory ? " · signatory" : ""}`}
                  v={[p.firstName, p.lastName].filter(Boolean).join(" ")}
                />
              ))}
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
              {f.callOutRate && <ReviewRow k="Call-out rate" v={`R ${f.callOutRate}`} />}
              {f.hourlyRate && <ReviewRow k="Hourly rate" v={`R ${f.hourlyRate}`} />}
              {f.vatRegistered && <ReviewRow k="VAT" v={f.vatNumber ? `Registered · ${f.vatNumber}` : "Registered"} />}
              {(f.addresses ?? []).filter((a) => a.line1?.trim()).map((a) => (
                <ReviewRow key={a.type} k={ADDRESS_TYPE_LABEL[a.type] ?? "Address"} v={[a.line1, a.city].filter(Boolean).join(", ")} />
              ))}
              {(f.bankAccounts ?? []).filter((b) => b.bankName?.trim() || b.accountNumber?.trim()).map((b, i) => (
                <ReviewRow
                  key={b._uid ?? i}
                  k={`Bank${i === 0 ? " · primary" : ""}`}
                  v={[b.bankName, b.accountNumber ? `••••${b.accountNumber.slice(-4)}` : null].filter(Boolean).join(" · ")}
                />
              ))}
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
