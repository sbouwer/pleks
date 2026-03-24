"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createInspection } from "@/lib/actions/inspections"
import { toast } from "sonner"

export default function NewInspectionPage() {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await createInspection(formData)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="font-heading text-3xl mb-6">Schedule Inspection</h1>
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
          <Input name="tenant_id" placeholder="Paste tenant UUID (optional for pre-listing)" />
        </div>
        <div className="space-y-2">
          <Label>Lease ID</Label>
          <Input name="lease_id" placeholder="Paste lease UUID (optional)" />
        </div>
        <div className="space-y-2">
          <Label>Inspection Type *</Label>
          <Select name="inspection_type" defaultValue="move_in">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="move_in">Move-in</SelectItem>
              <SelectItem value="periodic">Periodic</SelectItem>
              <SelectItem value="move_out">Move-out</SelectItem>
              <SelectItem value="pre_listing">Pre-listing</SelectItem>
              <SelectItem value="commercial_handover">Commercial Handover</SelectItem>
              <SelectItem value="commercial_dilapidations">Commercial Dilapidations</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Lease Type *</Label>
          <Select name="lease_type" defaultValue="residential">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="residential">Residential</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Scheduled Date</Label>
          <Input name="scheduled_date" type="datetime-local" />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Create Inspection"}
        </Button>
      </form>
    </div>
  )
}
