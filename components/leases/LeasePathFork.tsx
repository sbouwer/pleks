"use client"

import { useState } from "react"
import { FileText, Paperclip } from "lucide-react"
import { LeaseWizard } from "./LeaseWizard"
import { LeaseWizardUpload } from "./LeaseWizardUpload"
import type { CoTenant } from "./LeaseWizard"

type Path = "pleks" | "uploaded" | null

interface Props {
  initialPropertyId?: string | null
  initialPropertyName?: string | null
  initialUnitId?: string | null
  initialUnitLabel?: string | null
  initialTenantId?: string | null
  initialTenantName?: string | null
  initialCoTenants?: CoTenant[]
  renewalOf?: string | null
}

export function LeasePathFork({
  initialPropertyId,
  initialPropertyName,
  initialUnitId,
  initialUnitLabel,
  initialTenantId,
  initialTenantName,
  initialCoTenants,
  renewalOf,
}: Readonly<Props>) {
  const [path, setPath] = useState<Path>(null)

  if (path === "pleks") {
    return (
      <LeaseWizard
        initialPropertyId={initialPropertyId}
        initialPropertyName={initialPropertyName}
        initialUnitId={initialUnitId}
        initialUnitLabel={initialUnitLabel}
        initialTenantId={initialTenantId}
        initialTenantName={initialTenantName}
        initialCoTenants={initialCoTenants}
        renewalOf={renewalOf}
      />
    )
  }

  if (path === "uploaded") {
    return (
      <LeaseWizardUpload
        initialPropertyId={initialPropertyId}
        initialPropertyName={initialPropertyName}
        initialUnitId={initialUnitId}
        initialUnitLabel={initialUnitLabel}
        initialTenantId={initialTenantId}
        initialTenantName={initialTenantName}
        initialCoTenants={initialCoTenants}
      />
    )
  }

  const contextLabel =
    initialUnitLabel && initialPropertyName
      ? `${initialUnitLabel} — ${initialPropertyName}`
      : initialPropertyName ?? null

  return (
    <div>
      {contextLabel && (
        <p className="text-muted-foreground mb-6">{contextLabel}</p>
      )}

      <p className="text-sm font-medium mb-4">How would you like to create this lease?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Path A — Pleks template */}
        <button
          type="button"
          onClick={() => setPath("pleks")}
          className="text-left rounded-xl border border-border/60 bg-card p-5 hover:border-brand/40 hover:bg-brand/5 transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <FileText className="size-5 text-brand" />
            <span className="font-medium">Use Pleks template</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Build a lease using our SA-compliant template with clauses, annexures, and digital signing.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• 25 standard clauses</li>
            <li>• 14 optional clauses</li>
            <li>• 4 annexures</li>
            <li>• Conflict checker</li>
            <li>• Digital signing (DocuSeal / wet ink)</li>
          </ul>
        </button>

        {/* Path B — Upload own */}
        <button
          type="button"
          onClick={() => setPath("uploaded")}
          className="text-left rounded-xl border border-border/60 bg-card p-5 hover:border-brand/40 hover:bg-brand/5 transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="size-5 text-brand" />
            <span className="font-medium">Upload your own</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a signed lease or your agency&apos;s template. Pleks tracks the key terms for invoicing and arrears.
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">You handle:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Your own clause set</li>
                <li>• Signing (wet or digital)</li>
                <li>• Annexures</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Pleks tracks:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Rent & deposit amounts</li>
                <li>• Lease period & dates</li>
                <li>• Payment due day</li>
                <li>• Escalation</li>
                <li>• Tenant & co-tenants</li>
              </ul>
            </div>
          </div>
        </button>
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center">
        Both paths produce a lease record that drives invoicing, arrears tracking, deposit management, and renewal notices.
      </p>
    </div>
  )
}
