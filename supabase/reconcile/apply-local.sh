#!/usr/bin/env bash
# Apply a SQL file to the LOCAL supabase stack via the db container's own psql.
# `supabase db query` takes SQL on the command line and these scripts are far past the length limit.
set -euo pipefail
FILE="$1"
CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
[ -n "$CONTAINER" ] || { echo "no local supabase db container running — npx supabase start"; exit 1; }
docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$FILE"
