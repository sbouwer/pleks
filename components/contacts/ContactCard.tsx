"use client"

import { Phone, Mail, MessageCircle, ExternalLink, MapPin } from "lucide-react"

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
  const digits = phone.replaceAll(/\D/g, "")
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
  readonly name: string
  readonly subtitle: string
  readonly avatarVariant?: "brand" | "blue" | "neutral"
  readonly email: string | null
  readonly phone: string | null
  readonly address?: string | null
  readonly profileHref?: string
  /**
   * When set, renders a management status label in the header right side.
   * "self-managed" → renders "self-managed" in muted text.
   * Any other string → renders "managed by\n[value]".
   */
  readonly managedBy?: string | null
  /** When true, renders the Type / ID / FICA / Portal / Welcome rows below the action buttons */
  readonly showInfo?: boolean
  readonly entityType?: string | null
  readonly idOrRegNumber?: string | null
  readonly idOrRegLabel?: string
  readonly ficaVerified?: boolean | null
  readonly portalStatus?: PortalStatus
  readonly welcomePackSentAt?: string | null
  readonly onSendWelcomePack?: () => void
  /** Extra nodes rendered in the header right slot, next to the profile link */
  readonly headerActions?: React.ReactNode
}

export function ContactCard({
  name,
  subtitle,
  avatarVariant = "brand",
  email,
  phone,
  address,
  profileHref,
  managedBy,
  showInfo = false,
  entityType,
  idOrRegNumber,
  idOrRegLabel = "ID number",
  ficaVerified,
  portalStatus,
  welcomePackSentAt,
  onSendWelcomePack,
  headerActions,
}: ContactCardProps) {
  const colorCls = AVATAR_CLASSES[avatarVariant] ?? AVATAR_CLASSES.brand
  const entityLabel = entityType
    ? entityType.charAt(0).toUpperCase() + entityType.slice(1).replaceAll("_", " ")
    : "Individual"

  const welcomeLabel = welcomePackSentAt
    ? new Date(welcomePackSentAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
    : null

  const isSelfManaged = managedBy === "self-managed"

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 ${colorCls} shrink-0 rounded-full font-semibold text-sm flex items-center justify-center mt-0.5`}>
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
        <div className="flex items-start gap-2 shrink-0">
          {managedBy && (
            <div className="text-right">
              {isSelfManaged ? (
                <p className="text-xs text-muted-foreground">self-managed</p>
              ) : (
                <>
                  <p className="text-[10px] text-muted-foreground/70">managed by</p>
                  <p className="text-xs text-muted-foreground font-medium">{managedBy}</p>
                </>
              )}
            </div>
          )}
          {headerActions}
          {profileHref && (
            <a href={profileHref} className="text-muted-foreground hover:text-foreground mt-0.5">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Contact rows — always shown, "—" when missing */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {phone ? <span>{phone}</span> : <span className="text-muted-foreground">—</span>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {email ? <span className="truncate">{email}</span> : <span className="text-muted-foreground">—</span>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {phone ? <span>WhatsApp: {phone}</span> : <span className="text-muted-foreground">—</span>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {address ? <span className="truncate">{address}</span> : <span className="text-muted-foreground">—</span>}
        </div>
      </div>

      {/* Action buttons — always shown, greyed out when data is missing */}
      <div className="flex gap-2">
        {phone ? (
          <a href={`tel:${phone}`} className="flex-1 text-center rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
            Call
          </a>
        ) : (
          <span className="flex-1 text-center rounded-md border border-border/40 px-2 py-1.5 text-xs font-medium text-muted-foreground/50 cursor-not-allowed">
            Call
          </span>
        )}
        {phone ? (
          <a href={waLink(phone)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
            WhatsApp
          </a>
        ) : (
          <span className="flex-1 text-center rounded-md border border-border/40 px-2 py-1.5 text-xs font-medium text-muted-foreground/50 cursor-not-allowed">
            WhatsApp
          </span>
        )}
        {email ? (
          <a href={`mailto:${email}`} className="flex-1 text-center rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
            Email
          </a>
        ) : (
          <span className="flex-1 text-center rounded-md border border-border/40 px-2 py-1.5 text-xs font-medium text-muted-foreground/50 cursor-not-allowed">
            Email
          </span>
        )}
      </div>

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
              {welcomeLabel ?? (
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-normal">Not sent</span>
                  {onSendWelcomePack && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={onSendWelcomePack}
                        className="text-brand hover:underline font-medium"
                      >
                        Send
                      </button>
                    </>
                  )}
                </span>
              )}
            </InfoRow>
          </div>
        </>
      )}
    </div>
  )
}
