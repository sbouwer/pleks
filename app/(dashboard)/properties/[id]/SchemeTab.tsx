import Link from "next/link"
import { Building2, User, FileText } from "lucide-react"
import { formatZAR } from "@/lib/constants"

export interface ManagingSchemeData {
  id:                       string
  name:                     string
  scheme_type:              string
  csos_registration_number: string | null
  levy_cycle:               string | null
  csos_ombud_contact:       string | null
  notes:                    string | null
  managing_agent_name:      string | null
  managing_agent_email:     string | null
  managing_agent_phone:     string | null
  emergency_contact_name:   string | null
  emergency_contact_phone:  string | null
  levy_amount_cents:        number | null
}

interface SchemeTabProps {
  propertyId: string
  scheme:     ManagingSchemeData
}

const SCHEME_TYPE_LABELS: Record<string, string> = {
  body_corporate:     "Body corporate",
  hoa:                "HOA",
  share_block:        "Share block",
  retirement_village: "Retirement village",
  other:              "Other",
}

const LEVY_CYCLE_LABELS: Record<string, string> = {
  monthly:   "Monthly",
  quarterly: "Quarterly",
  annually:  "Annually",
}

function KvRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  editHref,
  children,
}: Readonly<{
  title: string
  icon: React.ElementType
  editHref?: string
  children: React.ReactNode
}>) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{title}</span>
        </div>
        {editHref && (
          <Link href={editHref} className="text-xs text-brand hover:underline">Edit</Link>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

export function SchemeTab({ propertyId, scheme }: Readonly<SchemeTabProps>) {
  const editHref = `/properties/${propertyId}/scheme/edit`

  return (
    <div className="space-y-6">
      {/* Scheme details */}
      <SectionCard title="Scheme details" icon={Building2} editHref={editHref}>
        <KvRow label="Name"              value={scheme.name} />
        <KvRow
          label="Type"
          value={SCHEME_TYPE_LABELS[scheme.scheme_type] ?? scheme.scheme_type}
        />
        <KvRow
          label="CSOS registration"
          value={scheme.csos_registration_number ?? <span className="text-muted-foreground">—</span>}
        />
        <KvRow
          label="Levy cycle"
          value={scheme.levy_cycle ? LEVY_CYCLE_LABELS[scheme.levy_cycle] ?? scheme.levy_cycle : <span className="text-muted-foreground">—</span>}
        />
        {scheme.levy_amount_cents !== null && (
          <KvRow
            label="Monthly levy"
            value={formatZAR(scheme.levy_amount_cents)}
          />
        )}
        <KvRow
          label="CSOS ombud contact"
          value={scheme.csos_ombud_contact ?? <span className="text-muted-foreground">—</span>}
        />
        {scheme.notes && (
          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
            {scheme.notes}
          </p>
        )}
      </SectionCard>

      {/* Managing agent */}
      {scheme.managing_agent_name && (
        <SectionCard title="Managing agent" icon={User}>
          <p className="text-sm font-medium mb-1">{scheme.managing_agent_name}</p>
          {scheme.managing_agent_email && (
            <p className="text-xs text-muted-foreground">{scheme.managing_agent_email}</p>
          )}
          {scheme.managing_agent_phone && (
            <p className="text-xs text-muted-foreground">{scheme.managing_agent_phone}</p>
          )}
        </SectionCard>
      )}

      {/* Emergency contact */}
      {scheme.emergency_contact_name && (
        <SectionCard title="Emergency contact" icon={FileText}>
          <p className="text-sm font-medium mb-1">{scheme.emergency_contact_name}</p>
          {scheme.emergency_contact_phone && (
            <p className="text-xs text-muted-foreground">{scheme.emergency_contact_phone}</p>
          )}
        </SectionCard>
      )}

      {/* Unlink */}
      <div className="pt-2">
        <Link
          href={`/properties/${propertyId}/scheme/edit`}
          className="text-xs text-muted-foreground hover:text-danger transition-colors"
        >
          Remove managing scheme from this property →
        </Link>
      </div>
    </div>
  )
}
