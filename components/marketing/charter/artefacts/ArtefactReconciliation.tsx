/**
 * components/marketing/charter/artefacts/ArtefactReconciliation.tsx
 * §01 Trust Money — reconciliation ledger showing R 0.00 ALWAYS for Pleks
 */
export function ArtefactReconciliation() {
  return (
    <svg
      viewBox="0 0 360 80"
      width="100%"
      height="80"
      role="img"
      aria-label="Reconciliation table showing Pleks holds zero client funds while R 1.2 million flows from tenant trust account to landlord payout"
    >
      {/* Column headers */}
      <text x="8" y="12" fontFamily="var(--pub-mono)" fontSize="6" fontWeight="600" letterSpacing="0.1em" fill="currentColor" opacity="0.45">ACCOUNT</text>
      <text x="260" y="12" fontFamily="var(--pub-mono)" fontSize="6" fontWeight="600" letterSpacing="0.1em" fill="currentColor" opacity="0.45" textAnchor="end">AMOUNT</text>
      <text x="352" y="12" fontFamily="var(--pub-mono)" fontSize="6" fontWeight="600" letterSpacing="0.1em" fill="currentColor" opacity="0.45" textAnchor="end">DIR</text>

      {/* Header rule */}
      <line x1="0" y1="16" x2="360" y2="16" stroke="currentColor" strokeWidth="0.5" opacity="0.2"/>

      {/* Row 1 — Tenant Trust */}
      <rect x="0" y="17" width="360" height="18" fill="currentColor" fillOpacity="0.025"/>
      <text x="8" y="30" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.7">TENANT TRUST ACC</text>
      <text x="260" y="30" fontFamily="var(--pub-mono)" fontSize="7.5" fill="currentColor" opacity="0.8" textAnchor="end">R 1 247 350</text>
      <text x="352" y="30" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.5" textAnchor="end">IN</text>
      <line x1="0" y1="35" x2="360" y2="35" stroke="currentColor" strokeWidth="0.5" opacity="0.12"/>

      {/* Row 2 — Landlord Payout */}
      <text x="8" y="48" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.7">LANDLORD PAYOUT</text>
      <text x="260" y="48" fontFamily="var(--pub-mono)" fontSize="7.5" fill="currentColor" opacity="0.8" textAnchor="end">R 1 184 982</text>
      <text x="352" y="48" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.5" textAnchor="end">OUT</text>
      <line x1="0" y1="53" x2="360" y2="53" stroke="currentColor" strokeWidth="0.5" opacity="0.12"/>

      {/* Row 3 — Pleks (amber punchline) */}
      <rect x="0" y="54" width="360" height="22" fill="var(--amber-ink)" fillOpacity="0.06"/>
      <text x="8" y="69" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.7">PLEKS &amp; CO ACC</text>
      <text x="260" y="69" fontFamily="var(--pub-mono)" fontSize="9" fontWeight="600" fill="var(--amber-ink)" textAnchor="end">R 0.00</text>
      <text x="352" y="69" fontFamily="var(--pub-mono)" fontSize="7.5" fontWeight="600" fill="var(--amber-ink)" textAnchor="end">ALWAYS</text>
    </svg>
  )
}
