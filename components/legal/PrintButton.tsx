"use client"

/**
 * components/legal/PrintButton.tsx — browser print-to-PDF trigger
 *
 * Auth:  public
 * Notes: Used on /paia-manual so visitors can self-serve a PDF without
 *        requiring the Information Officer to send one manually.
 */
import { ActionButton } from "@/components/ui/actions/Button"

interface Props { label?: string }

export function PrintButton({ label = "Download PDF" }: Props) {
  return (
    <ActionButton tone="secondary" onClick={() => globalThis.print()}>
      {label}
    </ActionButton>
  )
}
