/**
 * components/marketing/founder/FounderSection.tsx — marketing "founder story" section wrapping the timeline
 *
 * Notes:  Presentational. Owns the static MOMENTS dataset and hands it to FounderTimeline.
 */
import { FounderTimeline, type MomentData } from "./FounderTimeline"
import { PegboardSVG } from "@/app/(public)/svgs/PegboardSVG"
import styles from "./founder.module.css"

const MOMENTS: MomentData[] = [
  {
    id: 1, side: "left", phase: "slate",
    year: "2004 — 2014", tag: "LEGAL", tagColour: "slate",
    title: "A decade inside legal practice.",
    body: "Two law firms, one custom-built case-management system. The years where the discipline of paperwork-that-holds-up settled in — every contract dated, every change captured, every file ready when someone needed it.",
    bodyHighlight: "paperwork-that-holds-up",
    foot: "Where the audit-trail discipline came from",
  },
  {
    id: 2, side: "right", phase: "slate",
    year: "2014 — 2020", tag: "DEV", tagColour: "slate",
    title: "Property development from the ground up.",
    body: "Mixed-use developments, commercial complexes, retail builds. The years where contractor management, scheme governance, and the realities of getting a building out of the ground replaced theoretical legal work.",
    foot: "Where the contractor-side knowledge came from",
  },
  {
    id: 3, side: "left", phase: "slate",
    year: "2020 — 2024", tag: "MGMT", tagColour: "slate",
    title: "Active rental portfolio management.",
    body: "Reports. Tenant comms. Move-ins, move-outs. Deposit reconciliations. The day-to-day work where most of the existing software fell short — and where the gap that became Pleks first got named.",
    bodyHighlight: "the gap that became Pleks first got named",
    foot: "Where the day-to-day pain came from",
  },
  {
    id: 4, side: "right", phase: "amber",
    year: "2024", tag: "IDEA", tagColour: "amber",
    title: "The product the market wasn't building.",
    body: "Started sketching Pleks as the alternative — not another listing portal, not another lightweight rent-collector. The system the incumbents had skipped, built for the regulated 70% where the work actually lives.",
    bodyHighlight: "the regulated 70%",
    foot: "Where the spec for Pleks was written",
  },
  {
    id: 5, side: "left", phase: "amber",
    year: "2025", tag: "BUILD", tagColour: "amber",
    title: "Eighteen months of building, with the founding agencies in the room.",
    body: "Every workflow rebuilt from the practitioner's side of the desk, against real production data from agencies who'd agreed to be early. Their bug reports shaped the product more than any roadmap document.",
    foot: "Where the soft-beta cohort joined",
  },
  {
    id: 6, side: "right", phase: "now",
    year: "2026", tag: "NOW", tagColour: "amber",
    title: "Public release.",
    body: "Founding-agent cohort opens. Cape Town, Johannesburg, Durban — the cities where the team that tested it actually works.",
    foot: "v2026.1 · 2026-05-01",
  },
]

export function FounderSection() {
  return (
    <section id="story" className={styles.section}>
      <PegboardSVG />
      <div className="pub-wrap">

        {/* Heading */}
        <div className={styles.head}>
          <div className={styles.eyebrow}>
            <span className="amber-rule" />WHO BUILT THIS · HOW IT CAME TO BE
          </div>
          <h2 className={styles.h2}>The product I kept wishing existed.</h2>
          <p className={styles.lede}>
            Pleks didn&apos;t start as a software project. It started as twenty years of working inside regulated
            industries — legal practice, property development, rental management — and watching the same gap go
            unfilled by every tool that was supposed to fill it. The platforms that existed automated the easy
            thirty per cent of the work and abandoned{" "}
            <span className="amber-wash-underline">the regulated seventy per cent</span>{" "}
            where the work actually lives. So I built what was missing.
          </p>
        </div>

        {/* Road timeline */}
        <FounderTimeline moments={MOMENTS} />

        {/* Founder block */}
        <div className={styles.founderBlock}>
          <span className={`stoep ${styles.sigName}`}>Stéan Bouwer</span>
          <span className={styles.sigMeta}>Founder, Pleks</span>
          <span className={styles.sigMeta}>Western Cape · Twenty years building software for regulated work</span>
        </div>

      </div>
    </section>
  )
}
