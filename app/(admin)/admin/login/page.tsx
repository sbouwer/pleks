"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function AdminLoginPage() {
  const [secret, setSecret] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    })

    if (!res.ok) {
      setError("Access denied")
      setLoading(false)
      return
    }

    window.location.href = "/admin"
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-6 text-center">
        <Image src="/logo-mark.svg" alt="Pleks" width={40} height={40} className="h-auto mx-auto opacity-60" />
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Admin Access</p>
        <Input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Secret"
          className="h-12 text-center font-mono"
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full h-12" disabled={loading || !secret}>
          {loading ? "..." : "Enter"}
        </Button>
      </form>
    </div>
  )
}
