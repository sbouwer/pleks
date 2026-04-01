"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import type { GLPropertyBlock } from "@/lib/import/parseGLReport"

interface LeaseOption {
  id: string
  label: string
  propertyName: string
  unitNumber: string
  tenantName: string
}

interface GLLeaseMatchProps {
  blocks: GLPropertyBlock[]
  onBack: () => void
  onConfirm: (leaseMatches: Record<string, string>, propertyMatches: Record<string, string>) => void
}

export function GLLeaseMatch({ blocks, onBack, onConfirm }: Readonly<GLLeaseMatchProps>) {
  const [leases, setLeases] = useState<LeaseOption[]>([])
  const [loading, setLoading] = useState(true)
  const [leaseMatches, setLeaseMatches] = useState<Record<string, string>>({})
  const [propertyMatches, setPropertyMatches] = useState<Record<string, string>>({})

  // Collect all unique unit refs
  const unitRefs = [...new Set(blocks.flatMap((b) => b.unitRefs.filter(Boolean)))]

  useEffect(() => {
    async function loadLeases() {
      const res = await fetch("/api/leases/list-for-match")
      if (res.ok) {
        const data = await res.json()
        setLeases(data.leases ?? [])

        // Auto-match: fuzzy match property names
        const autoPropertyMatches: Record<string, string> = {}
        for (const block of blocks) {
          const key = `${block.propertyName}(${block.ownerName})`
          const match = (data.leases as LeaseOption[]).find((l) =>
            l.propertyName.toLowerCase().includes(block.propertyName.toLowerCase()) ||
            block.propertyName.toLowerCase().includes(l.propertyName.toLowerCase())
          )
          if (match) autoPropertyMatches[key] = match.id
        }
        setPropertyMatches(autoPropertyMatches)
      }
      setLoading(false)
    }
    loadLeases()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="font-heading text-2xl mb-2">Match to leases</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Link each property or unit reference to an existing lease in Pleks.
      </p>

      {/* Unit ref matching */}
      {unitRefs.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-3">Unit references from payment descriptions:</p>
            <div className="space-y-3">
              {unitRefs.map((ref) => {
                const block = blocks.find((b) => b.unitRefs.includes(ref))
                return (
                  <div key={ref} className="flex items-center gap-3">
                    <div className="w-16 shrink-0">
                      <span className="font-mono text-sm bg-surface-elevated px-2 py-1 rounded">{ref}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{block?.propertyName ?? ""}</span>
                    <Select
                      value={leaseMatches[ref] ?? ""}
                      onValueChange={(v) => setLeaseMatches({ ...leaseMatches, [ref]: v ?? "" })}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Select lease..." />
                      </SelectTrigger>
                      <SelectContent>
                        {leases.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.propertyName} — {l.unitNumber} ({l.tenantName})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Property matching (for properties with no unit refs) */}
      {blocks.filter((b) => b.unitRefs.length === 0).length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-3">Properties without unit references:</p>
            <div className="space-y-3">
              {blocks.filter((b) => b.unitRefs.length === 0).map((block) => {
                const key = `${block.propertyName}(${block.ownerName})`
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm shrink-0">{block.propertyName}</span>
                    <Select
                      value={propertyMatches[key] ?? ""}
                      onValueChange={(v) => setPropertyMatches({ ...propertyMatches, [key]: v ?? "" })}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Select lease..." />
                      </SelectTrigger>
                      <SelectContent>
                        {leases.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.propertyName} — {l.unitNumber} ({l.tenantName})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {leases.length === 0 && (
        <p className="text-sm text-amber-500 mb-4">
          No leases found in your account. Import tenants and create leases first, then import GL history.
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <Button onClick={() => onConfirm(leaseMatches, propertyMatches)} className="flex-1" disabled={leases.length === 0}>
          Review transactions <ArrowRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
