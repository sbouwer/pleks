#!/usr/bin/env node
/**
 * scripts/check-drift-if-sql-changed.mjs
 *
 * Conditional schema drift gate for check:full.
 * Runs check-schema-drift.mjs only when supabase/migrations/ files have changed
 * since the last commit (staged or unstaged). Exits 0 immediately otherwise.
 *
 * Why conditional: drift check hits the live DB and requires network +
 * SUPABASE_SERVICE_ROLE_KEY. Running it on every push regardless of whether
 * SQL changed is expensive and offline-hostile.
 */

import { execSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function gitChangedFiles() {
  try {
    // Staged changes
    const staged = execSync("git diff --name-only --cached", { cwd: ROOT, encoding: "utf-8" })
    // Unstaged changes
    const unstaged = execSync("git diff --name-only", { cwd: ROOT, encoding: "utf-8" })
    return staged + unstaged
  } catch {
    // Not a git repo or git unavailable — skip
    return ""
  }
}

const changed = gitChangedFiles()
const sqlChanged = changed.split("\n").some(
  f => f.startsWith("supabase/migrations/") && f.endsWith(".sql")
)

if (!sqlChanged) {
  console.log("[drift] No migration SQL changed — skipping schema drift check.")
  process.exit(0)
}

console.log("[drift] Migration SQL changed — running schema drift check...")

try {
  execSync("node scripts/check-schema-drift.mjs", {
    cwd: ROOT,
    stdio: "inherit",
  })
} catch {
  // check-schema-drift.mjs exits non-zero on drift — propagate
  process.exit(1)
}
