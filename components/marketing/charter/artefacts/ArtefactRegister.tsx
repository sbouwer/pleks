/**
 * components/marketing/charter/artefacts/ArtefactRegister.tsx
 * §9 Register card — numbered ledger rows previewing the processing-purpose register
 */
import { MARKETING_FACTS } from "@/lib/marketing/facts"

export function ArtefactRegister() {
  return (
    <svg
      viewBox="0 0 200 56"
      width="100%"
      height="56"
      role="img"
      aria-label={`Preview of the processing-purpose register showing rows A1 lease execution, A2 trust reconciliation, B5 FitScore generation, and ${MARKETING_FACTS.popiaPurposes.total - 3} more activities`}
    >
      {/* Header rule */}
      <line x1="0" y1="4" x2="200" y2="4" stroke="currentColor" strokeWidth="0.5" opacity="0.2"/>

      {/* Row A1 */}
      <text x="0" y="15" fontFamily="var(--pub-mono)" fontSize="6.5" fill="var(--amber-ink)" fontWeight="600">A1</text>
      <text x="16" y="15" fontFamily="var(--pub-mono)" fontSize="6.5" fill="currentColor" opacity="0.7">Lease execution</text>
      <text x="200" y="15" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.4" textAnchor="end">5y</text>
      <line x1="0" y1="19" x2="200" y2="19" stroke="currentColor" strokeWidth="0.4" opacity="0.1"/>

      {/* Row A2 */}
      <text x="0" y="30" fontFamily="var(--pub-mono)" fontSize="6.5" fill="var(--amber-ink)" fontWeight="600">A2</text>
      <text x="16" y="30" fontFamily="var(--pub-mono)" fontSize="6.5" fill="currentColor" opacity="0.7">Trust reconciliation</text>
      <text x="200" y="30" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.4" textAnchor="end">7y</text>
      <line x1="0" y1="34" x2="200" y2="34" stroke="currentColor" strokeWidth="0.4" opacity="0.1"/>

      {/* Row B5 */}
      <text x="0" y="45" fontFamily="var(--pub-mono)" fontSize="6.5" fill="var(--amber-ink)" fontWeight="600">B5</text>
      <text x="16" y="45" fontFamily="var(--pub-mono)" fontSize="6.5" fill="currentColor" opacity="0.7">FitScore generation</text>
      <text x="200" y="45" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.4" textAnchor="end">12m</text>

      {/* "... 34 more →" row — dashed border */}
      <rect x="0" y="49" width="200" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.2"/>
      <text x="100" y="55.5" fontFamily="var(--pub-mono)" fontSize="5.5" fill="currentColor" opacity="0.35" textAnchor="middle" letterSpacing="0.06em">… {MARKETING_FACTS.popiaPurposes.total - 3} more →</text>
    </svg>
  )
}
