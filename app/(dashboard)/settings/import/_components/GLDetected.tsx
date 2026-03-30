"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import type { GLPropertyBlock } from "@/lib/import/parseGLReport"

interface GLDetectedProps {
  blocks: GLPropertyBlock[]
  filename: string
  onBack: () => void
  onContinue: () => void
}

export function GLDetected({ blocks, filename, onBack, onContinue }: Readonly<GLDetectedProps>) {
  const totalTxns = blocks.reduce((sum, b) => sum + b.arTransactions.length, 0)
  const totalDeposits = blocks.reduce((sum, b) => sum + (b.depositTransactions?.length ?? 0), 0)
  const outstanding = blocks.filter((b) => b.closingBalance > 0)

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="font-heading text-2xl mb-2">TPN General Ledger detected</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {filename} — {blocks.length} propert{blocks.length === 1 ? "y" : "ies"}, {totalTxns} transactions
      </p>

      {/* Property summary table */}
      <Card className="mb-6">
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2">Property</th>
                <th className="text-left py-2">Owner</th>
                <th className="text-right py-2">Txns</th>
                <th className="text-right py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={`${b.propertyName}-${b.ownerName}`} className="border-b border-border/50">
                  <td className="py-2">{b.propertyName}</td>
                  <td className="py-2 text-muted-foreground">{b.ownerName}</td>
                  <td className="py-2 text-right">{b.arTransactions.length}</td>
                  <td className={`py-2 text-right ${b.closingBalance > 0 ? "text-danger font-medium" : "text-muted-foreground"}`}>
                    {formatZAR(b.closingBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Outstanding balances warning */}
      {outstanding.length > 0 && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm">
              {outstanding.length} propert{outstanding.length === 1 ? "y has" : "ies have"} outstanding balances.
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You&apos;ll be prompted about arrears cases during import.
            </p>
          </div>
        </div>
      )}

      {totalDeposits > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          <Badge variant="secondary" className="text-[10px] mr-1">Bonus</Badge>
          {totalDeposits} deposit transaction{totalDeposits === 1 ? "" : "s"} found — these can also be imported.
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" /> Upload different file
        </Button>
        <Button onClick={onContinue} className="flex-1">
          Match to leases <ArrowRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
