/**
 * components/marketing/charter/CharterRegisterCard.tsx — 9th charter card
 *
 * Notes:  Links to /popia-register — the canonical POPIA processing-purpose register.
 *         Spec: BUILD_66_CHARTER_HOMEPAGE.md §7.3, §10
 */
import Link from "next/link"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import styles from "./charter.module.css"
import { SealMark } from "./SealMark"
import { ArtefactRegister } from "./artefacts/ArtefactRegister"

export function CharterRegisterCard() {
  return (
    <Link
      href="/popia-register"
      className={styles.charterRegisterCard}
      aria-label="Read the full POPIA Processing Purpose Register"
    >
      <SealMark section={LEGAL_VERSIONS.popiaRegister} register />

      <div className={styles.cardHead}>
        <span className={styles.cardNum}>§ FULL REGISTER</span>
      </div>

      <div className={styles.cardArtefact}>
        <ArtefactRegister />
      </div>

      <h3 className={styles.cardTitle}>Every line of it. On the public record.</h3>
      <p className={styles.cardBody}>
        39 processing activities. Who, why, how long, on what legal basis. Most
        companies keep this internal. We publish it.
      </p>

      <div className={styles.cardFoot}>
        <span className={styles.registerStamp}>
          <strong>{LEGAL_VERSIONS.popiaRegister}</strong> · 2026-05-01
        </span>
        <span className={styles.registerCta}>Read the register →</span>
      </div>
    </Link>
  )
}
