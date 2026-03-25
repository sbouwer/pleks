"use client"

import { useState, useEffect } from "react"
import type { ReportPeriodType } from "@/lib/reports/types"

interface Filters {
  periodType: ReportPeriodType
  propertyIds: string[]
  customFrom?: string
  customTo?: string
}

export function useReportData<T>(
  reportType: string,
  orgId: string,
  filters: Filters
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const propertyIdsKey = filters.propertyIds.join(",")

  useEffect(() => {
    let cancelled = false

    async function fetchReport() {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          type: reportType,
          orgId,
          periodType: filters.periodType,
        })
        if (filters.propertyIds.length > 0) {
          params.set("propertyIds", filters.propertyIds.join(","))
        }
        if (filters.customFrom) params.set("customFrom", filters.customFrom)
        if (filters.customTo) params.set("customTo", filters.customTo)

        const res = await fetch(`/api/reports?${params}`)
        if (!res.ok) throw new Error("Failed to load report")

        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchReport()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- propertyIds serialized to string for stable comparison
  }, [reportType, orgId, filters.periodType, propertyIdsKey, filters.customFrom, filters.customTo])

  return { data, loading, error }
}
