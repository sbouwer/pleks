"use client"

/**
 * components/mobile/MobileHomeScreen.tsx — field-agent mobile home (the lg:hidden /dashboard view)
 *
 * Route:  /dashboard (mobile)
 * Auth:   dashboard layout (gateway)
 * Data:   useTodaySchedule (today's stops) + useMobileHomeBadges (counts) + mobile-attention query
 * Notes:  Client-only — greeting (device time), org, name, schedule and badges all come from client
 *         hooks. SSR'd (lg:hidden) so render is gated on `mounted`: server + first client paint agree
 *         (blank), then real content paints — no hydration mismatch. Door grammar throughout.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  Bell,
  UserCircle,
  ChevronRight,
  ClipboardCheck,
  Wrench,
  Banknote,
  CalendarClock,
  Building2,
  Users,
  UserSquare2,
  FileText,
  PieChart,
  CalendarDays,
  type LucideIcon,
} from "lucide-react"
import { useUser } from "@/hooks/useUser"
import { useOrg } from "@/hooks/useOrg"
import { useMobileHomeBadges } from "@/hooks/useMobileHomeBadges"
import { useNavGate } from "@/hooks/useNavGate"
import { useTodaySchedule, type ScheduleStop } from "@/hooks/useTodaySchedule"
import { formatZARAbbrev } from "@/lib/constants"
import { createClient } from "@/lib/supabase/client"
import { SA_TIMEZONE } from "@/lib/dates"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE, weekday: "short", day: "numeric", month: "short" })
}

// ── Greeting header ─────────────────────────────────────────────────────────────

function HeaderBar({ org, greeting, firstName }: Readonly<{ org: string; greeting: string; firstName: string }>) {
  return (
    <div className="px-4 pt-6 pb-5 bg-card border-b border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate" suppressHydrationWarning>
            {org ? `${org} · ${todayLabel()}` : todayLabel()}
          </p>
          <h1 className="mt-1 text-2xl font-heading font-bold leading-tight" suppressHydrationWarning>
            {greeting}, {firstName}.
          </h1>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Link
            href="/calendar"
            aria-label="Schedule"
            className="h-9 w-9 grid place-items-center rounded-[var(--r-button)] border border-border bg-background text-muted-foreground active:scale-95 transition-transform"
          >
            <Bell className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href="/settings"
            aria-label="Account"
            className="h-9 w-9 grid place-items-center rounded-[var(--r-button)] border border-border bg-background text-muted-foreground active:scale-95 transition-transform"
          >
            <UserCircle className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── On today hero ─────────────────────────────────────────────────────────────

function ScheduleRow({ stop, highlight }: Readonly<{ stop: ScheduleStop; highlight: boolean }>) {
  return (
    <Link
      href={stop.href}
      className={`flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 active:bg-muted transition-colors ${
        highlight ? "bg-primary/5" : ""
      }`}
    >
      <div className="w-12 flex-shrink-0">
        <span className={`text-sm font-bold tabular-nums ${highlight ? "text-brand" : "text-foreground"}`}>{stop.time}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{stop.title}</p>
        <p className="text-xs text-muted-foreground truncate">{stop.location}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </Link>
  )
}

function OnTodayHero() {
  const { stops, isLoading } = useTodaySchedule()
  const count = stops.length
  const stopWord = count === 1 ? "stop" : "stops"
  const heroLabel = count > 0 ? `On today · ${count} ${stopWord}` : "On today"

  return (
    <div className="mx-4 mt-5 rounded-[var(--r-button)] bg-card border border-border border-b-2 border-b-primary overflow-hidden">
      <Link href="/calendar" className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 active:bg-muted transition-colors">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {heroLabel}
        </p>
        <span className="text-xs text-brand font-medium flex items-center gap-0.5">
          Calendar <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </Link>
      {count === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">{isLoading ? "Loading…" : "Nothing scheduled today."}</p>
        </div>
      ) : (
        stops.map((stop, i) => <ScheduleRow key={stop.id} stop={stop} highlight={i === 0} />)
      )}
    </div>
  )
}

// ── Quick capture ───────────────────────────────────────────────────────────────

interface CaptureTile {
  href: string
  icon: LucideIcon
  label: string
}

const CAPTURE: CaptureTile[] = [
  { href: "/inspections/new", icon: ClipboardCheck, label: "Inspection" },
  { href: "/maintenance/new", icon: Wrench, label: "Maintenance" },
  { href: "/billing", icon: Banknote, label: "Payment" },
  { href: "/calendar", icon: CalendarClock, label: "Viewing" },
]

function QuickCapture() {
  const canSee = useNavGate()
  const tiles = CAPTURE.filter((t) => canSee(t.href))
  if (tiles.length === 0) return null
  return (
    <section className="px-4 mt-6">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Quick capture</p>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="rounded-[var(--r-button)] bg-card border border-border py-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <t.icon className="h-5 w-5 text-brand" />
            <span className="text-[11px] text-muted-foreground leading-none">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── Go to (nav grid) ─────────────────────────────────────────────────────────────

interface NavTile {
  href: string
  icon: LucideIcon
  label: string
  badge?: number
}

function GoTo({ badges }: Readonly<{ badges: ReturnType<typeof useMobileHomeBadges> }>) {
  const canSee = useNavGate()
  const tiles: NavTile[] = [
    { href: "/properties", icon: Building2, label: "Properties" },
    { href: "/tenants", icon: Users, label: "Tenants" },
    { href: "/landlords", icon: UserSquare2, label: "Landlords" },
    { href: "/leases", icon: FileText, label: "Leases" },
    { href: "/inspections", icon: ClipboardCheck, label: "Inspections", badge: badges.inspections },
    { href: "/maintenance", icon: Wrench, label: "Maintenance", badge: badges.maintenance },
    { href: "/finance", icon: PieChart, label: "Finance" },
    { href: "/calendar", icon: CalendarDays, label: "Calendar" },
  ].filter((t) => canSee(t.href))

  return (
    <section className="px-4 mt-6">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Go to</p>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="relative rounded-[var(--r-button)] bg-card border border-border py-3.5 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            {t.badge ? (
              <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground leading-none">
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            ) : null}
            <t.icon className="h-[22px] w-[22px] text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground leading-none text-center">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── Needs attention ─────────────────────────────────────────────────────────────

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
          .select("id, total_arrears_cents")
          .eq("status", "open")
          .order("total_arrears_cents", { ascending: false })
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
        label: `Arrears — ${formatZARAbbrev(r.total_arrears_cents ?? 0)}`,
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
    <section className="px-4 mt-6">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Needs attention</p>
      <div className="rounded-[var(--r-button)] bg-card border border-border overflow-hidden">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0 active:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${item.type === "arrears" ? "bg-destructive" : "bg-orange-400"}`} />
              <span className="text-sm truncate">{item.label}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MobileHomeScreen() {
  // Client-only data (greeting/org/name/schedule/badges) differs server↔client — paint nothing until
  // mounted so SSR and the first client render agree, then render real content. Kills hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { user } = useUser()
  const { displayName } = useOrg()
  const badges = useMobileHomeBadges()

  const fullName = user?.user_metadata?.full_name as string | undefined
  const firstName = fullName?.split(" ")[0] ?? "there"

  if (!mounted) return <div className="flex flex-col min-h-full bg-muted/30 pb-6" aria-hidden />

  return (
    <div className="flex flex-col min-h-full bg-muted/30 pb-6">
      <HeaderBar org={displayName ?? ""} greeting={getGreeting()} firstName={firstName} />
      <OnTodayHero />
      <QuickCapture />
      <GoTo badges={badges} />
      <AttentionSection />
    </div>
  )
}
