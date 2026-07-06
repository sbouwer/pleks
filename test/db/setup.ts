/**
 * test/db/setup.ts — vitest setupFile for the DB-integration tier
 *
 * Auth:   points createServiceClient() (SUPABASE_SERVICE_ROLE_KEY) at the LOCAL Supabase stack
 * Notes:  Runs before any *.dbtest.ts file. The service-role key below is the well-known Supabase
 *         LOCAL demo key (identical on every `supabase start` install) — NOT a secret, safe to commit.
 *         A real env value (CI, another local port) wins via ||=. Requires `supabase start` to be up.
 */

// Local Supabase defaults (see `npx supabase status`). config.toml pins these ports.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
// Publishable/anon key is not needed for the service-role DB path, but some imports read it.
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
