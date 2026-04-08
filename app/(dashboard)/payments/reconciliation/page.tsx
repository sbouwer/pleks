"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Upload, Check, AlertTriangle } from "lucide-react"
import { createBankImport } from "@/lib/actions/recon"
import { toast } from "sonner"
import Link from "next/link"

interface ImportRecord {
  id: string
  original_filename: string
  detected_bank: string | null
  extraction_status: string
  transaction_count: number
  matched_count: number
  unmatched_count: number
  reconciled: boolean
  statement_period_from: string | null
  statement_period_to: string | null
  created_at: string
}

export default function ReconciliationPage() {
  const { orgId } = useOrg()
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("bank_statement_imports")
      .select("id, original_filename, detected_bank, extraction_status, transaction_count, matched_count, unmatched_count, reconciled, statement_period_from, statement_period_to, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setImports((data as ImportRecord[]) || []))
  }, [orgId])

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setUploading(true)
    const formData = new FormData(e.currentTarget)

    // Use first bank account as default for now
    const supabase = createClient()
    const { data: accounts } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("org_id", orgId!)
      .limit(1)

    if (!accounts?.length) {
      toast.error("Add a bank account in Settings first")
      setUploading(false)
      return
    }

    formData.set("bank_account_id", accounts[0].id)
    const result = await createBankImport(formData)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Statement uploaded — extraction pending")
      // Refresh
      const { data } = await supabase
        .from("bank_statement_imports")
        .select("id, original_filename, detected_bank, extraction_status, transaction_count, matched_count, unmatched_count, reconciled, statement_period_from, statement_period_to, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
      setImports((data as ImportRecord[]) || [])
    }
    setUploading(false)
  }

  return (
    <div>
      {/* Upload */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg">Upload Bank Statement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="flex gap-3 items-end">
            <div className="flex-1">
              <Input name="file" type="file" accept="application/pdf" required />
              <p className="text-xs text-muted-foreground mt-1">
                PDF only. Supports FNB, ABSA, Standard Bank, Nedbank, Capitec.
              </p>
            </div>
            <Button type="submit" disabled={uploading}>
              <Upload className="h-4 w-4 mr-1" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Import history */}
      {imports.length === 0 ? (
        <EmptyState icon={<Upload className="h-8 w-8 text-muted-foreground" />} title="No statements uploaded" description="Upload a bank statement PDF to start reconciling." />
      ) : (
        <div className="space-y-2">
          {imports.map((imp) => (
            <Link key={imp.id} href={`/payments/reconciliation/${imp.id}`}>
              <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between pt-4">
                  <div>
                    <p className="font-medium">{imp.original_filename}</p>
                    <p className="text-sm text-muted-foreground">
                      {imp.detected_bank?.toUpperCase() || "Detecting..."}{" "}
                      {imp.statement_period_from && `· ${imp.statement_period_from} → ${imp.statement_period_to}`}
                      {` · ${imp.transaction_count} transactions`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {imp.reconciled ? (
                      <div className="flex items-center gap-1 text-success text-sm">
                        <Check className="h-4 w-4" /> Reconciled
                      </div>
                    ) : imp.unmatched_count > 0 ? (
                      <div className="flex items-center gap-1 text-warning text-sm">
                        <AlertTriangle className="h-4 w-4" /> {imp.unmatched_count} unmatched
                      </div>
                    ) : (
                      <StatusBadge status={imp.extraction_status === "complete" ? "completed" : "pending"} />
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
