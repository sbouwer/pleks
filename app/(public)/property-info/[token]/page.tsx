import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { PropertyInfoForm } from "./PropertyInfoForm"

interface Props {
  params: Promise<{ token: string }>
}

interface RequestRow {
  id:             string
  org_id:         string
  property_id:    string
  topic:          string
  missing_fields: string[]
  status:         string
  expires_at:     string
  completed_at:   string | null
  viewed_at:      string | null
}

// ── State screens ─────────────────────────────────────────────────────────────

function StateScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="font-heading text-2xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PropertyInfoPage({ params }: Readonly<Props>) {
  const { token } = await params
  const service = await createServiceClient()

  const { data: req, error } = await service
    .from("property_info_requests")
    .select("id, org_id, property_id, topic, missing_fields, status, expires_at, completed_at, viewed_at")
    .eq("token", token)
    .single<RequestRow>()

  if (error || !req) return notFound()

  // Terminal states
  if (req.status === "completed" || req.completed_at) {
    return <StateScreen
      title="Already submitted"
      body="Thank you — this form has already been completed. You can close this page."
    />
  }
  if (req.status === "dismissed") {
    return <StateScreen
      title="Request withdrawn"
      body="The agent has closed this request. If you still have information to share, contact them directly."
    />
  }
  if (req.status === "expired" || new Date(req.expires_at) < new Date()) {
    return <StateScreen
      title="Link expired"
      body="This link has expired. Ask your agent to send a fresh one."
    />
  }

  // Load property + agency context for the form header
  const [{ data: property }, { data: org }] = await Promise.all([
    service.from("properties").select("name, address_line1, suburb, city").eq("id", req.property_id).single(),
    service.from("organisations").select("name").eq("id", req.org_id).single(),
  ])

  // Log 'viewed' event on first visit
  if (!req.viewed_at) {
    await service.from("property_info_requests")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", req.id)
    await service.from("property_info_request_events").insert({
      request_id: req.id,
      event_type: "viewed",
    })
  }

  const propertyLabel = property?.name ?? "the property"
  const addressLabel = property
    ? [property.address_line1, property.suburb, property.city].filter(Boolean).join(", ")
    : ""
  const agencyLabel = org?.name ?? "Your property manager"

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <header className="mb-8 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {agencyLabel} is asking about
        </p>
        <h1 className="font-heading text-2xl">{propertyLabel}</h1>
        {addressLabel && <p className="text-sm text-muted-foreground">{addressLabel}</p>}
      </header>

      <PropertyInfoForm
        token={token}
        requestId={req.id}
        topic={req.topic}
        missingFields={req.missing_fields ?? []}
        agencyName={agencyLabel}
      />
    </div>
  )
}
