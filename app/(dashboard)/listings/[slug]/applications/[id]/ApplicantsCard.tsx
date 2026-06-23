/**
 * app/(dashboard)/listings/[slug]/applications/[id]/ApplicantsCard.tsx
 * Applicant identity card. SINGLE applicant → full details inline. MULTIPLE (joint / guarantor) → a compact
 * per-party list (name · role · declared income) with a "View" that opens the full details in a modal — so a
 * joint application stays scannable. ID reveal stays gated to the primary (the agent fraud check).
 */
"use client"
import { useState } from "react"
import { DetailCard } from "@/components/detail/DetailCard"
import { ModalCard } from "@/components/ui/modal-card"
import { IdReveal } from "./_components/IdReveal"
import { formatZAR } from "@/lib/constants"

export interface PartyInfo {
  label: string
  role: string
  email?: string | null
  phone?: string | null
  idType?: string | null
  employment?: string | null
  employer?: string | null
  incomeCents?: number | null
  isPrimary?: boolean
  hasIdNumber?: boolean
}

const ROLE_LABEL: Record<string, string> = { primary: "Primary", co_applicant: "Co-applicant", guarantor: "Guarantor" }
function roleLabel(role: string) { return ROLE_LABEL[role] ?? "Applicant" }

function Row({ k, v }: Readonly<{ k: string; v: string }>) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>
}

function PartyDetails({ party, applicationId, canViewId }: Readonly<{ party: PartyInfo; applicationId: string; canViewId: boolean }>) {
  return (
    <div className="space-y-2 text-sm">
      {party.email !== undefined && <Row k="Email" v={party.email || "—"} />}
      {party.phone !== undefined && <Row k="Phone" v={party.phone || "—"} />}
      <Row k="ID type" v={party.idType?.replaceAll("_", " ") || "—"} />
      {party.isPrimary && <IdReveal applicationId={applicationId} idType={party.idType ?? null} hasIdNumber={!!party.hasIdNumber} hasCapability={canViewId} />}
      <Row k="Employment" v={party.employment || "—"} />
      {party.employer && <Row k="Employer" v={party.employer} />}
      <Row k="Stated income" v={party.incomeCents ? `${formatZAR(party.incomeCents)}/mo` : "—"} />
    </div>
  )
}

export function ApplicantsCard({ applicationId, canViewId, primary, others }: Readonly<{
  applicationId: string; canViewId: boolean; primary: PartyInfo; others: PartyInfo[]
}>) {
  const [viewing, setViewing] = useState<PartyInfo | null>(null)

  if (others.length === 0) {
    return (
      <DetailCard title="Applicant details">
        <PartyDetails party={primary} applicationId={applicationId} canViewId={canViewId} />
      </DetailCard>
    )
  }

  const all = [primary, ...others]
  return (
    <DetailCard title="Applicants" count={all.length}>
      <ul className="space-y-2 text-sm">
        {all.map((p, i) => (
          <li key={`${p.role}-${i}`} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
            <div className="min-w-0">
              <span className="font-medium text-foreground">{p.label}</span>
              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{roleLabel(p.role)}</span>
              <span className="block text-xs text-muted-foreground">{p.incomeCents ? `${formatZAR(p.incomeCents)}/mo declared` : "income —"}</span>
            </div>
            <button type="button" onClick={() => setViewing(p)} className="shrink-0 text-xs text-brand hover:underline">View</button>
          </li>
        ))}
      </ul>
      <ModalCard open={viewing != null} onOpenChange={(o) => { if (!o) setViewing(null) }} eyebrow={viewing ? roleLabel(viewing.role) : ""} title={viewing?.label ?? ""}>
        {viewing && <PartyDetails party={viewing} applicationId={applicationId} canViewId={canViewId} />}
      </ModalCard>
    </DetailCard>
  )
}
