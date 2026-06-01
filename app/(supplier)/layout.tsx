/**
 * app/(supplier)/layout.tsx — Supplier portal root layout — auth gate and shell
 *
 * Route:  /supplier/*
 * Auth:   getSupplierSession (Supabase-auth contractor, resolved via service — ADDENDUM_00M)
 * Data:   contractor row via getSupplierSession (no cookie-client DB read)
 */
import { redirect } from "next/navigation"
import { SupplierShell } from "./SupplierShell"
import { getSupplierSession } from "@/lib/portal/getSupplierSession"

export default async function SupplierLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSupplierSession()
  if (!session) redirect("/login?role=supplier")

  return <SupplierShell>{children}</SupplierShell>
}
