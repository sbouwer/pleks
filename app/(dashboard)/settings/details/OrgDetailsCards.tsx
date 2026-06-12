"use client"

/**
 * app/(dashboard)/settings/details/OrgDetailsCards.tsx — Organisation › Details tab body (4 summary cards)
 *
 * Route:  /settings/details?tab=details
 * Auth:   client island; edits go through EditOrgModal (org → /api/org/details, banking → agent write gate)
 * Data:   org details + business/trust banking loaded by the page; refresh() after a save.
 * Notes:  Four read-only DetailCards — Organisation · Contact · Address · Banking — each with an edit
 *         pencil that opens the org wizard modal jumped to that step. Banking shows the business + trust
 *         summary; trust editing routes to the Trust account section from inside the modal.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { DetailCard } from "@/components/detail/DetailCard"
import { EditOrgModal } from "./EditOrgModal"
import type { OrgDetails, OrgStepId } from "./types"
import type { OrgBusinessAccount, OrgTrustAccountSummary } from "@/lib/actions/orgBanking"

const TRUST_TYPE_LABEL: Record<string, string> = { trust: "Trust account", ppra_trust: "PPRA trust", deposit_holding: "Deposit holding" }
const mask = (n: string | null) => (n && n.length >= 4 ? `••••${n.slice(-4)}` : n || null)

function EditPencil({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="pa-edit">
      <Pencil className="size-3.5" />
    </button>
  )
}

function Rows({ rows }: Readonly<{ rows: ReadonlyArray<{ k: string; v: string | null }> }>) {
  return (
    <dl className="divide-y divide-border/60">
      {rows.map((r) => (
        <div key={r.k} className="flex items-baseline justify-between gap-4 py-2 text-sm">
          <dt className="shrink-0 text-muted-foreground">{r.k}</dt>
          <dd className={r.v ? "text-right font-medium text-foreground" : "text-right text-muted-foreground/50"}>{r.v || "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

function addrLine(parts: ReadonlyArray<string | null>): string | null {
  const s = parts.map((p) => p?.trim()).filter(Boolean).join(", ")
  return s || null
}

/** Brand glyphs (lucide dropped brand icons over trademark). Single-path, fill currentColor. */
type SocialIcon = (props: { className?: string }) => React.JSX.Element
const LinkedinGlyph: SocialIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" /></svg>
)
const FacebookGlyph: SocialIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
)
const InstagramGlyph: SocialIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
)
const XGlyph: SocialIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
)

const SOCIALS: ReadonlyArray<{ key: "linkedin_url" | "facebook_url" | "instagram_url" | "x_url"; Icon: SocialIcon; label: string }> = [
  { key: "linkedin_url", Icon: LinkedinGlyph, label: "LinkedIn" },
  { key: "facebook_url", Icon: FacebookGlyph, label: "Facebook" },
  { key: "instagram_url", Icon: InstagramGlyph, label: "Instagram" },
  { key: "x_url", Icon: XGlyph, label: "X" },
]
const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

function SocialIcons({ data }: Readonly<{ data: OrgDetails }>) {
  const items = SOCIALS.filter((s) => data[s.key])
  if (items.length === 0) return null
  return (
    <div className="mt-1 flex items-center gap-2 border-t border-border/60 pt-3">
      {items.map(({ key, Icon, label }) => (
        <a
          key={key}
          href={href(data[key]!)}
          target="_blank"
          rel="noreferrer noopener"
          title={label}
          aria-label={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-button)] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Icon className="size-4" />
        </a>
      ))}
    </div>
  )
}

export function OrgDetailsCards({
  data, business, trust,
}: Readonly<{ data: OrgDetails; business: OrgBusinessAccount | null; trust: OrgTrustAccountSummary[] }>) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [step, setStep] = useState<OrgStepId | "banking">("organisation")

  function openAt(s: OrgStepId | "banking") { setStep(s); setEditOpen(true) }

  const primaryAddr = addrLine([data.addr_line1, data.addr_suburb, data.addr_city, data.addr_province, data.addr_postal_code])
  const secondAddr = addrLine([data.addr2_line1, data.addr2_suburb, data.addr2_city, data.addr2_province, data.addr2_postal_code])

  return (
    <>
      <DetailCard title="Organisation details" headerAction={<EditPencil label="Edit organisation details" onClick={() => openAt("organisation")} />}>
        <Rows rows={[
          { k: "Legal entity name", v: data.name },
          { k: "Trading as", v: data.trading_as },
          { k: "CIPC registration", v: data.reg_number },
          { k: "EAAB / FFC number", v: data.eaab_number },
          { k: "VAT number", v: data.vat_number },
        ]} />
      </DetailCard>

      <DetailCard title="Contact details" headerAction={<EditPencil label="Edit contact details" onClick={() => openAt("contact")} />}>
        <Rows rows={[
          { k: "Email", v: data.email },
          { k: "Phone", v: data.phone },
          { k: "Website", v: data.website },
        ]} />
        <SocialIcons data={data} />
      </DetailCard>

      <DetailCard title="Address" headerAction={<EditPencil label="Edit address" onClick={() => openAt("address")} />}>
        <Rows rows={[
          { k: "Primary", v: primaryAddr },
          ...(secondAddr ? [{ k: "Additional", v: secondAddr }] : []),
        ]} />
      </DetailCard>

      <DetailCard title="Banking" headerAction={<EditPencil label="Edit banking" onClick={() => openAt("banking")} />}>
        <Rows rows={[
          { k: "Business account", v: business?.bank_name ? `${business.bank_name} · ${mask(business.account_number) ?? "—"}` : null },
          ...trust.map((a) => ({ k: TRUST_TYPE_LABEL[a.type] ?? a.type, v: a.bank_name ? `${a.bank_name} · ${mask(a.account_number) ?? "—"}` : null })),
        ]} />
      </DetailCard>

      <EditOrgModal
        open={editOpen}
        onOpenChange={setEditOpen}
        initialStep={step}
        data={data}
        business={business}
        trust={trust}
        isAgency={data.type === "agency"}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
