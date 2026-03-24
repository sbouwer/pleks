"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "./useUser"

interface Org {
  id: string
  name: string
  type: string
  settings: Record<string, unknown>
}

interface UserOrg {
  org_id: string
  role: string
  organisations: Org
}

export function useOrg() {
  const { user } = useUser()
  const [org, setOrg] = useState<Org | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setOrg(null)
      setRole(null)
      setLoading(false)
      return
    }

    const supabase = createClient()
    supabase
      .from("user_orgs")
      .select("org_id, role, organisations(*)")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .single()
      .then(({ data }) => {
        const userOrg = data as unknown as UserOrg | null
        if (userOrg) {
          setOrg(userOrg.organisations)
          setRole(userOrg.role)
        }
        setLoading(false)
      })
  }, [user])

  return { org, role, loading }
}
