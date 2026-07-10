/**
 * lib/admin/dashboard-queries.ts — All admin dashboard SQL in one place
 *
 * Auth:   Server-only — called after requireAdminAuth() in the dashboard page
 * Data:   organisations, subscriptions, feedback_submissions, contact_leads,
 *         custom_lease_requests, cron_runs, ai_usage (read via service-role)
 * Notes:  All queries run in parallel via Promise.all for ~50ms cold total.
 *         Page caches the result with revalidate=60.
 */
import { createServiceClient } from "@/lib/supabase/server"

export interface AttentionItem {
  source: "feedback" | "contact_lead" | "lease_request" | "expiring_trial" | "past_due_sub"
  id: string
  title: string
  severity: "low" | "medium" | "high"
  age_days: number
  deeplink: string
}

export interface DashboardSnapshot {
  attentionQueue: AttentionItem[]
  tierDistribution: { tier: string; count: number }[]
  funnel: { waitlist: number; trialing: number; paid: number; conversion_rate_pct: number }
  mrr: { current_cents: number; previous_cents: number; delta_pct: number }
  recentSignups: { id: string; name: string; tier: string; status: string; created_at: string }[]
  failedCrons: { job_name: string; started_at: string; error_message: string | null }[]
  primeRate: { rate_percent: number; effective_date: string } | null
  totalOrgs: number
  activeOrgs: number
}

