"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
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
import { ArrowRight, CheckCircle2 } from "lucide-react"

export default function EarlyAccessPage() {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Something went wrong. Please try again.")
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16 md:py-24">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Image
            src="/logo-mark.svg"
            alt="Pleks"
            width={64}
            height={64}
            className="mx-auto mb-6"
          />
          <h1 className="font-heading text-3xl md:text-4xl mb-3">
            Pleks is launching in Paarl.
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            SA property management built by someone who has done it for 11
            years. Join the waitlist for founding agent pricing.
          </p>
        </div>

        {success ? (
          <div className="rounded-lg bg-surface border border-brand/30 p-6 text-center space-y-3">
            <CheckCircle2 className="size-10 text-brand mx-auto" />
            <p className="font-heading text-xl">You&apos;re on the list.</p>
            <p className="text-sm text-muted-foreground">
              We&apos;ll be in touch with founding agent details soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">I am a:</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v ?? "")}
                required
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="property_agent">
                    Property agent
                  </SelectItem>
                  <SelectItem value="portfolio_manager">
                    Portfolio manager
                  </SelectItem>
                  <SelectItem value="private_landlord">
                    Private landlord
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full text-base h-11"
              disabled={submitting}
            >
              {submitting ? "Joining..." : "Join the waitlist"}
              {!submitting && <ArrowRight className="ml-2 size-4" />}
            </Button>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              By joining, you agree to our{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              . We&apos;ll only use your email to contact you about Pleks.
              POPIA compliant.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
