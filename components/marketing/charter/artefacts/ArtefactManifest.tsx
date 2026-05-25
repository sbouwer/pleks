/**
 * components/marketing/charter/artefacts/ArtefactManifest.tsx
 * §03 Portability — file manifest with SHA-256 hash line
 */
export function ArtefactManifest() {
  return (
    <svg
      viewBox="0 0 200 56"
      width="100%"
      height="56"
      role="img"
      aria-label="Export bundle manifest showing leases.pdf, inspections.zip, and audit.json with a SHA-256 hash for tamper-evidence"
    >
      {/* Row 1 */}
      <text x="16" y="14" fontFamily="var(--pub-mono)" fontSize="8" fill="var(--amber-ink)" fontWeight="700">✓</text>
      <text x="28" y="14" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.75">leases.pdf</text>
      <text x="195" y="14" fontFamily="var(--pub-mono)" fontSize="6.5" fill="currentColor" opacity="0.4" textAnchor="end">142 files</text>
      <line x1="0" y1="18" x2="200" y2="18" stroke="currentColor" strokeWidth="0.4" opacity="0.12"/>

      {/* Row 2 */}
      <text x="16" y="30" fontFamily="var(--pub-mono)" fontSize="8" fill="var(--amber-ink)" fontWeight="700">✓</text>
      <text x="28" y="30" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.75">inspections.zip</text>
      <text x="195" y="30" fontFamily="var(--pub-mono)" fontSize="6.5" fill="currentColor" opacity="0.4" textAnchor="end">1 839 photos</text>
      <line x1="0" y1="34" x2="200" y2="34" stroke="currentColor" strokeWidth="0.4" opacity="0.12"/>

      {/* Row 3 */}
      <text x="16" y="46" fontFamily="var(--pub-mono)" fontSize="8" fill="var(--amber-ink)" fontWeight="700">✓</text>
      <text x="28" y="46" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.75">audit.json</text>
      <text x="195" y="46" fontFamily="var(--pub-mono)" fontSize="6.5" fill="currentColor" opacity="0.4" textAnchor="end">7yr · 40 812 rows</text>
      <line x1="0" y1="50" x2="200" y2="50" stroke="currentColor" strokeWidth="0.5" opacity="0.2"/>

      {/* SHA-256 hash line */}
      <text x="0" y="56" fontFamily="var(--pub-mono)" fontSize="6" fill="var(--amber-ink)" opacity="0.85" letterSpacing="0.04em">SHA-256 · 0x7a2f3c…c4e1</text>
    </svg>
  )
}
