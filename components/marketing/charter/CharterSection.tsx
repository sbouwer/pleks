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
import { CHARTER_COMMITMENTS } from "./commitments"
import { MARKETING_FACTS } from "@/lib/marketing/facts"

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
            {MARKETING_FACTS.charter.total} commitments we&apos;ve put in writing, not in marketing copy. Every one exists
            because the alternative has bitten someone in this industry. Every one is
            enforceable — by you, by your tenants, by the Information Regulator.
          </p>
          <VaultDoorSVG />
        </div>

        <ol className={styles.charterGrid}>
          {CHARTER_COMMITMENTS.map(c => (
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
