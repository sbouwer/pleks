import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { type PeachWebhookEvent, translateFailureCode, shouldRetry } from "@/lib/peach/types"
import { addBusinessDays, startOfMonth } from "date-fns"

export async function POST(req: Request) {
  const body = await req.json()

  // TODO: Verify Peach webhook signature
  // const signature = req.headers.get('x-peach-signature')

  const event = body as PeachWebhookEvent
  const supabase = await createServiceClient()

  switch (event.event_type) {
    case "mandate.authenticated": {
      await supabase.from("debicheck_mandates").update({
        status: "authenticated",
        authenticated_at: event.timestamp,
      }).eq("peach_mandate_id", event.mandate_id)

      // Update lease
      const { data: mandate } = await supabase
        .from("debicheck_mandates")
        .select("id, lease_id, org_id")
        .eq("peach_mandate_id", event.mandate_id)
        .single()

      if (mandate) {
        await supabase.from("leases").update({
          debicheck_mandate_status: "active",
        }).eq("id", mandate.lease_id)

        await supabase.from("audit_log").insert({
          org_id: mandate.org_id,
          table_name: "debicheck_mandates",
          record_id: mandate.id,
          action: "UPDATE",
          new_values: { status: "authenticated" },
        })
      }
      break
    }

    case "mandate.rejected": {
      await supabase.from("debicheck_mandates").update({
        status: "failed_authentication",
      }).eq("peach_mandate_id", event.mandate_id)
      break
    }

    case "mandate.cancelled": {
      const { data: mandate } = await supabase
        .from("debicheck_mandates")
        .select("id, lease_id, org_id")
        .eq("peach_mandate_id", event.mandate_id)
        .single()

      await supabase.from("debicheck_mandates").update({
        status: "cancelled",
        cancelled_at: event.timestamp,
        cancelled_by: "tenant",
        cancellation_reason: "Cancelled by debtor at bank",
      }).eq("peach_mandate_id", event.mandate_id)

      if (mandate) {
        await supabase.from("leases").update({
          debicheck_mandate_status: "cancelled",
        }).eq("id", mandate.lease_id)
      }
      break
    }

    case "collection.successful": {
      await supabase.from("debicheck_collections").update({
        status: "successful",
        processed_at: event.timestamp,
      }).eq("peach_collection_id", event.collection_id)

      // Get collection details to record payment
      const { data: collection } = await supabase
        .from("debicheck_collections")
        .select("id, org_id, lease_id, rent_invoice_id, amount_cents, mandate_id")
        .eq("peach_collection_id", event.collection_id)
        .single()

      if (collection?.rent_invoice_id) {
        // Update invoice
        const { data: invoice } = await supabase
          .from("rent_invoices")
          .select("total_amount_cents, amount_paid_cents")
          .eq("id", collection.rent_invoice_id)
          .single()

        if (invoice) {
          const newPaid = (invoice.amount_paid_cents || 0) + collection.amount_cents
          await supabase.from("rent_invoices").update({
            amount_paid_cents: newPaid,
            balance_cents: invoice.total_amount_cents - newPaid,
            status: newPaid >= invoice.total_amount_cents ? "paid" : "partial",
            paid_at: newPaid >= invoice.total_amount_cents ? new Date().toISOString() : null,
          }).eq("id", collection.rent_invoice_id)
        }

        // Record payment
        await supabase.from("payments").insert({
          org_id: collection.org_id,
          invoice_id: collection.rent_invoice_id,
          lease_id: collection.lease_id,
          amount_cents: collection.amount_cents,
          payment_date: new Date().toISOString().split("T")[0],
          payment_method: "debicheck",
          reference: event.collection_id,
          recon_method: "exact_match",
        })

        // Trust transaction
        await supabase.from("trust_transactions").insert({
          org_id: collection.org_id,
          lease_id: collection.lease_id,
          transaction_type: "rent_received",
          direction: "credit",
          amount_cents: collection.amount_cents,
          description: `DebiCheck collection — ${event.collection_id}`,
          reference: event.collection_id,
          statement_month: startOfMonth(new Date()).toISOString().split("T")[0],
        })
      }
      break
    }

    case "collection.failed": {
      const humanReason = translateFailureCode(event.failure_code || "")

      await supabase.from("debicheck_collections").update({
        status: "failed",
        failure_code: event.failure_code,
        failure_reason: event.failure_reason,
        failure_reason_human: humanReason,
        processed_at: event.timestamp,
      }).eq("peach_collection_id", event.collection_id)

      // Schedule retry if appropriate
      if (event.failure_code && shouldRetry(event.failure_code)) {
        const { data: failed } = await supabase
          .from("debicheck_collections")
          .select("id, org_id, mandate_id, lease_id, rent_invoice_id, amount_cents, retry_count")
          .eq("peach_collection_id", event.collection_id)
          .single()

        if (failed && failed.retry_count < 2) {
          const retryDate = addBusinessDays(new Date(), 5)
          await supabase.from("debicheck_collections").insert({
            org_id: failed.org_id,
            mandate_id: failed.mandate_id,
            lease_id: failed.lease_id,
            rent_invoice_id: failed.rent_invoice_id,
            amount_cents: failed.amount_cents,
            collection_date: retryDate.toISOString().split("T")[0],
            status: "scheduled",
            is_retry: true,
            retry_of_collection_id: failed.id,
            retry_count: failed.retry_count + 1,
          })
        }
      }
      break
    }

    case "collection.returned": {
      await supabase.from("debicheck_collections").update({
        status: "returned",
        processed_at: event.timestamp,
      }).eq("peach_collection_id", event.collection_id)
      break
    }
  }

  return NextResponse.json({ ok: true })
}
