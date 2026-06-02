/**
 * components/ui/skeleton.tsx — pulsing placeholder block for loading states
 *
 * Notes:  Uses muted-foreground/20 (not bg-muted, which sits almost on top of the page background and
 *         reads as nearly invisible in the light theme). This tone is clearly visible in both themes.
 */
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted-foreground/20", className)}
      {...props}
    />
  )
}

export { Skeleton }
