"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

interface OrgDetails {
  id: string
  name: string | null
  trading_as: string | null
  reg_number: string | null
  eaab_number: string | null
  vat_number: string | null
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
  type: "agency" | "landlord" | "sole_prop"
}

export default function OrganisationPage() {
  const [org, setOrg] = useState<OrgDetails | null>(null)
  const [form, setForm] = useState<Partial<OrgDetails>>({})
  const [showVat, setShowVat] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/org/details")
      if (res.ok) {
        const data: OrgDetails = await res.json()
        setOrg(data)
        setForm(data)
        if (data.vat_number) setShowVat(true)
      }
    }
    load()
  }, [])

  function set(field: keyof OrgDetails, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/org/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success("Details saved")
      } else {
        toast.error("Failed to save")
      }
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (!org) return null

  const type = org.type

  // ── Landlord variant ────────────────────────────────────────────────────────
  if (type === "landlord") {
    return (
      <div className="max-w-2xl">
        <h1 className="font-heading text-3xl mb-1">Your details</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your name and contact info appear on leases and tenant communications.
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">As it appears on your ID</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Your residential address</Label>
              <Input
                id="address"
                value={form.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Sole proprietor variant ─────────────────────────────────────────────────
  if (type === "sole_prop") {
    return (
      <div className="max-w-2xl">
        <h1 className="font-heading text-3xl mb-1">Business details</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your business information appears on leases, invoices, and communications.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">About you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trading_as">Business name</Label>
              <Input
                id="trading_as"
                value={form.trading_as ?? ""}
                onChange={(e) => set("trading_as", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If you trade under a different name. Leave blank to use your full name.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eaab_number">EAAB / FFC number</Label>
              <Input
                id="eaab_number"
                value={form.eaab_number ?? ""}
                onChange={(e) => set("eaab_number", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Not required for landlords managing own properties.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="address">Business address</Label>
              <Input
                id="address"
                value={form.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://"
                value={form.website ?? ""}
                onChange={(e) => set("website", e.target.value)}
              />
            </div>

            <div className="pt-1">
              {showVat ? (
                <div className="space-y-1.5">
                  <Label htmlFor="vat_number">VAT number</Label>
                  <Input
                    id="vat_number"
                    value={form.vat_number ?? ""}
                    onChange={(e) => set("vat_number", e.target.value)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowVat(true)}
                  className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
                >
                  VAT registered? Add VAT number
                </button>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Agency variant (default) ────────────────────────────────────────────────
  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-3xl mb-1">Organisation details</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your company information appears on all documents, invoices, and communications.
      </p>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Company information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Legal entity name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trading_as">Trading as</Label>
            <Input
              id="trading_as"
              value={form.trading_as ?? ""}
              onChange={(e) => set("trading_as", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg_number">
                CIPC registration <span className="text-destructive">*</span>
              </Label>
              <Input
                id="reg_number"
                value={form.reg_number ?? ""}
                onChange={(e) => set("reg_number", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eaab_number">
                EAAB / FFC number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="eaab_number"
                value={form.eaab_number ?? ""}
                onChange={(e) => set("eaab_number", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vat_number">VAT number</Label>
            <Input
              id="vat_number"
              value={form.vat_number ?? ""}
              onChange={(e) => set("vat_number", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="address">
              Registered address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="address"
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              placeholder="https://"
              value={form.website ?? ""}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
