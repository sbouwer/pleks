import { formatZAR } from "@/lib/constants"

interface LeaseListFooterProps {
  totalRent: number
  avgRent: number
  escalationsDue: number
  cpaNoticesDue: number
}

export function LeaseListFooter({
  totalRent,
  avgRent,
  escalationsDue,
  cpaNoticesDue,
}: LeaseListFooterProps) {
  return (
    <div className="-mx-6 -mb-6 border-t border-border bg-background/80 px-6 py-3 backdrop-blur-sm">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Total monthly rent</p>
          <p className="font-heading text-lg">{formatZAR(totalRent)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Avg. rent</p>
          <p className="font-heading text-lg">{formatZAR(avgRent)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Escalations due</p>
          <p className={`font-heading text-lg ${escalationsDue > 0 ? "text-amber-500" : ""}`}>
            {escalationsDue} this quarter
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">CPA notices due</p>
          <p className={`font-heading text-lg ${cpaNoticesDue > 0 ? "text-red-500" : ""}`}>
            {cpaNoticesDue} pending
          </p>
        </div>
      </div>
    </div>
  )
}
