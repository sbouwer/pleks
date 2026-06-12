/**
 * app/(dashboard)/settings/templates/LeasesPanel.tsx — Lease-templates passthrough (Phase 1)
 *
 * Notes:  Lease templates keep their own dedicated editor — it's guarded by legal disclosures and
 *         conditional clause logic, so it is NOT folded into the document-template manager. This tab
 *         surfaces them and links through to that editor; the lease side gets its own redesign later.
 */
import Link from "next/link"
import { ScrollText, ArrowRight } from "lucide-react"
import { DetailCard } from "@/components/detail/DetailCard"

export function LeasesPanel() {
  return (
    <div className="mx-auto w-full max-w-2xl pt-2">
      <DetailCard title="Lease templates">
        <div className="flex flex-col items-start gap-4 py-2">
          <span className="grid size-11 place-items-center rounded-[var(--r-button)] border border-border bg-muted/40 text-primary">
            <ScrollText className="size-5" />
          </span>
          <div className="space-y-1.5">
            <p className="text-sm text-foreground">
              Lease agreements are managed in their own editor — clauses, annexures, versioning and
              branding, behind the required legal disclosures.
            </p>
            <p className="text-sm text-muted-foreground">
              That guarded flow stays separate from document templates for now; it gets its own redesign
              in a later phase.
            </p>
          </div>
          <Link
            href="/settings/lease-templates"
            className="inline-flex h-9 items-center gap-2 rounded-[var(--r-button)] bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-primary"
          >
            Open lease editor <ArrowRight className="size-4" />
          </Link>
        </div>
      </DetailCard>
    </div>
  )
}
