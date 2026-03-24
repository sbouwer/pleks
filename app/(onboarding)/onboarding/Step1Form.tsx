"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Step1FormProps {
  readonly email: string
  readonly action: (formData: FormData) => Promise<{ error?: string } | void>
}

export function OnboardingStep1Form({ email, action }: Step1FormProps) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await action(formData)
      return result || null
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="text-sm text-danger">{state.error}</p>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Trading Name *</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="trading_as">Registered Company Name</Label>
        <Input id="trading_as" name="trading_as" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="reg_number">Registration Number</Label>
          <Input id="reg_number" name="reg_number" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vat_number">VAT Number</Label>
          <Input id="vat_number" name="vat_number" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Primary Email *</Label>
        <Input id="email" name="email" type="email" defaultValue={email} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number *</Label>
        <Input id="phone" name="phone" type="tel" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">City &amp; Province</Label>
        <Input id="address" name="address" placeholder="e.g. Cape Town, Western Cape" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating..." : "Continue"}
      </Button>
    </form>
  )
}