export async function getAdminDashboardData(): Promise<DashboardSnapshot> {
  const db = await createServiceClient()

  const now = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const firstOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))

  const [
    feedbackItems,
    contactLeadItems,
    leaseRequestItems,
    expiringTrials,
    pastDueSubs,
    tierDist,
    waitlistCount,
    trialingCount,
    paidCount,
    orgCount,
    recentSignups,
    failedCrons,
    primeRate,
    currentMonthSubs,
    lastMonthSubs,
  ] = await Promise.all([
    // Attention: feedback
    db.from("feedback_submissions")
      .select("id, subject, created_at")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(20),

    // Attention: contact leads
    db.from("contact_leads")
      .select("id, name, created_at")
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(20),

    // Attention: lease requests
    db.from("custom_lease_requests")
      .select("id, template_path, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),

    // Attention: expiring trials
    db.from("subscriptions")
      .select("org_id, trial_ends_at, organisations(name)")
      .eq("status", "trialing")
      .eq("trial_converted", false)
      .lte("trial_ends_at", sevenDaysFromNow.toISOString())
      .gte("trial_ends_at", now.toISOString()),

    // Attention: past-due subs
    db.from("subscriptions")
      .select("org_id, updated_at, organisations(name)")
      .in("status", ["past_due", "grace_period"]),

    // Tier distribution
    db.from("subscriptions")
      .select("tier")
      .eq("status", "active"),

    // Funnel counts
    db.from("waitlist").select("id", { count: "exact", head: true }),
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").neq("tier", "owner"),

    // Org count — the Pleks system org is not a customer, so it must not inflate the count (010 §50).
    db.from("organisations").select("id", { count: "exact", head: true }).eq("is_platform", false),

    // Recent signups — likewise: the system org never "signed up".
    db.from("organisations")
      .select("id, name, created_at, subscriptions(tier, status, created_at)")
      .eq("is_platform", false)
      .order("created_at", { ascending: false })
      .limit(7),

    // Failed crons (last 24h)
    db.from("cron_runs")
      .select("job_name, started_at, error_message")
      .eq("status", "failed")
      .gte("started_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .order("started_at", { ascending: false })
      .limit(10),

    // Prime rate
    db.from("prime_rates")
      .select("rate_percent, effective_date")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // MRR current month
    db.from("subscriptions")
      .select("amount_cents, billing_cycle")
      .eq("status", "active")
      .neq("tier", "owner")
      .gte("created_at", firstOfMonth.toISOString()),

    // MRR last month (rough — subs active as of start of month)
    db.from("subscriptions")
      .select("amount_cents, billing_cycle")
      .eq("status", "active")
      .neq("tier", "owner")
      .gte("created_at", firstOfLastMonth.toISOString())
      .lt("created_at", firstOfMonth.toISOString()),
  ])

  // Build attention queue
  const queue: AttentionItem[] = []

  for (const f of feedbackItems.data ?? []) {
    queue.push({
      source: "feedback",
      id: f.id,
      title: (f.subject as string) ?? "Feedback",
      severity: "low",
      age_days: Math.floor((now.getTime() - new Date(f.created_at).getTime()) / 86400000),
      deeplink: `/admin/feedback/${f.id}`,
    })
  }

  for (const c of contactLeadItems.data ?? []) {
    queue.push({
      source: "contact_lead",
      id: c.id,
      title: (c.name as string) ?? "Contact lead",
      severity: "medium",
      age_days: Math.floor((now.getTime() - new Date(c.created_at).getTime()) / 86400000),
      deeplink: `/admin/contact-leads/${c.id}`,
    })
  }

  for (const lr of leaseRequestItems.data ?? []) {
    queue.push({
      source: "lease_request",
      id: lr.id,
      title: (lr.template_path as string) ?? "Lease request",
      severity: "medium",
      age_days: Math.floor((now.getTime() - new Date(lr.created_at).getTime()) / 86400000),
      deeplink: `/admin/lease-requests`,
    })
  }

  for (const t of expiringTrials.data ?? []) {
    const org = (t.organisations as unknown as { name: string } | null)
    const daysRemaining = Math.ceil((new Date(t.trial_ends_at!).getTime() - now.getTime()) / 86400000)
    queue.push({
      source: "expiring_trial",
      id: t.org_id,
      title: org?.name ?? t.org_id,
      severity: "high",
      age_days: daysRemaining,
      deeplink: `/admin/orgs/${t.org_id}`,
    })
  }

  for (const s of pastDueSubs.data ?? []) {
    const org = (s.organisations as unknown as { name: string } | null)
    queue.push({
      source: "past_due_sub",
      id: s.org_id,
      title: org?.name ?? s.org_id,
      severity: "high",
      age_days: Math.floor((now.getTime() - new Date(s.updated_at).getTime()) / 86400000),
      deeplink: `/admin/orgs/${s.org_id}`,
    })
  }

  const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }
  queue.sort((a, b) => {
    const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    return sr !== 0 ? sr : b.age_days - a.age_days
  })

  // Tier distribution
  const tierCounts = new Map<string, number>()
  for (const s of tierDist.data ?? []) {
    const t = (s.tier as string) ?? "unknown"
    tierCounts.set(t, (tierCounts.get(t) ?? 0) + 1)
  }
  const tierDistribution = Array.from(tierCounts.entries()).map(([tier, count]) => ({ tier, count }))

  // Funnel
  const waitlist = waitlistCount.count ?? 0
  const trialing = trialingCount.count ?? 0
  const paid     = paidCount.count ?? 0
  const conv     = waitlist > 0 ? Math.round((paid / waitlist) * 100) : 0

  // MRR (sum of monthly-equivalent prices)
  function mrrFromRows(rows: { amount_cents: number | null; billing_cycle: string | null }[]): number {
    return rows.reduce((sum, r) => {
      const p = r.amount_cents ?? 0
      const annual = r.billing_cycle === "annual"
      return sum + (annual ? Math.round(p / 12) : p)
    }, 0)
  }
  const currentMrr  = mrrFromRows(currentMonthSubs.data ?? [])
  const previousMrr = mrrFromRows(lastMonthSubs.data ?? [])
  const deltaPct    = previousMrr > 0 ? Math.round(((currentMrr - previousMrr) / previousMrr) * 100) : 0

  // Recent signups
  const recentSignupsNorm = (recentSignups.data ?? []).map((o) => {
    const subs = (o.subscriptions as unknown as { tier: string; status: string; created_at: string }[] | null) ?? []
    const sub = subs.toSorted((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    return {
      id: o.id as string,
      name: o.name as string,
      tier: sub?.tier ?? "owner",
      status: sub?.status ?? "trialing",
      created_at: o.created_at as string,
    }
  })

  return {
    attentionQueue: queue.slice(0, 10),
    tierDistribution,
    funnel: { waitlist, trialing, paid, conversion_rate_pct: conv },
    mrr: { current_cents: currentMrr, previous_cents: previousMrr, delta_pct: deltaPct },
    recentSignups: recentSignupsNorm,
    failedCrons: (failedCrons.data ?? []).map((c) => ({
      job_name:      c.job_name as string,
      started_at:    c.started_at as string,
      error_message: c.error_message as string | null,
    })),
    primeRate: primeRate.data ? {
      rate_percent:   primeRate.data.rate_percent as number,
      effective_date: primeRate.data.effective_date as string,
    } : null,
    totalOrgs:  orgCount.count ?? 0,
    activeOrgs: paid,
  }
}
