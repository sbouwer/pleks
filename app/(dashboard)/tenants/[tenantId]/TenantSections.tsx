"use client"

import { useState } from "react"
import { DetailRow } from "@/components/contacts/DetailRow"
import { ContactEditForm } from "@/components/contacts/edit/ContactEditForm"
import { TenantEmploymentForm } from "@/components/contacts/edit/TenantEmploymentForm"
import { AddressEditForm } from "@/components/contacts/edit/AddressEditForm"

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
