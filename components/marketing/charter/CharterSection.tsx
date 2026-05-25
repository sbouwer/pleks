/**
 * components/marketing/charter/CharterSection.tsx — Pleks Charter section
 *
 * Notes:  Server component — static HTML + CSS only; no JS hydration.
 *         Asymmetric grid: §01 featured 2×2, §02–§08 standard cells, §09 register.
 *         Spec: BUILD_66_CHARTER_HOMEPAGE.md §7.1, §3, §4
 */
import styles from "./charter.module.css"
import { VaultDoorSVG } from "@/app/(public)/svgs/VaultDoorSVG"
import { CharterCard } from "./CharterCard"
import { CharterRegisterCard } from "./CharterRegisterCard"
import { ArtefactReconciliation } from "./artefacts/ArtefactReconciliation"
import { ArtefactMandate }        from "./artefacts/ArtefactMandate"
import { ArtefactManifest }       from "./artefacts/ArtefactManifest"
import { ArtefactStateAccess }    from "./artefacts/ArtefactStateAccess"
import { ArtefactErasureTimeline } from "./artefacts/ArtefactErasureTimeline"
import { ArtefactNoTracking }     from "./artefacts/ArtefactNoTracking"
import { ArtefactAgencyIsolation } from "./artefacts/ArtefactAgencyIsolation"
import { ArtefactBreachClock }    from "./artefacts/ArtefactBreachClock"
import type { ComponentType, ReactNode } from "react"

interface Commitment {
  num: number
  label: string
  featured?: boolean
  title: ReactNode
  body: string
  foot: string
  hover: string
  href: string
  Artefact: ComponentType
}

const COMMITMENTS: Commitment[] = [
  {
    num: 1,
    label: "§01 · TRUST MONEY",
    featured: true,
    title: <>We <span className="amber-wash-underline">never</span> hold your landlord&apos;s money.</>,
    body: "Client funds stay in your Section 86 trust account, at your own bank, under your own FFC. Pleks has no outbound payment rail — and can't grow one without a total architectural rewrite. We didn't just write a policy; we removed the pipes.",
    foot: "Enforced at 4 layers",
    hover: "See it in the architecture",
    href: "/for-agents/trust-account",
    Artefact: ArtefactReconciliation,
  },
  {
    num: 2,
    label: "§02 · TENANT DATA",
    title: "We never hold your tenant's bank details either.",
    body: "Rent moves tenant-bank to your-bank on a mandate their bank holds against yours. We observe the reconciliation — we don't run the rail.",
    foot: "No inbound rail",
    hover: "Tenant data register",
    href: "/popia-register#part-b",
    Artefact: ArtefactMandate,
  },
  {
    num: 3,
    label: "§03 · PORTABILITY",
    title: <>You can leave <span className="amber-wash-underline">any month</span>. We&apos;ll help you pack.</>,
    body: "Full export on demand. Every lease, inspection photo, statement, mandate, audit entry. Signed and hashed.",
    foot: "PDF + JSON + ZIP",
    hover: "Your data rights",
    href: "/privacy#rights",
    Artefact: ArtefactManifest,
  },
  {
    num: 4,
    label: "§04 · ACCESS CONTINUITY",
    title: <><span className="amber-wash-underline">Overdue</span> doesn&apos;t lock you out.</>,
    body: "If we ever need to chase you for an invoice, we'll chase the invoice. Nobody's rent roll becomes the collateral.",
    foot: "In every Operator agreement",
    hover: "Read the clause",
    href: "/terms#cancellation",
    Artefact: ArtefactStateAccess,
  },
  {
    num: 5,
    label: "§05 · RIGHT TO BE FORGOTTEN",
    title: <>Your tenant&apos;s erasure request <span className="amber-wash-underline">actually works</span>.</>,
    body: "30 days. Carve-outs (FICA 5y, PPRA, Tribunal holds) disclosed before they submit, not after. No silent retention.",
    foot: "Retention-aware cascade",
    hover: "What stays, what goes",
    href: "/popia-register#subject-rights",
    Artefact: ArtefactErasureTimeline,
  },
  {
    num: 6,
    label: "§06 · NO TRACKING",
    title: <>You&apos;re <span className="amber-wash-underline">not</span> a dataset. Your tenants aren&apos;t either.</>,
    body: "Our AI provider operates under a zero-data-retention policy. No product-analytics vendors deployed. Deliberately, not accidentally.",
    foot: "AI zero-retention · zero analytics",
    hover: "Sub-processor list",
    href: "/privacy#subprocessors",
    Artefact: ArtefactNoTracking,
  },
  {
    num: 7,
    label: "§07 · AGENCY ISOLATION",
    title: <>One agency&apos;s rejection doesn&apos;t become another agency&apos;s <span className="amber-wash-underline">blacklist</span>.</>,
    body: "FitScore evaluates each applicant on their own declared evidence — credit, affordability, references, ID integrity. Outcomes don't pool across agencies; another agency's history doesn't reach yours.",
    foot: "Zero cross-org aggregation",
    hover: "Applicant data register",
    href: "/popia-register#part-a",
    Artefact: ArtefactAgencyIsolation,
  },
  {
    num: 8,
    label: "§08 · BREACH POSTURE",
    title: <>If something goes wrong, you hear within <span className="amber-wash-underline">24 hours</span>.</>,
    body: "POPIA gives us 72. We've committed to 24. Post-mortem published. Incident escalation path always surfaced.",
    foot: "3× faster than required",
    hover: "Breach notification policy",
    href: "/privacy#breach",
    Artefact: ArtefactBreachClock,
  },
]

export function CharterSection() {
  return (
    <section id="charter" className={styles.charter}>
      <div className="pub-wrap">
        <div className="pub-section-head" style={{ position: "relative" }}>
          <div>
            <div className="pub-eyebrow" style={{ marginBottom: 12 }}>
              <span className="amber-rule" />The Pleks Charter
            </div>
            <h2 className="pub-h1" style={{ maxWidth: "32ch", margin: 0 }}>
              Your data is yours. Your landlord&apos;s money is theirs. We&apos;re just the{" "}
              <span className="amber-wash-underline">filing cabinet</span> — and it opens from both sides.
            </h2>
          </div>
          <p className="pub-body" style={{ maxWidth: "62ch" }}>
            Eight commitments we&apos;ve put in writing, not in marketing copy. Every one exists
            because the alternative has bitten someone in this industry. Every one is
            enforceable — by you, by your tenants, by the Information Regulator.
          </p>
          <VaultDoorSVG />
        </div>

        <ol className={styles.charterGrid}>
          {COMMITMENTS.map(c => (
            <li key={c.num} className={c.featured ? styles.charterGridItemFeatured : undefined}>
              <CharterCard {...c} />
            </li>
          ))}
          <li>
            <CharterRegisterCard />
          </li>
        </ol>
      </div>
    </section>
  )
}
