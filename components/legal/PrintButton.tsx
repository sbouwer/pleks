"use client"

/**
 * components/legal/PrintButton.tsx — browser print-to-PDF trigger
 *
 * Auth:  public
 * Notes: Used on /paia-manual so visitors can self-serve a PDF without
 *        requiring the Information Officer to send one manually.
 */

interface Props { label?: string }

export function PrintButton({ label = "Download PDF" }: Props) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="act-pill"
      style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "inherit" }}
    >
      {label}
    </button>
  )
}
