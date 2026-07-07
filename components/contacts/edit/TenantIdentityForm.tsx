/**
 * components/contacts/edit/TenantIdentityForm.tsx — read-only view of a tenant's identity fields (masked ID, DOB, nationality)
 *
 * Notes:  Exports TenantIdentityReadView; the ID number is masked to its last 4 digits — never render it raw.
 */
import { DetailRow } from "@/components/contacts/DetailRow"

interface TenantIdentityFormProps {
  idNumber: string | null
  idType: string | null
  dateOfBirth: string | null
  nationality: string | null
}

export function TenantIdentityReadView({ idNumber, idType, dateOfBirth, nationality }: Readonly<TenantIdentityFormProps>) {
  const masked = idNumber ? `••••••••••${idNumber.slice(-4)}` : null
  return (
    <div>
      {masked && <DetailRow label={idType === "passport" ? "Passport" : "ID number"}>{masked}</DetailRow>}
      {dateOfBirth && <DetailRow label="Date of birth">{new Date(dateOfBirth).toLocaleDateString("en-ZA")}</DetailRow>}
      {nationality && <DetailRow label="Nationality">{nationality}</DetailRow>}
    </div>
  )
}
