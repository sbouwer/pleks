"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "./useOrg"
import type { Tier } from "@/lib/constants"

export function useTier() {
  const { org } = useOrg()
  const [tier, setTier] = useState<Tier>("owner")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!org) {
      setTier("owner")
      setLoading(false)
      return
    }

    const supabase = createClient()
    supabase
      .from("subscriptions")
      .select("tier")
      .eq("org_id", org.id)
      .eq("status", "active")
      .limit(1)
      .single()
      .then(({ data }) => {
        setTier((data?.tier as Tier) || "owner")
        setLoading(false)
      })
  }, [org])

  return { tier, loading }
}
