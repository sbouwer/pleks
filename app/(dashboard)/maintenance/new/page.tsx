"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createMaintenanceRequest } from "@/lib/actions/maintenance"
import { toast } from "sonner"

export default function NewMaintenancePage() {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await createMaintenanceRequest(formData)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="font-heading text-3xl mb-6">Log Maintenance Request</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Unit ID *</Label>
          <Input name="unit_id" placeholder="Paste unit UUID" required />
        </div>
        <div className="space-y-2">
          <Label>Property ID *</Label>
          <Input name="property_id" placeholder="Paste property UUID" required />
        </div>
        <div className="space-y-2">
          <Label>Tenant ID</Label>
          <Input name="tenant_id" placeholder="Paste tenant UUID (optional)" />
        </div>
        <div className="space-y-2">
          <Label>Title *</Label>
          <Input name="title" placeholder="Brief description of the issue" required />
        </div>
        <div className="space-y-2">
          <Label>Description *</Label>
          <Textarea name="description" rows={4} placeholder="Full details — what's happening, when it started, what was tried" required />
        </div>
        <div className="space-y-2">
          <Label>Access Instructions</Label>
          <Input name="access_instructions" placeholder="e.g. Key at reception, tenant home 9-5" />
        </div>
        <div className="space-y-2">
          <Label>Estimated Cost (ZAR)</Label>
          <Input name="estimated_cost" type="number" min="0" step="0.01" placeholder="Optional" />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Logging..." : "Log Request"}
        </Button>
      </form>
    </div>
  )
}
