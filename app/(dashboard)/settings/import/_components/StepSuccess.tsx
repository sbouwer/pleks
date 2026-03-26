"use client"

import { Button } from "@/components/ui/button"
import { CheckCircle2 } from "lucide-react"
import Link from "next/link"
import type { ImportResultData } from "../page"

interface StepSuccessProps {
  result: ImportResultData
  onReset: () => void
}

export function StepSuccess({ result, onReset }: Readonly<StepSuccessProps>) {
  return (
    <div className="max-w-md mx-auto text-center py-8">
      <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-6">
        <CheckCircle2 className="size-8 text-green-500" />
      </div>

      <h2 className="font-heading text-2xl mb-2">Portfolio imported</h2>
      <p className="text-muted-foreground text-sm mb-6">
        {result.created.tenants} tenant{result.created.tenants !== 1 ? "s" : ""} · {result.created.units} unit{result.created.units !== 1 ? "s" : ""} · {result.created.leases} lease{result.created.leases !== 1 ? "s" : ""}
      </p>

      {result.skipped > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          {result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped
        </p>
      )}

      {result.errors.length > 0 && (
        <p className="text-xs text-amber-500 mb-4">
          {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} had errors — check the import log for details.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button render={<Link href="/dashboard" />}>
          View dashboard
        </Button>
        <Button variant="outline" onClick={onReset}>
          Import another file
        </Button>
      </div>
    </div>
  )
}
