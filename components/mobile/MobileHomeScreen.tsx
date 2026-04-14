"use client"

import Link from "next/link"
import { useEffect, useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  UserSquare2,
  Users,
  Building2,
  ClipboardCheck,
  Wrench,
  CalendarDays,
  CreditCard,
  AlertTriangle,
  Shield,
  Upload,
  Loader2,
} from "lucide-react"
import { useUser } from "@/hooks/useUser"
import { useOrg } from "@/hooks/useOrg"
import { useMobileHomeBadges } from "@/hooks/useMobileHomeBadges"
import { formatZARAbbrev } from "@/lib/constants"
import { createClient } from "@/lib/supabase/client"
import { countAllPendingPhotos } from "@/lib/offline/inspectionStore"
import { isOnline } from "@/lib/offline/syncManager"
import { toast } from "sonner"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function fmtCents(cents: number): string {
  return cents === 0 ? "—" : formatZARAbbrev(cents)
}

function formatAction(action: string): string {
  switch (action) {
    case "payment_recorded": return "Payment recorded"
    case "maintenance_completed": return "Maintenance completed"
    case "lease_created": return "Lease created"
    default: return action
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ── Mode C — Sync section ─────────────────────────────────────────────────────

/**
 * Shows when there are photos pending upload.
 * - Online: [Sync now] button triggers immediate upload
 * - Offline: informs the inspector to connect to sync
 */
function SyncSection() {
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const online = isOnline()

  useEffect(() => {
    countAllPendingPhotos().then(setPending).catch(() => {})
  }, [])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      // flushPhotoQueue needs an inspectionId; pass empty string to flush all via SW
      // For each pending photo the SW handles the upload — trigger via service worker
      const reg = await navigator.serviceWorker?.ready
      if (reg && "sync" in reg) {
        await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
          .sync.register("photo-upload")
        toast.success("Sync started — photos uploading in background")
      } else {
        // Fallback: attempt direct flush of all inspections
        // We don't know which inspectionId has pending photos, so trigger SW message
        navigator.serviceWorker?.controller?.postMessage({ type: "FLUSH_PHOTOS" })
        toast.success("Sync triggered")
      }
      setPending(0)
    } catch {
      toast.error("Sync failed — try again")
    } finally {
      setSyncing(false)
    }
  }, [])

  if (pending === 0) return null

  return (
    <div className="mx-4 mt-4 rounded-xl border overflow-hidden bg-card border-emerald-800/40">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Upload className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">
              {pending} photo{pending === 1 ? "" : "s"} pending upload
            </p>
            <p className="text-xs text-muted-foreground">
              {online ? "Ready to sync" : "Connect to WiFi to sync"}
            </p>
          </div>
        </div>
        {online && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-60 transition-colors"
          >
            {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Tile grid ─────────────────────────────────────────────────────────────────

interface Tile {
  href: string
  icon: React.ElementType
  label: string
  badge: string
}

function TileRow({ rowLabel, tiles }: Readonly<{ rowLabel: string; tiles: Tile[] }>) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
        {rowLabel}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="rounded-xl bg-card border border-border p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
          >
            <tile.icon className="h-6 w-6 text-muted-foreground" />
            <span className="text-[12px] text-muted-foreground">{tile.label}</span>
            <span className="text-base font-bold text-brand leading-none">{tile.badge}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Attention section ─────────────────────────────────────────────────────────

interface AttentionItem {
  id: string
  type: "arrears" | "maintenance"
  label: string
  href: string
}

function AttentionSection() {
  const supabase = createClient()

  const { data: items = [] } = useQuery<AttentionItem[]>({
    queryKey: ["mobile-attention"],
    queryFn: async () => {
      const [arrearsRes, maintenanceRes] = await Promise.all([
        supabase
          .from("arrears_cases")
          .select("id, tenant_name, balance_cents")
          .eq("status", "open")
          .order("balance_cents", { ascending: false })
          .limit(3),
        supabase
          .from("maintenance_requests")
          .select("id, title, description")
          .eq("status", "pending_review")
          .limit(2),
      ])

      const arrears: AttentionItem[] = (arrearsRes.data ?? []).map((r) => ({
        id: `arrears-${r.id}`,
        type: "arrears" as const,
        label: r.tenant_name
          ? `Arrears — ${r.tenant_name}`
          : `Arrears — ${formatZARAbbrev(r.balance_cents ?? 0)}`,
        href: "/payments?tab=arrears",
      }))

      const maintenance: AttentionItem[] = (maintenanceRes.data ?? []).map((r) => ({
        id: `maint-${r.id}`,
        type: "maintenance" as const,
        label: r.title ?? r.description ?? "Maintenance pending review",
        href: "/maintenance",
      }))

      return [...arrears, ...maintenance].slice(0, 5)
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  if (items.length === 0) return null

  return (
    <div className="mx-4 mt-4 rounded-xl bg-card border border-border overflow-hidden">
      <p className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 border-b border-border/50">
        Needs attention
      </p>
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${item.type === "arrears" ? "bg-destructive" : "bg-orange-400"}`} />
            <span className="text-sm truncate">{item.label}</span>
          </div>
          <Link href={item.href} className="ml-3 text-xs text-brand font-medium flex-shrink-0">
            View
          </Link>
        </div>
      ))}
    </div>
  )
}

// ── Recent activity ───────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  action: string
  created_at: string
  meta?: Record<string, unknown> | null
}

function RecentActivity() {
  const supabase = createClient()

  const { data: entries = [] } = useQuery<AuditEntry[]>({
    queryKey: ["mobile-recent-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, created_at, meta")
        .in("action", ["payment_recorded", "maintenance_completed", "lease_created"])
        .order("created_at", { ascending: false })
        .limit(5)
      return data ?? []
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  if (entries.length === 0) return null

  return (
    <div className="mx-4 mt-4 rounded-xl bg-card border border-border overflow-hidden">
      <p className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 border-b border-border/50">
        Recent
      </p>
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0">
          <span className="text-sm">{formatAction(entry.action)}</span>
          <span className="text-xs text-muted-foreground">{formatTime(entry.created_at)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MobileHomeScreen() {
  const { user } = useUser()
  const { displayName } = useOrg()
  const badges = useMobileHomeBadges()

  const fullName = user?.user_metadata?.full_name as string | undefined
  const firstName = fullName?.split(" ")[0] ?? "there"
  const greeting = getGreeting()
  const orgName = displayName ?? ""

  const peopleRow: Tile[] = [
    { href: "/landlords", icon: UserSquare2, label: "Landlords", badge: String(badges.landlords) },
    { href: "/tenants", icon: Users, label: "Tenants", badge: String(badges.tenants) },
    { href: "/properties", icon: Building2, label: "Properties", badge: String(badges.properties) },
  ]

  const operationsRow: Tile[] = [
    { href: "/inspections", icon: ClipboardCheck, label: "Inspections", badge: String(badges.inspections) },
    { href: "/maintenance", icon: Wrench, label: "Maintenance", badge: String(badges.maintenance) },
    { href: "/calendar", icon: CalendarDays, label: "Calendar", badge: "—" },
  ]

  const financeRow: Tile[] = [
    { href: "/payments", icon: CreditCard, label: "Collected", badge: fmtCents(badges.collected_cents) },
    { href: "/payments?tab=arrears", icon: AlertTriangle, label: "Arrears", badge: fmtCents(badges.arrears_cents) },
    { href: "/finance/deposits", icon: Shield, label: "Deposits", badge: fmtCents(badges.deposits_cents) },
  ]

  return (
    <div className="flex flex-col min-h-full bg-muted/30 pb-6">
      {/* Greeting */}
      <div className="px-4 pt-6 pb-4 bg-card border-b border-border">
        <p className="text-xs text-muted-foreground">{orgName}</p>
        <h1 className="text-2xl font-heading font-bold">
          {greeting}, {firstName}
        </h1>
      </div>

      {/* Mode C — pending sync banner */}
      <SyncSection />

      {/* 3×3 grid */}
      <div className="px-4 pt-5 space-y-5">
        <TileRow rowLabel="People" tiles={peopleRow} />
        <TileRow rowLabel="Operations" tiles={operationsRow} />
        <TileRow rowLabel="Finance" tiles={financeRow} />
      </div>

      {/* Attention section */}
      <AttentionSection />

      {/* Recent activity */}
      <RecentActivity />
    </div>
  )
}
