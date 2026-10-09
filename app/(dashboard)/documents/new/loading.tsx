/**
 * app/(dashboard)/documents/new/loading.tsx — the document editor's own skeleton
 *
 * Route:  /documents/new
 * Notes:  Mirrors DocumentEditorClient's split pane, composed inline because nothing in page-skeleton fits a
 *         height-calc editor: breadcrumb → bordered two-pane box (left: toolbar of template/subject/recipient, editor,
 *         merge-field chips; right: preview) → action bar (Save draft | Download PDF + Save & email). The WhatsApp
 *         button appears only after a client effect (and only with ?lease) and is not reserved.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function NewDocumentLoading() {
  return (
    <div>
      <Skeleton className="mb-4 h-5 w-48" />
      <div className="flex h-[calc(100vh-10rem)] flex-col">
        <div className="grid flex-1 overflow-hidden rounded-lg border border-border md:grid-cols-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-8 w-40 rounded-[var(--r-button)]" />
              <Skeleton className="h-8 w-40 rounded-[var(--r-button)]" />
              <Skeleton className="h-8 w-40 rounded-[var(--r-button)]" />
            </div>
            <Skeleton className="m-4 min-h-[200px] flex-1 rounded-[var(--r-button)]" />
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              <Skeleton className="h-3.5 w-32" />
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-20 rounded-full" />)}
            </div>
          </div>
          <div className="border-t border-border p-4 md:border-l md:border-t-0">
            <Skeleton className="h-full min-h-[200px] w-full rounded-[var(--r-button)]" />
          </div>
        </div>
        <div className="mt-3 flex shrink-0 items-center justify-between border-t border-border px-1 py-3">
          <Skeleton className="h-9 w-28 rounded-[var(--r-button)]" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-[var(--r-button)]" />
            <Skeleton className="h-9 w-32 rounded-[var(--r-button)]" />
          </div>
        </div>
      </div>
    </div>
  )
}
