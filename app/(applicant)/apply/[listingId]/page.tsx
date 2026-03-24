import Link from "next/link"
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR, APPLICATION_FEE_CENTS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Bed, Bath, Calendar } from "lucide-react"

export default async function ListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>
}) {
  const { listingId } = await params
  const supabase = await createServiceClient()

  const { data: listing, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .eq("status", "active")
    .single()

  if (error || !listing) notFound()

  return (
    <div className="space-y-6">
      {/* Photos placeholder */}
      <div className="aspect-video rounded-xl bg-muted flex items-center justify-center">
        <span className="text-muted-foreground text-sm">Property photos</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{listing.property_name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Address */}
          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="size-4 mt-0.5 shrink-0" />
            <span>{listing.address}</span>
          </div>

          {/* Key details */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-lg">
                {formatZAR(listing.rent_cents)}
              </span>
              <span className="text-muted-foreground">/mo</span>
            </div>
            {listing.bedrooms != null && (
              <div className="flex items-center gap-1.5 text-sm">
                <Bed className="size-4 text-muted-foreground" />
                <span>{listing.bedrooms} bed{listing.bedrooms !== 1 ? "s" : ""}</span>
              </div>
            )}
            {listing.bathrooms != null && (
              <div className="flex items-center gap-1.5 text-sm">
                <Bath className="size-4 text-muted-foreground" />
                <span>{listing.bathrooms} bath{listing.bathrooms !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>

          {/* Available date */}
          {listing.available_date && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span>
                Available{" "}
                {new Date(listing.available_date).toLocaleDateString("en-ZA", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          )}

          {/* Requirements */}
          {listing.requirements && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Requirements</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {listing.requirements}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Free application notice */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent>
          <p className="text-sm">
            <strong>Application is FREE to submit.</strong> If shortlisted, a
            screening fee of {formatZAR(APPLICATION_FEE_CENTS)} applies.
          </p>
        </CardContent>
      </Card>

      {/* Apply button */}
      <Button
        className="w-full h-12 text-base font-semibold"
        size="lg"
        render={<Link href={`/apply/${listingId}/details`} />}
      >
        Apply now
      </Button>
    </div>
  )
}
