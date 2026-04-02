"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface PreviewClause {
  number: number
  key: string
  title: string
  body: string
  is_required: boolean
}

interface LeasePreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leaseType: string
}

export function LeasePreview({ open, onOpenChange, leaseType }: Readonly<LeasePreviewProps>) {
  const [clauses, setClauses] = useState<PreviewClause[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(false)
    fetch(`/api/leases/preview-template?leaseType=${leaseType}`)
      .then((r) => r.json())
      .then((data) => {
        setClauses(data.clauses ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [open, leaseType])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <DialogTitle>Lease preview</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Based on your current clause selections. Coloured tokens are filled from lease data at generation time.
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading preview...</p>
          )}
          {error && (
            <p className="text-sm text-muted-foreground">Failed to load preview. Please try again.</p>
          )}

          {!loading && !error && (
            <div className="space-y-1">
              {/* Token legend */}
              <div className="flex flex-wrap gap-3 text-xs mb-5 pb-4 border-b border-border/30">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-brand/40 bg-brand/10 text-brand text-[10px]">clause N</span>
                  Clause reference
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-blue-400/40 bg-blue-400/10 text-blue-400 text-[10px]">[N]</span>
                  Sub-clause
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-green-400/40 bg-green-400/10 text-green-400 text-[10px]">[field]</span>
                  Filled from lease data
                </span>
              </div>

              {/* Clauses */}
              <div className="space-y-6">
                {clauses.map((clause) => (
                  <div key={clause.key}>
                    <p className="text-sm font-semibold mb-1">
                      {clause.number}. {clause.title}
                    </p>
                    <div
                      className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap
                        [&_.token-ref]:inline-block [&_.token-ref]:px-1.5 [&_.token-ref]:py-0.5
                        [&_.token-ref]:rounded [&_.token-ref]:border [&_.token-ref]:border-brand/40
                        [&_.token-ref]:bg-brand/10 [&_.token-ref]:text-brand [&_.token-ref]:text-xs [&_.token-ref]:mx-0.5
                        [&_.token-self]:inline-block [&_.token-self]:px-1.5 [&_.token-self]:py-0.5
                        [&_.token-self]:rounded [&_.token-self]:border [&_.token-self]:border-blue-400/40
                        [&_.token-self]:bg-blue-400/10 [&_.token-self]:text-blue-400 [&_.token-self]:text-xs [&_.token-self]:mx-0.5
                        [&_.token-var]:inline-block [&_.token-var]:px-1.5 [&_.token-var]:py-0.5
                        [&_.token-var]:rounded [&_.token-var]:border [&_.token-var]:border-green-400/40
                        [&_.token-var]:bg-green-400/10 [&_.token-var]:text-green-400 [&_.token-var]:text-xs [&_.token-var]:mx-0.5"
                      dangerouslySetInnerHTML={{ __html: clause.body }}
                    />
                  </div>
                ))}
              </div>

              {/* Annexure stubs */}
              {clauses.length > 0 && (
                <div className="mt-8 pt-6 border-t border-border/30 space-y-4">
                  {(["A: Rental calculation", "B: Banking details", "C: Property rules", "D: Special agreements"] as const).map((annexure) => (
                    <div key={annexure}>
                      <p className="text-sm font-semibold text-muted-foreground">ANNEXURE {annexure.toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 italic">
                        {annexure.startsWith("A") && "Generated from lease terms at document creation."}
                        {annexure.startsWith("B") && "Populated from trust account banking details."}
                        {annexure.startsWith("C") && "Populated from property rules."}
                        {annexure.startsWith("D") && "Completed during lease creation."}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
