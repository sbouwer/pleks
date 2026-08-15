/**
 * components/legal/SupplierDisclosure.tsx — supplier identity block for the public legal suite
 *
 * Auth:   public
 * Data:   COMPANY_IDENTITY (lib/legal/company-identity.ts)
 * Notes:  Renders the ECT Act s43(1) supplier disclosure — legal name, status, registration number,
 *         address for service, telephone, email, Information Officer. Fields that are still null in
 *         the SSOT are OMITTED, never rendered as a placeholder: a published "[TBC]" satisfies
 *         neither s43(1) nor PAIA s51(1)(a) and simply advertises the gap. Fill the constants and
 *         every consuming page completes at once.
 */
import { COMPANY_IDENTITY } from "@/lib/legal/company-identity"

type RowKind = "text" | "email" | "tel"
interface Row { readonly label: string; readonly value: string; readonly kind: RowKind }

function RowValue({ row }: { readonly row: Row }) {
  if (row.kind === "email") return <a href={`mailto:${row.value}`}>{row.value}</a>
  if (row.kind === "tel")   return <a href={`tel:${row.value.replace(/\s/g, "")}`}>{row.value}</a>
  return <>{row.value}</>
}

export function SupplierDisclosure({ heading = "Supplier information" }: { readonly heading?: string }) {
  const c = COMPANY_IDENTITY

  const rows: Row[] = [
    { label: "Legal name",   value: c.legalName,   kind: "text" },
    { label: "Legal status", value: c.legalStatus, kind: "text" },
    ...(c.registrationNumber ? [{ label: "Registration number", value: c.registrationNumber, kind: "text" as const }] : []),
    ...(c.streetAddress      ? [{ label: "Street address",      value: c.streetAddress,      kind: "text" as const }] : []),
    ...(c.postalAddress      ? [{ label: "Postal address",      value: c.postalAddress,      kind: "text" as const }] : []),
    ...(c.streetAddress      ? [] : [{ label: "Location",       value: c.region,             kind: "text" as const }]),
    { label: "Telephone",           value: c.telephone,          kind: "tel"   },
    { label: "Email",               value: c.email,              kind: "email" },
    { label: "Information Officer", value: c.informationOfficer, kind: "text"  },
  ]

  return (
    <div className="officer-card" style={{ display: "block" }}>
      <span className="l" style={{ display: "block", marginBottom: "0.5rem" }}>{heading}</span>
      <span className="v" style={{ display: "block" }}>
        {rows.map((r) => (
          <span key={r.label} style={{ display: "block" }}>
            <span className="sub">{r.label}:</span>{" "}<RowValue row={r} />
          </span>
        ))}
      </span>
    </div>
  )
}
