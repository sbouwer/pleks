import { redirect } from "next/navigation"

export default function ManagingSchemesPage() {
  redirect("/suppliers?type=managing_scheme")
}
