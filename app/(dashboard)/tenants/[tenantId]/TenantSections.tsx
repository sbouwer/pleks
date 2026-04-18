"use client"

import { useState, useTransition, useMemo } from "react"
import { DetailRow } from "@/components/contacts/DetailRow"
import { ContactEditForm } from "@/components/contacts/edit/ContactEditForm"
import { TenantEmploymentForm } from "@/components/contacts/edit/TenantEmploymentForm"
import { AddressEditForm } from "@/components/contacts/edit/AddressEditForm"
import { updateContactJuristicFields } from "@/lib/actions/contacts"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactPhone {
  id: string
  number: string
  phone_type: string
  label: string | null
  is_primary: boolean
  can_whatsapp: boolean
}

interface ContactEmail {
  id: string
  email: string
  email_type: string
  label: string | null
  is_primary: boolean
}

interface ContactAddress {
  id: string
  street_line1: string | null
  street_line2: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  address_type: string
  is_primary: boolean
}

// ─── TenantContactSection ─────────────────────────────────────────────────────

interface TenantContactSectionProps {
  entityId: string
  phones: ContactPhone[]
  emails: ContactEmail[]
}

export function TenantContactSection({ entityId, phones, emails }: Readonly<TenantContactSectionProps>) {
  const [editing, setEditing] = useState(false)

  const primaryPhone = phones.find((p) => p.is_primary) ?? phones[0] ?? null
  const extraPhones = phones.length > 1 ? phones.length - 1 : 0
  const primaryEmail = emails.find((e) => e.is_primary) ?? emails[0] ?? null

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <ContactEditForm
          entityType="tenants"
          entityId={entityId}
          phones={phones}
          emails={emails}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {primaryPhone ? (
            <DetailRow label="Phone">
              <a href={`tel:${primaryPhone.number}`} className="hover:underline">
                {primaryPhone.number}
              </a>
              {extraPhones > 0 && (
                <span className="text-muted-foreground ml-1">(+{extraPhones} more)</span>
              )}
            </DetailRow>
          ) : (
            <DetailRow label="Phone">
              <span className="text-muted-foreground">—</span>
            </DetailRow>
          )}
          {primaryEmail ? (
            <DetailRow label="Email">
              <a href={`mailto:${primaryEmail.email}`} className="hover:underline break-all">
                {primaryEmail.email}
              </a>
            </DetailRow>
          ) : (
            <DetailRow label="Email">
              <span className="text-muted-foreground">—</span>
            </DetailRow>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TenantIdentitySection ────────────────────────────────────────────────────

interface TenantIdentitySectionProps {
  idNumber: string | null
  idType: string | null
  dateOfBirth: string | null
  nationality: string | null
}

export function TenantIdentitySection({ idNumber, idType, dateOfBirth, nationality }: Readonly<TenantIdentitySectionProps>) {
  const maskedId = idNumber && idNumber.length > 4
    ? `••••••••••${idNumber.slice(-4)}`
    : idNumber ?? null

  const formattedDob = dateOfBirth
    ? new Date(dateOfBirth).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identity</span>
      </div>
      <div>
        {maskedId && (
          <DetailRow label={idType ?? "ID"}>{maskedId}</DetailRow>
        )}
        {formattedDob && (
          <DetailRow label="Date of birth">{formattedDob}</DetailRow>
        )}
        {nationality && (
          <DetailRow label="Nationality">{nationality}</DetailRow>
        )}
        {!maskedId && !formattedDob && !nationality && (
          <p className="text-xs text-muted-foreground">No identity information.</p>
        )}
      </div>
    </div>
  )
}

// ─── TenantEmploymentSection ──────────────────────────────────────────────────

interface TenantEmploymentSectionProps {
  tenantId: string
  employerName: string | null
  employerPhone: string | null
  occupation: string | null
  employmentType: string | null
  preferredContact: string | null
}

export function TenantEmploymentSection({
  tenantId,
  employerName,
  employerPhone,
  occupation,
  employmentType,
  preferredContact,
}: Readonly<TenantEmploymentSectionProps>) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employment</span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <TenantEmploymentForm
          tenantId={tenantId}
          employerName={employerName}
          employerPhone={employerPhone}
          occupation={occupation}
          employmentType={employmentType}
          preferredContact={preferredContact}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {employerName && <DetailRow label="Employer">{employerName}</DetailRow>}
          {employerPhone && (
            <DetailRow label="Employer phone">
              <a href={`tel:${employerPhone}`} className="hover:underline">{employerPhone}</a>
            </DetailRow>
          )}
          {occupation && <DetailRow label="Occupation">{occupation}</DetailRow>}
          {employmentType && <DetailRow label="Employment type">{employmentType}</DetailRow>}
          {preferredContact && <DetailRow label="Preferred contact">{preferredContact}</DetailRow>}
          {!employerName && !employerPhone && !occupation && !employmentType && !preferredContact && (
            <p className="text-xs text-muted-foreground">No employment information.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TenantAddressSection ─────────────────────────────────────────────────────

interface TenantAddressSectionProps {
  entityId: string
  address: ContactAddress | null
}

export function TenantAddressSection({ entityId, address }: Readonly<TenantAddressSectionProps>) {
  const [editing, setEditing] = useState(false)

  const addressLine = [
    address?.street_line1,
    address?.street_line2,
    address?.suburb,
    address?.city,
    address?.province,
    address?.postal_code,
  ].filter(Boolean).join(", ")

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <AddressEditForm
          entityType="tenants"
          entityId={entityId}
          address={address}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {addressLine ? (
            <p className="text-sm">{addressLine}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No address on file.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TenantJuristicSection ────────────────────────────────────────────────────

const JURISTIC_TYPE_LABELS: Record<string, string> = {
  sole_proprietor: "Sole proprietor",
  pty_ltd:         "Private company (Pty Ltd)",
  cc:              "Close corporation (CC)",
  trust:           "Trust",
  partnership:     "Partnership",
  npc:             "Non-profit company (NPC)",
  other_juristic:  "Other juristic entity",
}

function bandLabel(val: boolean | null): string {
  if (val === null) return "Unknown"
  return val ? "Below R2m" : "R2m or more"
}

function capturedLabel(date: string, stale: boolean): string {
  const fmt = new Date(date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
  return stale ? `Confirm or update — last confirmed ${fmt}` : `Last confirmed ${fmt}`
}

const BAND_OPTIONS = [
  { v: "true",  l: "Below R2 million" },
  { v: "false", l: "R2 million or more" },
  { v: "null",  l: "Unknown" },
] as const

interface BandRadioProps {
  legend: string
  value: boolean | null
  name: string
  onChange: (val: boolean | null) => void
}

function BandRadio({ legend, value, name, onChange }: Readonly<BandRadioProps>) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-muted-foreground">{legend}</legend>
      <div className="flex gap-3">
        {BAND_OPTIONS.map(({ v, l }) => (
          <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name={name}
              checked={String(value) === v}
              onChange={() => onChange(v === "null" ? null : v === "true")}
              className="accent-brand"
            />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

interface JuristicViewProps {
  juristicType: string | null
  turnoverUnder2m: boolean | null
  assetValueUnder2m: boolean | null
  sizeBandsCapturedAt: string | null
  onEdit: () => void
}

function JuristicView({ juristicType, turnoverUnder2m, assetValueUnder2m, sizeBandsCapturedAt, onEdit }: Readonly<JuristicViewProps>) {
  const isSoleProp = juristicType === "sole_proprietor"
  const isStale = useMemo(() => {
    if (!sizeBandsCapturedAt) return false
    // eslint-disable-next-line react-hooks/purity
    return Date.now() - new Date(sizeBandsCapturedAt).getTime() > 365 * 24 * 60 * 60 * 1000
  }, [sizeBandsCapturedAt])

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CPA classification</span>
        <button type="button" onClick={onEdit} className="text-xs text-brand hover:underline">Edit</button>
      </div>
      <div className="space-y-1">
        <DetailRow label="Entity type">{juristicType ? (JURISTIC_TYPE_LABELS[juristicType] ?? juristicType) : "Not set"}</DetailRow>
        {isSoleProp && (
          <p className="text-xs text-muted-foreground mt-1">Sole proprietor is legally a natural person — CPA applies regardless of size.</p>
        )}
        {!isSoleProp && (
          <>
            <DetailRow label="Annual turnover">{bandLabel(turnoverUnder2m)}</DetailRow>
            <DetailRow label="Asset value">{bandLabel(assetValueUnder2m)}</DetailRow>
            {sizeBandsCapturedAt && (
              <p className={`text-xs mt-1 ${isStale ? "text-warning" : "text-muted-foreground"}`}>
                {capturedLabel(sizeBandsCapturedAt, isStale)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface JuristicEditProps {
  contactId: string
  juristicType: string | null
  turnoverUnder2m: boolean | null
  assetValueUnder2m: boolean | null
  onDone: () => void
}

function JuristicEdit({ contactId, juristicType: init, turnoverUnder2m: initT, assetValueUnder2m: initA, onDone }: Readonly<JuristicEditProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [juristicType, setJuristicType] = useState(init)
  const [turnoverUnder2m, setTurnoverUnder2m] = useState(initT)
  const [assetValueUnder2m, setAssetValueUnder2m] = useState(initA)
  const isSoleProp = juristicType === "sole_proprietor"

  function handleSave() {
    startTransition(async () => {
      const result = await updateContactJuristicFields({
        contactId,
        juristicType,
        turnoverUnder2m: isSoleProp ? null : turnoverUnder2m,
        assetValueUnder2m: isSoleProp ? null : assetValueUnder2m,
      })
      if (result.error) { toast.error(result.error); return }
      toast.success("Entity classification saved")
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CPA classification</span>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="juristic-type-select" className="text-xs text-muted-foreground">Entity type</label>
          <select
            id="juristic-type-select"
            value={juristicType ?? ""}
            onChange={(e) => setJuristicType(e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— Select —</option>
            {Object.entries(JURISTIC_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {isSoleProp && (
            <p className="text-xs text-muted-foreground">Sole proprietor is legally a natural person — CPA applies regardless of size.</p>
          )}
        </div>

        {!isSoleProp && (
          <>
            <BandRadio legend="Annual turnover (CPA s6 threshold)" value={turnoverUnder2m} name="turnover" onChange={setTurnoverUnder2m} />
            <BandRadio legend="Asset value (CPA s6 threshold)" value={assetValueUnder2m} name="assets" onChange={setAssetValueUnder2m} />
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onDone}
            disabled={isPending}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

interface TenantJuristicSectionProps {
  contactId: string
  juristicType: string | null
  turnoverUnder2m: boolean | null
  assetValueUnder2m: boolean | null
  sizeBandsCapturedAt: string | null
}

export function TenantJuristicSection(props: Readonly<TenantJuristicSectionProps>) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <JuristicEdit
        contactId={props.contactId}
        juristicType={props.juristicType}
        turnoverUnder2m={props.turnoverUnder2m}
        assetValueUnder2m={props.assetValueUnder2m}
        onDone={() => setEditing(false)}
      />
    )
  }

  return (
    <JuristicView
      juristicType={props.juristicType}
      turnoverUnder2m={props.turnoverUnder2m}
      assetValueUnder2m={props.assetValueUnder2m}
      sizeBandsCapturedAt={props.sizeBandsCapturedAt}
      onEdit={() => setEditing(true)}
    />
  )
}
