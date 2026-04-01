"use client"

import { useState } from "react"
import { DetailRow } from "@/components/contacts/DetailRow"
import { ContactEditForm } from "@/components/contacts/edit/ContactEditForm"
import { AddressEditForm } from "@/components/contacts/edit/AddressEditForm"
import { LandlordBankingForm } from "@/components/contacts/edit/LandlordBankingForm"
import { LandlordIdentityForm } from "@/components/contacts/edit/LandlordIdentityForm"

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

// ─── Identity ────────────────────────────────────────────────────────────────

interface LandlordIdentitySectionProps {
  landlordId: string
  entityType: string
  firstName: string | null
  lastName: string | null
  companyName: string | null
  tradingAs: string | null
  registrationNumber: string | null
  vatNumber: string | null
  notes: string | null
}

export function LandlordIdentitySection({
  landlordId, entityType, firstName, lastName, companyName, tradingAs, registrationNumber, vatNumber, notes,
}: Readonly<LandlordIdentitySectionProps>) {
  const [editing, setEditing] = useState(false)

  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim()
  const displayName = companyName || fullName || null

  return (
    <div className="border-t pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identity</span>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <LandlordIdentityForm
          landlordId={landlordId}
          entityType={entityType}
          firstName={firstName}
          lastName={lastName}
          companyName={companyName}
          tradingAs={tradingAs}
          registrationNumber={registrationNumber}
          vatNumber={vatNumber}
          notes={notes}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {displayName && <DetailRow label="Name">{displayName}</DetailRow>}
          {tradingAs && <DetailRow label="Trading as">{tradingAs}</DetailRow>}
          {registrationNumber && <DetailRow label="Reg. no.">{registrationNumber}</DetailRow>}
          {vatNumber && <DetailRow label="VAT no.">{vatNumber}</DetailRow>}
          {notes && <DetailRow label="Notes">{notes}</DetailRow>}
        </div>
      )}
    </div>
  )
}

// ─── Contact ─────────────────────────────────────────────────────────────────

interface LandlordContactSectionProps {
  entityId: string
  phones: ContactPhone[]
  emails: ContactEmail[]
}

export function LandlordContactSection({
  entityId, phones, emails,
}: Readonly<LandlordContactSectionProps>) {
  const [editing, setEditing] = useState(false)

  const primaryPhone = phones.find((p) => p.is_primary) ?? phones[0] ?? null
  const primaryEmail = emails.find((e) => e.is_primary) ?? emails[0] ?? null
  const extraPhones = phones.length > 1 ? phones.length - 1 : 0
  const extraEmails = emails.length > 1 ? emails.length - 1 : 0

  return (
    <div className="border-t pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
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
          entityType="landlords"
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
          ) : null}
          {primaryEmail ? (
            <DetailRow label="Email">
              <a href={`mailto:${primaryEmail.email}`} className="hover:underline break-all">
                {primaryEmail.email}
              </a>
              {extraEmails > 0 && (
                <span className="text-muted-foreground ml-1">(+{extraEmails} more)</span>
              )}
            </DetailRow>
          ) : null}
          {!primaryPhone && !primaryEmail && (
            <p className="text-sm text-muted-foreground">No contact details.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Address ─────────────────────────────────────────────────────────────────

interface LandlordAddressSectionProps {
  entityId: string
  address: ContactAddress | null
}

export function LandlordAddressSection({
  entityId, address,
}: Readonly<LandlordAddressSectionProps>) {
  const [editing, setEditing] = useState(false)

  const lines = address
    ? [
        address.street_line1,
        address.street_line2,
        [address.suburb, address.city].filter(Boolean).join(", "),
        [address.province, address.postal_code].filter(Boolean).join(" "),
      ].filter(Boolean)
    : []

  return (
    <div className="border-t pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
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
          entityType="landlords"
          entityId={entityId}
          address={address}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {lines.length > 0 ? (
            <div className="text-sm space-y-0.5">
              {lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No address on file.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Banking ─────────────────────────────────────────────────────────────────

interface LandlordBankingSectionProps {
  landlordId: string
  bankName: string | null
  bankAccount: string | null
  bankBranch: string | null
  bankAccountType: string | null
  taxNumber: string | null
  paymentMethod: string | null
}

export function LandlordBankingSection({
  landlordId, bankName, bankAccount, bankBranch, bankAccountType, taxNumber, paymentMethod,
}: Readonly<LandlordBankingSectionProps>) {
  const [editing, setEditing] = useState(false)

  const maskedAccount = bankAccount
    ? `${"•".repeat(Math.max(0, bankAccount.length - 4))}${bankAccount.slice(-4)}`
    : null

  return (
    <div className="border-t pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Banking</span>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <LandlordBankingForm
          landlordId={landlordId}
          bankName={bankName}
          bankAccount={bankAccount}
          bankBranch={bankBranch}
          bankAccountType={bankAccountType}
          taxNumber={taxNumber}
          paymentMethod={paymentMethod}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {bankName && <DetailRow label="Bank">{bankName}</DetailRow>}
          {maskedAccount && <DetailRow label="Account">{maskedAccount}</DetailRow>}
          {bankBranch && <DetailRow label="Branch">{bankBranch}</DetailRow>}
          {bankAccountType && <DetailRow label="Type">{bankAccountType}</DetailRow>}
          {taxNumber && <DetailRow label="Tax no.">{taxNumber}</DetailRow>}
          {paymentMethod && <DetailRow label="Payment">{paymentMethod}</DetailRow>}
          {!bankName && !maskedAccount && !bankAccountType && !taxNumber && !paymentMethod && (
            <p className="text-sm text-muted-foreground">No banking details.</p>
          )}
        </div>
      )}
    </div>
  )
}
