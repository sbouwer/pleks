import Link from "next/link"
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR, APPLICATION_FEE_CENTS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Bed, Bath, Calendar, CheckCircle2 } from "lucide-react"

export default async function ListingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const service = await createServiceClient()

  const { data: listing } = await service
    .from("listings")
    .select("*, units(unit_number, bedrooms, bathrooms, size_m2, properties(name, address_line1, city))")
    .eq("public_slug", slug)
    .eq("status", "active")
    .maybeSingle()

  if (!listing) notFound()

  const unit = listing.units as unknown as { unit_number: string; bedrooms: number | null; bathrooms: number | null; size_m2: number | null; properties: { name: string; address_line1: string | null; city: string | null } } | null
  const propertyName = unit?.properties?.name ?? "Property"
  const address = [unit?.properties?.address_line1, unit?.properties?.city].filter(Boolean).join(", ")
  const unitLabel = unit?.unit_number ?? ""
  const minIncome = listing.min_income_multiple
    ? Math.round((listing.asking_rent_cents / 100) * listing.min_income_multiple)
    : null

  const requiredDocs: Array<{ key: string; label: string }> = [
    { key: "id_document", label: "SA ID or valid passport" },
    { key: "payslip_x3", label: "3 recent payslips" },
    { key: "bank_statement_x3", label: "3-month bank statement" },
    { key: "employment_letter", label: "Employment letter" },
  ]

  return (
    <div className="space-y-6">
      {/* Photos placeholder */}
      {(!listing.listing_photos || (listing.listing_photos as string[]).length === 0) ? (
        <div className="aspect-video rounded-xl bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-sm">Property photos</span>
        </div>
      ) : (
        <div className="aspect-video rounded-xl bg-muted overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={(listing.listing_photos as string[])[0]}
            alt={propertyName}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">{unitLabel ? `${unitLabel} — ` : ""}{propertyName}</h1>
        {address && (
          <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
            <MapPin className="size-4 shrink-0" />
            <span className="text-sm">{address}</span>
          </div>
        )}
      </div>

      {/* Key details */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-baseline gap-1">
          <span className="font-semibold text-xl">{formatZAR(listing.asking_rent_cents)}</span>
          <span className="text-muted-foreground">/month</span>
        </div>
        {unit?.bedrooms != null && (
          <div className="flex items-center gap-1.5">
            <Bed className="size-4 text-muted-foreground" />
            <span>{unit.bedrooms} bed{unit.bedrooms !== 1 ? "s" : ""}</span>
          </div>
        )}
        {unit?.bathrooms != null && (
          <div className="flex items-center gap-1.5">
            <Bath className="size-4 text-muted-foreground" />
            <span>{unit.bathrooms} bath{unit.bathrooms !== 1 ? "s" : ""}</span>
          </div>
        )}
        {listing.available_from && (
          <div className="flex items-center gap-1.5">
            <Calendar className="size-4 text-muted-foreground" />
            <span>Available {new Date(listing.available_from).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {listing.description && (
        <Card>
          <CardHeader><CardTitle className="text-base">About this property</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{listing.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      {(listing.requirements || minIncome || listing.pet_friendly != null) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Requirements</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm text-muted-foreground">
            {minIncome && <p>• Minimum income: {formatZAR(minIncome * 100)}/month</p>}
            {listing.requirements && (
              <p className="whitespace-pre-line">{listing.requirements}</p>
            )}
            {listing.pet_friendly === true && <p>• Pets welcome</p>}
            {listing.pet_friendly === false && <p>• No pets</p>}
          </CardContent>
        </Card>
      )}

      {/* Required documents */}
      <Card>
        <CardHeader><CardTitle className="text-base">What you&apos;ll need</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {requiredDocs.map((doc) => (
            <div key={doc.key} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-muted-foreground shrink-0" />
              <span>{doc.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Application fee notice */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="pt-4">
          <p className="text-sm">
            <strong>Application is FREE to submit.</strong>{" "}
            If shortlisted, a screening fee of {formatZAR(APPLICATION_FEE_CENTS)} applies.
          </p>
        </CardContent>
      </Card>

      {/* CTA */}
      <Button
        className="w-full h-14 text-base font-semibold"
        size="lg"
        render={<Link href={`/apply/${slug}/details`} />}
      >
        Apply now →
      </Button>
    </div>
  )
}
