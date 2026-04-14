"use client"

import { useState } from "react"
import { Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DesktopOnlyCard({
  title,
  description = "This feature works best on a larger screen. Open Pleks on your computer to use it.",
}: Readonly<{ title: string; description?: string }>) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 space-y-4">
      <div className="rounded-full bg-muted p-4">
        <Monitor className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      </div>
      <Button variant="outline" size="sm" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy link"}
      </Button>
    </div>
  )
}
