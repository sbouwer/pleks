"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, AlertTriangle, Loader2, RefreshCw, Plug, Unplug } from "lucide-react"
import { toast } from "sonner"

interface BankFeedConnection {
  id: string
  bank_name: string
  account_mask: string | null
  account_type: string | null
  status: string
  last_synced_at: string | null
  last_sync_status: string | null
  last_sync_txn_count: number
  last_sync_matched_count: number
  last_sync_error: string | null
}

declare global {
  interface Window {
    fastlink?: {
      open: (config: object, containerId: string) => void
      close: () => void
    }
  }
}

interface BankFeedSectionProps {
  tier?: string | null
}

export function BankFeedSection({ tier }: Readonly<BankFeedSectionProps>) {
  const { orgId } = useOrg()
  const [connections, setConnections] = useState<BankFeedConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const fastlinkContainerRef = useRef<HTMLDivElement>(null)

  const isEligible = tier === "steward" || tier === "firm" || tier === "portfolio"

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("bank_feed_connections")
      .select("id, bank_name, account_mask, account_type, status, last_synced_at, last_sync_status, last_sync_txn_count, last_sync_matched_count, last_sync_error")
      .eq("org_id", orgId)
      .neq("status", "disconnected")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error("bank_feed_connections:", error.message); return }
        setConnections((data ?? []) as BankFeedConnection[])
        setLoading(false)
      })
  }, [orgId])

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch("/api/yodlee/token", { method: "POST" })
      if (!res.ok) throw new Error("Failed to get Yodlee token")
      const { config } = (await res.json()) as {
        config: {
          fastLinkURL: string
          accessToken: string
          params: { configName: string; flow: string; callback: string }
        }
      }

      // Load FastLink SDK if not loaded
      if (!window.fastlink) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script")
          script.src = "https://cdn.yodlee.com/fastlink/v4/initialize.js"
          script.onload = () => resolve()
          script.onerror = () => reject(new Error("FastLink SDK load failed"))
          document.head.appendChild(script)
        })
      }

      window.fastlink?.open(
        {
          fastLinkURL: config.fastLinkURL,
          accessToken: `Bearer ${config.accessToken}`,
          params: config.params,
          onSuccess: async (data: { providerAccountId: string; providerId: string }) => {
            window.fastlink?.close()
            const cbRes = await fetch("/api/yodlee/callback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            })
            if (cbRes.ok) {
              toast.success("Bank account connected")
              // Refresh connections
              const supabase = createClient()
              const { data: fresh } = await supabase
                .from("bank_feed_connections")
                .select("id, bank_name, account_mask, account_type, status, last_synced_at, last_sync_status, last_sync_txn_count, last_sync_matched_count, last_sync_error")
                .eq("org_id", orgId!)
                .neq("status", "disconnected")
                .order("created_at", { ascending: true })
              setConnections((fresh ?? []) as BankFeedConnection[])
            } else {
              toast.error("Failed to save connection")
            }
            setConnecting(false)
          },
          onError: (err: { message?: string }) => {
            toast.error(err.message ?? "Connection failed")
            setConnecting(false)
          },
          onClose: () => setConnecting(false),
        },
        "fastlink-container",
      )
    } catch (err) {
      toast.error(String(err))
      setConnecting(false)
    }
  }

  async function handleSync(connectionId: string) {
    setSyncingId(connectionId)
    const res = await fetch("/api/bank-feed/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    })
    setSyncingId(null)
    if (res.ok) {
      const { inserted, matched } = (await res.json()) as { inserted: number; matched: number }
      toast.success(`Synced — ${inserted} transactions, ${matched} matched`)
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId
            ? { ...c, last_synced_at: new Date().toISOString(), last_sync_txn_count: inserted, last_sync_matched_count: matched, last_sync_status: "success" }
            : c
        )
      )
    } else {
      const { error } = (await res.json()) as { error: string }
      toast.error(error ?? "Sync failed")
    }
  }

  async function handleDisconnect(connectionId: string) {
    setDisconnectingId(connectionId)
    const res = await fetch(`/api/bank-feed/${connectionId}`, { method: "DELETE" })
    setDisconnectingId(null)
    if (res.ok) {
      toast.success("Bank feed disconnected")
      setConnections((prev) => prev.filter((c) => c.id !== connectionId))
    } else {
      toast.error("Failed to disconnect")
    }
  }

  function formatLastSync(conn: BankFeedConnection): string {
    if (!conn.last_synced_at) return "Never synced"
    const date = new Date(conn.last_synced_at)
    return `Last synced ${date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} ${date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`
  }

  if (!isEligible) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        Live bank feeds are available on Steward tier and above (R250/account/month).
        <Button variant="link" size="sm" className="ml-2 p-0 h-auto" render={<a href="/settings/billing" />}>
          Upgrade
        </Button>
      </div>
    )
  }

  const activeCount = connections.filter((c) => c.status === "active").length

  return (
    <div className="space-y-3">
      {/* FastLink container (hidden — widget renders here) */}
      <div ref={fastlinkContainerRef} id="fastlink-container" className="hidden" />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading connections…
        </div>
      ) : (
        <>
          {connections.length > 0 && (
            <div className="space-y-2">
              {connections.map((conn) => (
                <Card key={conn.id} className="border-border">
                  <CardContent className="flex items-center justify-between pt-3 pb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {conn.status === "active" && conn.last_sync_status !== "error" ? (
                        <Check className="size-4 text-success shrink-0" />
                      ) : (
                        <AlertTriangle className="size-4 text-warning shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {conn.bank_name}
                          {conn.account_mask && (
                            <span className="text-muted-foreground font-mono ml-1">{conn.account_mask}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conn.last_sync_status === "error"
                            ? `Error: ${conn.last_sync_error ?? "Re-authentication required"}`
                            : `${formatLastSync(conn)} · ${conn.last_sync_txn_count} txns · ${conn.last_sync_matched_count} matched`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Badge variant="secondary" className="text-[10px]">
                        R250/mo
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={syncingId === conn.id}
                        onClick={() => handleSync(conn.id)}
                      >
                        {syncingId === conn.id
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <RefreshCw className="size-3.5" />}
                        <span className="ml-1 hidden sm:inline">Sync</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={disconnectingId === conn.id}
                        onClick={() => handleDisconnect(conn.id)}
                      >
                        {disconnectingId === conn.id
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <Unplug className="size-3.5" />}
                        <span className="ml-1 hidden sm:inline">Disconnect</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activeCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Monthly bank feed charges: R{activeCount * 250} ({activeCount} account{activeCount !== 1 ? "s" : ""} × R250)
            </p>
          )}

          <Button variant="outline" size="sm" onClick={handleConnect} disabled={connecting}>
            {connecting
              ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Connecting…</>
              : <><Plug className="size-3.5 mr-1.5" /> Connect bank account</>}
          </Button>
        </>
      )}
    </div>
  )
}
