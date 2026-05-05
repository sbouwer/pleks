"use client"

/**
 * components/legal/PrintButton.tsx — PDF download link for the PAIA manual
 *
 * Auth:  public
 * Notes: Downloads from /api/paia-manual-pdf (react-pdf generated). Using a
 *        native <a download> so the browser handles the PDF as a file download
 *        rather than attempting to navigate or display inline.
 */

interface Props { label?: string }

export function PrintButton({ label = "Download PDF" }: Props) {
  return (
    <a href="/api/paia-manual-pdf" download="Pleks-PAIA-Manual-v1.0.pdf" className="pa-secondary" style={{ textDecoration: "none", display: "inline-flex" }}>
      <span>{label}</span>
    </a>
  )
}
