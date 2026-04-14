"use client"
import { useQueries } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

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
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

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
          const { data } = await supabase
            .from("arrears_cases")
            .select("balance_cents")
            .eq("status", "open")
          return (data ?? []).reduce((sum, r) => sum + (r.balance_cents ?? 0), 0)
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "deposits_cents"],
        queryFn: async () => {
          const { data } = await supabase
            .from("deposits")
            .select("amount_cents")
            .in("status", ["held", "invested"])
          return (data ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0)
        },
        staleTime: STALE,
        refetchInterval: REFETCH,
      },
      {
        queryKey: ["mobile-badge", "collected_cents", firstOfMonth],
        queryFn: async () => {
          const { data } = await supabase
            .from("payments")
            .select("amount_cents")
            .eq("status", "completed")
            .gte("paid_at", firstOfMonth)
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
