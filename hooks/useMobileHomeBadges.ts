"use client"

/**
 * hooks/useMobileHomeBadges.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useQueries } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface MobileHomeBadges {
  properties: number
  tenants: number
  landlords: number
  inspections: number
  maintenance: number
  arrears_count: number
  arrears_cents: number
  deposits_cents: number
  collected_cents: number
}

const DEFAULT: MobileHomeBadges = {
  properties: 0,
  tenants: 0,
  landlords: 0,
  inspections: 0,
  maintenance: 0,
  arrears_count: 0,
  arrears_cents: 0,
  deposits_cents: 0,
  collected_cents: 0,
}

const STALE = 60_000
const REFETCH = 120_000

export function useMobileHomeBadges(): MobileHomeBadges {
  const supabase = createClient()

  const now = new Date()
  // payments.payment_date is a DATE column — compare against a YYYY-MM-DD string.
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  const results = useQueries({
    queries: [
      {
        queryKey: ["mobile-badge", "properties"],
        queryFn: async () => {
          const { count } = await supabase
            .from("properties")
            .select("id", { count: "exact", head: true })
          return count ?? 0
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "tenants"],
        queryFn: async () => {
          const { count } = await supabase
            .from("contacts")
            .select("id", { count: "exact", head: true })
            .eq("primary_role", "tenant")
          return count ?? 0
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "landlords"],
        queryFn: async () => {
          const { count } = await supabase
            .from("contacts")
            .select("id", { count: "exact", head: true })
            .eq("primary_role", "landlord")
          return count ?? 0
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "inspections"],
        queryFn: async () => {
          const { count } = await supabase
            .from("inspections")
            .select("id", { count: "exact", head: true })
            .in("status", ["scheduled", "in_progress"])
          return count ?? 0
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "maintenance"],
        queryFn: async () => {
          const { count } = await supabase
            .from("maintenance_requests")
            .select("id", { count: "exact", head: true })
            .not("status", "in", '("completed","closed","cancelled")')
          return count ?? 0
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "arrears_count"],
        queryFn: async () => {
          const { count } = await supabase
            .from("arrears_cases")
            .select("id", { count: "exact", head: true })
            .eq("status", "open")
          return count ?? 0
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "arrears_cents"],
        queryFn: async () => {
          const { data, error: queryError } = await supabase
            .from("arrears_cases")
            .select("total_arrears_cents")
            .eq("status", "open")
            logQueryError("results arrears_cases", queryError)
          return (data ?? []).reduce((sum, r) => sum + (r.total_arrears_cents ?? 0), 0)
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "deposits_cents"],
        queryFn: async () => {
          // No flat `deposits` table — deposits live in the deposit_transactions ledger.
          // "Currently held" = net of credits (deposit_received, interest) minus debits
          // (deductions, returns, forfeits). Clamp ≥ 0.
          const { data, error: queryError } = await supabase
            .from("deposit_transactions")
            .select("amount_cents, direction")
            logQueryError("results deposit_transactions", queryError)
          const net = (data ?? []).reduce(
            (sum, r) => sum + (r.direction === "credit" ? (r.amount_cents ?? 0) : -(r.amount_cents ?? 0)),
            0,
          )
          return Math.max(0, net)
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "collected_cents", firstOfMonth],
        queryFn: async () => {
          // payments has no status (every row is money received) and no paid_at — the date
          // column is payment_date. "Collected this month" = sum since the 1st.
          const { data, error: queryError } = await supabase
            .from("payments")
            .select("amount_cents")
            .gte("payment_date", firstOfMonth)
            logQueryError("results payments", queryError)
          return (data ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0)
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
    ],
  })

  const [
    propertiesQ,
    tenantsQ,
    landlordsQ,
    inspectionsQ,
    maintenanceQ,
    arrearsCountQ,
    arrearsCentsQ,
    depositsCentsQ,
    collectedCentsQ,
  ] = results

  return {
    properties: propertiesQ.data ?? DEFAULT.properties,
    tenants: tenantsQ.data ?? DEFAULT.tenants,
    landlords: landlordsQ.data ?? DEFAULT.landlords,
    inspections: inspectionsQ.data ?? DEFAULT.inspections,
    maintenance: maintenanceQ.data ?? DEFAULT.maintenance,
    arrears_count: arrearsCountQ.data ?? DEFAULT.arrears_count,
    arrears_cents: arrearsCentsQ.data ?? DEFAULT.arrears_cents,
    deposits_cents: depositsCentsQ.data ?? DEFAULT.deposits_cents,
    collected_cents: collectedCentsQ.data ?? DEFAULT.collected_cents,
  }
}
