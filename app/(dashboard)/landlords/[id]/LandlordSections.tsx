"use client"

/**
 * app/(dashboard)/landlords/[id]/LandlordSections.tsx — inline-editable landlord detail sections (identity, contact, address, banking)
 *
 * Route:  /landlords/[id]
 * Auth:   gateway-protected server wrapper
 * Data:   landlord fields passed from server page; each section manages own edit state
 */
import { useState } from "react"
import { EditButton } from "@/components/ui/actions"
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
  contactId: string
  entityType: string
  title: string | null
  gender: string | null
  firstName: string | null
  lastName: string | null
  companyName: string | null
  tradingAs: string | null
  registrationNumber: string | null
  vatNumber: string | null
  notes: string | null
}

const GENDER_LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" }

export function LandlordIdentitySection({
  landlordId, contactId, entityType, title, gender, firstName, lastName, companyName, tradingAs, registrationNumber, vatNumber, notes,
}: Readonly<LandlordIdentitySectionProps>) {
  const [editing, setEditing] = useState(false)

  const fullName = [title, firstName, lastName].filter(Boolean).join(" ").trim()
  const displayName = companyName || fullName || null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identity</span>
        {!editing && (
          <EditButton mode="label" label="Edit" onClick={() => setEditing(true)} />
        )}
      </div>
      {editing ? (
        <LandlordIdentityForm
          landlordId={landlordId}
          contactId={contactId}
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
          {!companyName && gender && <DetailRow label="Gender">{GENDER_LABEL[gender] ?? gender}</DetailRow>}
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
  // contacts.primary_phone/email — the add/edit modal writes these (not child rows); shown when no child rows exist.
  fallbackPhone?: string | null
  fallbackEmail?: string | null
}

export function LandlordContactSection({
  entityId, phones, emails, fallbackPhone, fallbackEmail,
}: Readonly<LandlordContactSectionProps>) {
  const [editing, setEditing] = useState(false)

  const primaryPhone = phones.find((p) => p.is_primary) ?? phones[0] ?? null
  const primaryEmail = emails.find((e) => e.is_primary) ?? emails[0] ?? null
  const extraPhones = phones.length > 1 ? phones.length - 1 : 0
  const extraEmails = emails.length > 1 ? emails.length - 1 : 0
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
          entityType="landlords"
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
              {extraPhones > 0 && (
                <span className="text-muted-foreground ml-1">(+{extraPhones} more)</span>
              )}
            </DetailRow>
          ) : null}
          {emailDisplay ? (
            <DetailRow label="Email">
              <a href={`mailto:${emailDisplay}`} className="hover:underline break-all">
                {emailDisplay}
              </a>
              {extraEmails > 0 && (
                <span className="text-muted-foreground ml-1">(+{extraEmails} more)</span>
              )}
            </DetailRow>
          ) : null}
          {!phoneDisplay && !emailDisplay && (
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
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</span>
        {!editing && (
          <EditButton mode="label" label="Edit" onClick={() => setEditing(true)} />
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

interface LandlordPaymentSectionProps {
  landlordId: string
  contactId: string
  taxNumber: string | null
  paymentMethod: string | null
}

// Tax + payment preference. Bank accounts moved to the multi-account BankAccountsSection (contact_bank_accounts).
export function LandlordBankingSection({
  landlordId, contactId, taxNumber, paymentMethod,
}: Readonly<LandlordPaymentSectionProps>) {
  const [editing, setEditing] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment details</span>
        {!editing && (
          <EditButton mode="label" label="Edit" onClick={() => setEditing(true)} />
        )}
      </div>
      {editing ? (
        <LandlordBankingForm
          landlordId={landlordId}
          contactId={contactId}
          taxNumber={taxNumber}
          paymentMethod={paymentMethod}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div>
          {taxNumber && <DetailRow label="Tax no.">{taxNumber}</DetailRow>}
          {paymentMethod && <DetailRow label="Payment">{paymentMethod}</DetailRow>}
          {!taxNumber && !paymentMethod && (
            <p className="text-sm text-muted-foreground">No payment details.</p>
          )}
        </div>
      )}
    </div>
  )
}
