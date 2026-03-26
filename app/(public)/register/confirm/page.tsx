"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"
import { Mail } from "lucide-react"

function ConfirmContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email") ?? "your email"

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>
            <Image src="/logo.svg" alt="Pleks" width={114} height={32} className="h-8 w-auto mx-auto" />
          </CardTitle>
          <CardDescription>Check your email</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center">
            <Mail className="size-6 text-brand" />
          </div>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
            Click the link in the email to activate your account.
          </p>
          <Button variant="outline" render={<Link href="/login" />}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div />}>
      <ConfirmContent />
    </Suspense>
  )
}
