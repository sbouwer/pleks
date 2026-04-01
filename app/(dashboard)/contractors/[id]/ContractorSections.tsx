"use client"

import { useState } from "react"
import { DetailRow } from "@/components/contacts/DetailRow"
import { ContactEditForm } from "@/components/contacts/edit/ContactEditForm"
import { AddressEditForm } from "@/components/contacts/edit/AddressEditForm"
import { ContractorRatesForm } from "@/components/contacts/edit/ContractorRatesForm"
import { ContractorBankingForm } from "@/components/contacts/edit/ContractorBankingForm"
import { formatZAR } from "@/lib/constants"

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

// ─── Contact Section ──────────────────────────────────────────────────────────

interface ContractorContactSectionProps {
  entityId: string
  phones: ContactPhone[]
  emails: ContactEmail[]
}

export function ContractorContactSection({ entityId, phones, emails }: Readonly<ContractorContactSectionProps>) {
  const [editing, setEditing] = useState(false)
  const primaryPhone = phones[0] ?? null
  const extraPhoneCount = phones.length - 1
  const primaryEmail = emails[0] ?? null

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</span>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <ContactEditForm
          entityType="contractors"
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
              {extraPhoneCount > 0 && (
                <span className="text-muted-foreground ml-1 text-xs">+{extraPhoneCount} more</span>
              )}
            </DetailRow>
          ) : null}
          {primaryEmail ? (
            <DetailRow label="Email">
              <a href={`mailto:${primaryEmail.email}`} className="hover:underline break-all">
                {primaryEmail.email}
              </a>
            </DetailRow>
          ) : null}
          {!primaryPhone && !primaryEmail && (
            <p className="text-xs text-muted-foreground">No contact details.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Rates Section ────────────────────────────────────────────────────────────

interface ContractorRatesSectionProps {
  contractorId: string
  callOutRateCents: number | null
  hourlyRateCents: number | null
  specialities: string[]
}

export function ContractorRatesSection({
  contractorId,
  callOutRateCents,
  hourlyRateCents,
  specialities,
}: Readonly<ContractorRatesSectionProps>) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rates</span>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <ContractorRatesForm
          contractorId={contractorId}
          callOutRateCents={callOutRateCents}
          hourlyRateCents={hourlyRateCents}
          specialities={specialities}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          <DetailRow label="Call-out rate">{callOutRateCents != null ? formatZAR(callOutRateCents) : "—"}</DetailRow>
          <DetailRow label="Hourly rate">{hourlyRateCents != null ? formatZAR(hourlyRateCents) : "—"}</DetailRow>
          <DetailRow label="Specialities">
            {specialities.length > 0 ? specialities.join(", ") : "—"}
          </DetailRow>
        </div>
      )}
    </div>
  )
}

// ─── Banking Section ──────────────────────────────────────────────────────────

interface ContractorBankingSectionProps {
  contractorId: string
  bankingName: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankBranchCode: string | null
  bankAccountType: string | null
}

export function ContractorBankingSection({
  contractorId,
  bankingName,
  bankName,
  bankAccountNumber,
  bankBranchCode,
  bankAccountType,
}: Readonly<ContractorBankingSectionProps>) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Banking</span>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <ContractorBankingForm
          contractorId={contractorId}
          bankingName={bankingName}
          bankName={bankName}
          bankAccountNumber={bankAccountNumber}
          bankBranchCode={bankBranchCode}
          bankAccountType={bankAccountType}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {bankingName && <DetailRow label="Account name">{bankingName}</DetailRow>}
          {bankName && <DetailRow label="Bank">{bankName}</DetailRow>}
          {bankAccountNumber && (
            <DetailRow label="Account no.">
              {`\u2022\u2022\u2022\u2022${bankAccountNumber.slice(-4)}`}
            </DetailRow>
          )}
          {bankBranchCode && <DetailRow label="Branch code">{bankBranchCode}</DetailRow>}
          {bankAccountType && <DetailRow label="Account type">{bankAccountType}</DetailRow>}
          {!bankingName && !bankName && !bankAccountNumber && !bankBranchCode && !bankAccountType && (
            <p className="text-xs text-muted-foreground">No banking details.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Address Section ──────────────────────────────────────────────────────────

interface ContractorAddressSectionProps {
  entityId: string
  address: ContactAddress | null
}

export function ContractorAddressSection({ entityId, address }: Readonly<ContractorAddressSectionProps>) {
  const [editing, setEditing] = useState(false)

  const addressLines = address
    ? [
        address.street_line1,
        address.street_line2,
        address.suburb,
        [address.city, address.province].filter(Boolean).join(", "),
        address.postal_code,
      ].filter(Boolean)
    : []

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</span>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <AddressEditForm
          entityType="contractors"
          entityId={entityId}
          address={address}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {addressLines.length > 0 ? (
            <div className="text-sm space-y-0.5">
              {addressLines.map((line, i) => (
                <p key={i} className="text-right">{line}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No address on file.</p>
          )}
        </div>
      )}
    </div>
  )
}
