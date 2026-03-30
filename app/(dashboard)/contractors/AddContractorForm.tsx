"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface AddContractorFormProps {
  orgId: string
}

export function AddContractorForm({ orgId }: Readonly<AddContractorFormProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [companyName, setCompanyName] = useState("")

  function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, companyName, orgId }),
      })
      if (res.ok) {
        toast.success(`${name} added`)
        setName("")
        setEmail("")
        setPhone("")
        setCompanyName("")
        setOpen(false)
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to add contractor")
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" /> Add Contractor
      </Button>
    )
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Add contractor</p>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business or person name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Company / Trading As</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="082 000 0000" />
          </div>
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={isPending || !name.trim()}>
          {isPending ? "Adding..." : "Add contractor"}
        </Button>
      </CardContent>
    </Card>
  )
}
