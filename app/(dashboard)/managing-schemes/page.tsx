import { redirect } from "next/navigation"

export default function ManagingSchemesPage() {
  redirect("/contractors?type=managing_scheme")
}
