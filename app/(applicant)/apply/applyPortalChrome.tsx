/**
 * app/(applicant)/apply/applyPortalChrome.tsx — the ONE listing-application portal shell (ADDENDUM_14R).
 *
 * There is a single portal — the listing application portal. Both entry routes are just credentialled doors into
 * it: /apply/[slug] (public slug + optional resume token = the lead) and /apply/co-applicant/[token] (a co's
 * access token). The door differs only in HOW you prove who you are; everything past that — this chrome + the
 * <StepPanel> orchestrator — is identical, so it lives in ONE place. Who's joined to whom is pure DB
 * (application_co_applicants) + the adapter + the orchestrator hub; the chrome neither knows nor cares.
 *
 * Server component (renders the client theme/chrome providers + the server-rendered agent card + children). The
 * page resolves the credential, fetches listing/agent, builds the actor's resume, and renders:
 *   <ApplyPortalShell …><StepPanel actor resume … /></ApplyPortalShell>
 */
import type { ReactNode } from "react"
import Image from "next/image"
import { Phone, Mail, MessageCircle, ShieldCheck, type LucideIcon } from "lucide-react"
import { Wordmark } from "@/components/ui/Wordmark"
import { FocusBackdrop } from "@/components/layout/FocusBackdrop"
import "@/components/layout/focus-shell.css"
import { DetailCard } from "@/components/detail/DetailCard"
import { PublicThemeProvider } from "@/app/(public)/PublicThemeProvider"
import { ApplyChromeProvider, ApplyUnitStrip } from "./[slug]/applyChrome"
import { ApplyThemeToggle } from "./[slug]/ApplyLoginButton"

/** The portal's mono micro-label (header eyebrows + the in-content blocks). */
export function Eyebrow({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{children}</span>
}

/** Stacked contact row — matches the supplier/contractor detail card's contact lines. */
function ContactLine({ icon: Icon, href, children }: Readonly<{ icon: LucideIcon; href?: string; children: ReactNode }>) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {href
        ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="truncate transition-colors hover:text-brand">{children}</a>
        : <span className="truncate">{children}</span>}
    </div>
  )
}

/** SA mobile → wa.me link (leading 0 → 27), or null. */
function waLink(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replaceAll(/\D/g, "")
  if (digits.startsWith("0")) return `https://wa.me/27${digits.slice(1)}`
  if (digits.startsWith("27")) return `https://wa.me/${digits}`
  return null
}

/** "Your agent" card — the responsible agent + agency branding. Computes the call/WhatsApp/email affordances from
 *  the raw bits so the pages don't each repeat waLink/mailto assembly. Shown in StepPanel's side column. */
export function ApplyAgentCard({ orgName, orgEmail, orgPhone, orgLogoUrl, agentName, agentPhone, agentPhoto, enquirySubject }: Readonly<{
  orgName: string | null; orgEmail: string | null; orgPhone: string | null; orgLogoUrl: string | null
  agentName: string | null; agentPhone: string | null; agentPhoto: string | null; enquirySubject: string
}>) {
  const phone = agentPhone ?? orgPhone
  const waHref = waLink(phone)
  const enquiryMailto = orgEmail ? `mailto:${orgEmail}?subject=${encodeURIComponent(enquirySubject)}` : null
  return (
    <DetailCard title="Your agent" headerAction={orgLogoUrl ? <Image src={orgLogoUrl} alt={orgName ?? "Agency"} width={112} height={28} className="h-7 w-auto max-w-20 object-contain" unoptimized /> : undefined}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-[var(--ink)]">{orgName ?? "Managing agency"}</p>
            {agentName && <p className="text-sm leading-snug text-[var(--ink)]">{agentName}</p>}
            <p className="text-xs text-muted-foreground">Rental agent</p>
          </div>
          {agentPhoto && (
            <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-[var(--r-button)] border border-border">
              <Image src={agentPhoto} alt={agentName ?? "Agent"} fill className="object-cover object-top" unoptimized />
            </div>
          )}
        </div>
        {(phone || waHref || enquiryMailto) && (
          <div className="space-y-1.5 border-t border-border pt-3">
            {phone && <ContactLine icon={Phone} href={`tel:${phone.replaceAll(/\s/g, "")}`}>{phone}</ContactLine>}
            {waHref && <ContactLine icon={MessageCircle} href={waHref}>WhatsApp</ContactLine>}
            {enquiryMailto && <ContactLine icon={Mail} href={enquiryMailto}>{orgEmail}</ContactLine>}
          </div>
        )}
      </div>
    </DetailCard>
  )
}

/** The portal shell: warm theme + backdrop + the header (wordmark · listing strip · Encrypted · theme toggle ·
 *  optional login) + the content frame. `begun` seeds the chrome's begun-state (a resumed/co session starts begun
 *  so the listing strip shows). `login` is the lead's "Log in" affordance; a co (token-authed) passes nothing. */
export function ApplyPortalShell({ stripTitle, stripDetail, begun, login, children }: Readonly<{
  stripTitle: string; stripDetail: string; begun: boolean; login?: ReactNode; children: ReactNode
}>) {
  return (
    <PublicThemeProvider>
      <ApplyChromeProvider initial={begun}>
        <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: "var(--paper)", color: "var(--ink)" }}>
          <div className="pointer-events-none fixed inset-0 overflow-hidden"><FocusBackdrop /></div>
          <div className="relative z-10 flex h-full flex-col">
            <header className="shrink-0 border-b border-[var(--rule)] bg-[var(--paper-raised)]">
              <div className="mx-auto flex max-w-[1280px] items-center px-6 py-3">
                {/* Left zone — same width as the rail so the unit line starts in line with the form panel. */}
                <div className="flex shrink-0 items-center gap-3 [@media(min-width:1024px)_and_(min-height:700px)]:w-[300px]">
                  <Wordmark style={{ fontSize: 19 }} />
                  <span className="h-4 w-px shrink-0 bg-[var(--rule)]" />
                  <span className="hidden shrink-0 sm:inline"><Eyebrow>Rental application</Eyebrow></span>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 [@media(min-width:1024px)_and_(min-height:700px)]:ml-4">
                  <ApplyUnitStrip title={stripTitle} detail={stripDetail} />
                  <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                    <span className="hidden items-center gap-1.5 text-[var(--ink-mute)] sm:flex">
                      <ShieldCheck className="size-3.5" />
                      <Eyebrow>Encrypted</Eyebrow>
                    </span>
                    <ApplyThemeToggle />
                    {login}
                  </div>
                </div>
              </div>
            </header>

            {/* Content — fills the viewport on desktop (each column scrolls internally); page-scrolls on mobile. */}
            <div className="min-h-0 flex-1 overflow-y-auto [@media(min-width:1024px)_and_(min-height:700px)]:overflow-hidden">
              <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-6 py-4 [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
                {children}
              </div>
            </div>
          </div>
        </div>
      </ApplyChromeProvider>
    </PublicThemeProvider>
  )
}
