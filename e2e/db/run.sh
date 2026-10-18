#!/usr/bin/env bash
# Apply every migration + the demo seed to a throwaway local Postgres, then run a SQL test file.
# Usage: bash e2e/db/run.sh e2e/db/phase9_test.sql   (needs postgres server binaries; see README)
set -euo pipefail
cd "$(dirname "$0")/../.."
DATA=$(mktemp -d); PORT=55432
initdb -D "$DATA" -U postgres -A trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
trap 'pg_ctl -D "$DATA" stop -m fast >/dev/null' EXIT
P="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database jiran" postgres
$P -f e2e/db/stub.sql jiran
for f in supabase/migrations/*.sql; do echo "== $f"; $P -f "$f" jiran >/dev/null; done
echo "== seed"; $P -f supabase/seed.sql jiran >/dev/null
echo "== tests: $1"; $P -A -F ' = ' -t -f "$1" jiran
