/**
 * app/api/cron/purge-import-data/route.ts — POPIA purge of expired import extra data
 *
 * Route:  GET /api/cron/purge-import-data
 * Auth:   x-cron-secret header must equal CRON_SECRET
 * Data:   nulls import_sessions.extra_data past extra_data_expires_at; inserts audit_log
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

// Purge expired import extra data (POPIA compliance)
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: expired, error: expiredError } = await supabase
    .from("import_sessions")
    .select("id, org_id")
    .not("extra_data", "is", null)
    .lt("extra_data_expires_at", new Date().toISOString())
    logQueryError("GET import_sessions", expiredError)

  let purged = 0
  for (const session of expired ?? []) {
    await supabase
      .from("import_sessions")
      .update({ extra_data: null })
      .eq("id", session.id)

    await supabase.from("audit_log").insert({
      org_id: session.org_id,
      table_name: "import_sessions",
      record_id: session.id,
      action: "UPDATE",
      new_values: { action: "import_extra_data_purged" },
    })

    purged++
  }

  return Response.json({ ok: true, purged })
}
