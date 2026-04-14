"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle, FileText, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { PORTFOLIO_QUERY_KEYS } from "@/lib/queries/portfolio"

interface AddLandlordFormProps {
  orgId: string
}

export function AddLandlordForm({ orgId }: Readonly<AddLandlordFormProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [createdLandlord, setCreatedLandlord] = useState<{ id: string; name: string } | null>(null)

  function handleSubmit() {
    if (!firstName.trim() && !lastName.trim()) {
      toast.error("Name is required")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/landlords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone, idNumber, orgId }),
      })
      if (res.ok) {
        const data = await res.json() as { landlordId: string }
        const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
        setCreatedLandlord({ id: data.landlordId, name })
        setFirstName("")
        setLastName("")
        setEmail("")
        setPhone("")
        setIdNumber("")
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId) })
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.properties(orgId) })
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to add landlord")
      }
    })
  }

  function handleDismiss() {
    setCreatedLandlord(null)
    setOpen(false)
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" /> Add Landlord
      </Button>
    )
  }

  if (createdLandlord) {
    const packUrl = `/api/reports/welcome-pack?orgId=${encodeURIComponent(orgId)}&landlordId=${encodeURIComponent(createdLandlord.id)}`
    return (
      <Card className="mb-6">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium">{createdLandlord.name} added successfully</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Want to send them a Welcome Pack? Portfolio overview, rental analysis, and compliance
            calendar — branded with your agency details.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.open(packUrl, "_blank")}>
              <FileText className="size-4 mr-1" /> Generate Welcome Pack
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Add landlord</p>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">First name *</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Last name *</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="082 000 0000" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">ID number</Label>
            <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="Optional — SA ID or passport" />
          </div>
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={isPending || (!firstName.trim() && !lastName.trim())}>
          {isPending ? "Adding..." : "Add landlord"}
        </Button>
      </CardContent>
    </Card>
  )
}
