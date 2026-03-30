"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface AddLandlordFormProps {
  orgId: string
}

export function AddLandlordForm({ orgId }: Readonly<AddLandlordFormProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [idNumber, setIdNumber] = useState("")

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
        toast.success(`${firstName} ${lastName} added`)
        setFirstName("")
        setLastName("")
        setEmail("")
        setPhone("")
        setIdNumber("")
        setOpen(false)
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to add landlord")
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" /> Add Landlord
      </Button>
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
