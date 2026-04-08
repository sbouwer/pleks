import { redirect } from "next/navigation"

export default function UtilitiesPage() {
  redirect("/contractors?type=utility")
}
