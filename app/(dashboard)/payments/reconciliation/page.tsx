"use client"

import React, { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Upload, Check, AlertTriangle, RefreshCw } from "lucide-react"
import { createBankImport } from "@/lib/actions/recon"
import { toast } from "sonner"
import Link from "next/link"

interface ImportRecord {
  id: string
  original_filename: string
  detected_bank: string | null
  import_source: string | null
  extraction_status: string
  transaction_count: number
  matched_count: number
  unmatched_count: number
  reconciled: boolean
  statement_period_from: string | null
  statement_period_to: string | null
  created_at: string
}

interface BankFeedConnection {
  id: string
  bank_name: string
  account_mask: string | null
  status: string
  last_sync_txn_count: number
  last_sync_matched_count: number
  last_synced_at: string | null
}

const SOURCE_LABELS: Record<string, string> = {
  upload: "PDF",
  ofx: "OFX",
  csv: "CSV",
  qif: "QIF",
  yodlee: "Live feed",
}

export default function ReconciliationPage() {
  const { orgId, org } = useOrg()
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [feedConnections, setFeedConnections] = useState<BankFeedConnection[]>([])
  const [uploading, setUploading] = useState(false)
  const tier = (org as Record<string, unknown> | null)?.tier as string | undefined

  async function loadImports() {
    if (!orgId) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from("bank_statement_imports")
      .select("id, original_filename, detected_bank, import_source, extraction_status, transaction_count, matched_count, unmatched_count, reconciled, statement_period_from, statement_period_to, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
    if (error) { console.error("imports:", error.message); return }
    setImports(data ?? [])
  }

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()

    void (async () => {
      await loadImports()
      const { data } = await supabase
        .from("bank_feed_connections")
        .select("id, bank_name, account_mask, status, last_sync_txn_count, last_sync_matched_count, last_synced_at")
        .eq("org_id", orgId)
        .eq("status", "active")
      setFeedConnections(data ?? [])
    })()
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setUploading(true)
    const formData = new FormData(e.currentTarget)

    const supabase = createClient()
    const { data: accounts } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("org_id", orgId!)
      .limit(1)

    if (!accounts?.length) {
      toast.error("Add a bank account in Settings → Compliance first")
      setUploading(false)
      return
    }

    formData.set("bank_account_id", accounts[0].id)
    const result = await createBankImport(formData)

    if (result?.error) {
      toast.error(result.error)
    } else if (result?.source === "upload") {
      toast.success("PDF uploaded — extraction pending")
    } else {
      const { total = 0, matched = 0 } = result ?? {}
      toast.success(`Imported ${total} transactions — ${matched} auto-matched`)
    }

    await loadImports()
    setUploading(false)
    ;(e.target as HTMLFormElement).reset()
  }

  async function handleFeedSync(connectionId: string) {
    const res = await fetch("/api/bank-feed/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    })
    if (res.ok) {
      const { inserted, matched } = (await res.json()) as { inserted: number; matched: number }
      toast.success(`Synced — ${inserted} transactions, ${matched} matched`)
      await loadImports()
    } else {
      const { error } = (await res.json()) as { error: string }
      toast.error(error ?? "Sync failed")
    }
  }

  return (
    <div>
      {/* Live bank feeds (Steward+) */}
      {feedConnections.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">Live bank feeds</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {feedConnections.map((conn) => (
              <div key={conn.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{conn.bank_name}</span>
                  {conn.account_mask && <span className="text-muted-foreground ml-1">{conn.account_mask}</span>}
                  {conn.last_synced_at && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      · Last sync: {new Date(conn.last_synced_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}{conn.last_sync_txn_count} txns · {conn.last_sync_matched_count} matched
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleFeedSync(conn.id)}>
                    <RefreshCw className="size-3.5 mr-1" /> Sync now
                  </Button>
                  <Button size="sm" variant="outline" render={<Link href="/settings/finance" />}>
                    Manage
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upload */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg">Upload Statement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="flex gap-3 items-end">
            <div className="flex-1">
              <Input name="file" type="file" accept=".pdf,.ofx,.qfx,.qif,.csv" required />
              <p className="text-xs text-muted-foreground mt-1">
                PDF, OFX, QIF, or CSV. Supports FNB, ABSA, Standard Bank, Nedbank, Capitec, Investec.
                OFX/CSV imports auto-match immediately.
              </p>
            </div>
            <Button type="submit" disabled={uploading}>
              <Upload className="h-4 w-4 mr-1" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </form>
          {(tier === "steward" || tier === "firm" || tier === "portfolio") && feedConnections.length === 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Want automatic daily sync?{" "}
              <Link href="/settings/finance" className="text-brand hover:underline">
                Connect a live bank feed →
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Import history */}
      {imports.length === 0 ? (
        <EmptyState
          icon={<Upload className="h-8 w-8 text-muted-foreground" />}
          title="No statements uploaded"
          description="Upload a bank statement PDF, OFX, or CSV to start reconciling."
        />
      ) : (
        <div className="space-y-2">
          {imports.map((imp) => {
            const extractionStatus = imp.extraction_status === "complete" ? "completed" : "pending"
            let statusNode: React.ReactNode
            if (imp.reconciled) {
              statusNode = <div className="flex items-center gap-1 text-success text-sm"><Check className="h-4 w-4" /> Reconciled</div>
            } else if (imp.unmatched_count > 0) {
              statusNode = <div className="flex items-center gap-1 text-warning text-sm"><AlertTriangle className="h-4 w-4" /> {imp.unmatched_count} unmatched</div>
            } else {
              statusNode = <StatusBadge status={extractionStatus} />
            }
            const sourceLabel = SOURCE_LABELS[imp.import_source ?? "upload"] ?? "PDF"
            return (
              <Link key={imp.id} href={`/payments/reconciliation/${imp.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <p className="font-medium">{imp.original_filename}</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="uppercase text-xs font-medium mr-1">{sourceLabel}</span>
                        {imp.detected_bank ? `· ${imp.detected_bank.toUpperCase()} ` : ""}
                        {imp.statement_period_from && `· ${imp.statement_period_from} → ${imp.statement_period_to} `}
                        {`· ${imp.transaction_count} transactions`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {statusNode}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {/* Tier upsell for bank feeds */}
      {(tier === "free" || tier === "starter") && (
        <Card className="mt-6 border-dashed">
          <CardContent className="pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Upgrade to Steward for automatic daily bank feed sync (R250/account/month).
            </p>
            <Button size="sm" className="mt-3" variant="outline" render={<Link href="/settings/billing" />}>
              View plans
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
