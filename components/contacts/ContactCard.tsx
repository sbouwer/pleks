import { Phone, Mail, MessageCircle, ExternalLink } from "lucide-react"

export type PortalStatus = "none" | "invited" | "active" | "suspended" | null

const AVATAR_CLASSES: Record<string, string> = {
  brand: "bg-brand/20 text-brand",
  blue: "bg-blue-100 text-blue-700",
  neutral: "bg-muted text-muted-foreground",
}

const STATUS_PILL: Record<string, string> = {
  invited: "rounded-full px-2 py-0.5 text-xs bg-amber-100 text-amber-700 font-medium",
  active: "rounded-full px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 font-medium",
  suspended: "rounded-full px-2 py-0.5 text-xs bg-red-100 text-red-700 font-medium",
}

function waLink(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  const normalized = digits.startsWith("0") ? `27${digits.slice(1)}` : digits
  return `https://wa.me/${normalized}`
}

function FicaPill({ verified }: { readonly verified: boolean | null | undefined }) {
  if (verified == null) return <span className="text-xs text-muted-foreground">—</span>
  const cls = verified
    ? "rounded-full px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 font-medium"
    : "rounded-full px-2 py-0.5 text-xs bg-amber-100 text-amber-700 font-medium"
  return <span className={cls}>{verified ? "Verified" : "Pending"}</span>
}

function PortalPill({ status }: { readonly status: PortalStatus }) {
  if (!status || status === "none") {
    return <span className="text-xs text-muted-foreground">Not invited</span>
  }
  const cls = STATUS_PILL[status] ?? "rounded-full px-2 py-0.5 text-xs bg-muted text-muted-foreground font-medium"
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={cls}>{label}</span>
}

function InfoRow({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-xs font-medium text-right">{children}</div>
    </div>
  )
}

export interface ContactCardProps {
  name: string
  subtitle: string
  avatarVariant?: "brand" | "blue" | "neutral"
  email: string | null
  phone: string | null
  profileHref?: string
  /** When true, renders the Type / ID / FICA / Portal / Welcome rows below the action buttons */
  showInfo?: boolean
  entityType?: string | null
  idOrRegNumber?: string | null
  idOrRegLabel?: string
  ficaVerified?: boolean | null
  portalStatus?: PortalStatus
  welcomePackSentAt?: string | null
}

export function ContactCard({
  name,
  subtitle,
  avatarVariant = "brand",
  email,
  phone,
  profileHref,
  showInfo = false,
  entityType,
  idOrRegNumber,
  idOrRegLabel = "ID number",
  ficaVerified,
  portalStatus,
  welcomePackSentAt,
}: ContactCardProps) {
  const colorCls = AVATAR_CLASSES[avatarVariant] ?? AVATAR_CLASSES.brand
  const hasContact = !!(phone ?? email)
  const entityLabel = entityType
    ? entityType.charAt(0).toUpperCase() + entityType.slice(1).replace(/_/g, " ")
    : "Individual"

  const welcomeLabel = welcomePackSentAt
    ? new Date(welcomePackSentAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
    : null

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 ${colorCls} shrink-0 rounded-full font-semibold text-sm flex items-center justify-center`}>
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
        {profileHref && (
          <a href={profileHref} className="shrink-0 text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Contact rows */}
      <div className="space-y-1.5">
        {phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{phone}</span>
          </div>
        )}
        {email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{email}</span>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-2 text-sm">
            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>WhatsApp: {phone}</span>
          </div>
        )}
        {!hasContact && (
          <p className="text-xs text-muted-foreground">No contact details on record.</p>
        )}
      </div>

      {/* Action buttons */}
      {hasContact && (
        <div className="flex gap-2">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex-1 text-center rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Call
            </a>
          )}
          {phone && (
            <a
              href={waLink(phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              WhatsApp
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex-1 text-center rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Email
            </a>
          )}
        </div>
      )}

      {/* Optional info section */}
      {showInfo && (
        <>
          <div className="border-t border-border/40" />
          <div>
            <InfoRow label="Type">{entityLabel}</InfoRow>
            <InfoRow label={idOrRegLabel}>
              {idOrRegNumber ?? <span className="text-muted-foreground">—</span>}
            </InfoRow>
            <InfoRow label="FICA status">
              <FicaPill verified={ficaVerified} />
            </InfoRow>
            <InfoRow label="Portal status">
              <PortalPill status={portalStatus ?? null} />
            </InfoRow>
            <InfoRow label="Welcome pack">
              {welcomeLabel ?? <span className="text-muted-foreground">Not sent</span>}
            </InfoRow>
          </div>
        </>
      )}
    </div>
  )
}
