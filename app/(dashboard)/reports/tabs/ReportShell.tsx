"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

interface ReportShellProps {
  title: string
  loading: boolean
  error: string | null
  onExportCSV?: () => void
  onExportPDF?: () => void
  children: React.ReactNode
}

export function ReportShell({ title, loading, error, onExportCSV, onExportPDF, children }: ReportShellProps) {
  if (loading) {
    return (
      <Card className="mt-4">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <span className="text-sm text-muted-foreground">Loading report...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="mt-4">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg">{title}</h2>
        <div className="flex gap-2">
          {onExportCSV && (
            <Button variant="outline" size="sm" onClick={onExportCSV}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              CSV
            </Button>
          )}
          {onExportPDF && (
            <Button variant="outline" size="sm" onClick={onExportPDF}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              PDF
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  variant?: "default" | "success" | "warning" | "danger"
}

export function MetricCard({ label, value, sub, variant = "default" }: MetricCardProps) {
  const colorClass = {
    default: "",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  }[variant]

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-heading text-xl ${colorClass}`}>
          {value}
          {sub && <span className="text-xs text-muted-foreground ml-1">{sub}</span>}
        </p>
      </CardContent>
    </Card>
  )
}
