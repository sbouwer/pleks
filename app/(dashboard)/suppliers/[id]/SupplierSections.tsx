"use client"

/**
 * app/(dashboard)/suppliers/[id]/SupplierSections.tsx — inline-editable supplier/contractor detail sections (contact, rates, address)
 *
 * Route:  /suppliers/[id]
 * Auth:   gateway-protected server wrapper
 * Data:   contractor fields passed from server page; each section manages own edit state
 */

import { useState } from "react"
import { EditButton } from "@/components/ui/actions"
import { DetailRow } from "@/components/contacts/DetailRow"
import { ContactEditForm } from "@/components/contacts/edit/ContactEditForm"
import { AddressEditForm } from "@/components/contacts/edit/AddressEditForm"
import { ContractorRatesForm } from "@/components/contacts/edit/ContractorRatesForm"
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
  // contacts.primary_phone/email — the add/edit modal writes these (not child rows); shown when no child rows exist.
  fallbackPhone?: string | null
  fallbackEmail?: string | null
}

export function ContractorContactSection({ entityId, phones, emails, fallbackPhone, fallbackEmail }: Readonly<ContractorContactSectionProps>) {
  const [editing, setEditing] = useState(false)
  const primaryPhone = phones[0] ?? null
  const extraPhoneCount = phones.length - 1
  const primaryEmail = emails[0] ?? null
  const phoneDisplay = primaryPhone?.number ?? fallbackPhone ?? null
  const emailDisplay = primaryEmail?.email ?? fallbackEmail ?? null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</span>
        {!editing && (
          <EditButton mode="label" label="Edit" onClick={() => setEditing(true)} />
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
          {phoneDisplay ? (
            <DetailRow label="Phone">
              <a href={`tel:${phoneDisplay}`} className="hover:underline">
                {phoneDisplay}
              </a>
              {extraPhoneCount > 0 && (
                <span className="text-muted-foreground ml-1 text-xs">+{extraPhoneCount} more</span>
              )}
            </DetailRow>
          ) : null}
          {emailDisplay ? (
            <DetailRow label="Email">
              <a href={`mailto:${emailDisplay}`} className="hover:underline break-all">
                {emailDisplay}
              </a>
            </DetailRow>
          ) : null}
          {!phoneDisplay && !emailDisplay && (
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
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rates</span>
        {!editing && (
          <EditButton mode="label" label="Edit" onClick={() => setEditing(true)} />
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
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</span>
        {!editing && (
          <EditButton mode="label" label="Edit" onClick={() => setEditing(true)} />
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
