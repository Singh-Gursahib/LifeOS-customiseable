#!/usr/bin/env bash
# One-shot Vercel setup + production deploy for LifeOS.
# Prereq: `vercel login` (once). Then run: bash scripts/deploy-vercel.sh
#
# Reads the runtime env vars from .env.local and pushes them to the Vercel
# project (production env), links/creates the project, and deploys --prod.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! vercel whoami >/dev/null 2>&1; then
  echo "You're not logged into Vercel. Run:  vercel login   then re-run this script."
  exit 1
fi

# Load .env.local. Via a temp file, NOT `source <(...)`: process substitution yields
# nothing under bash 3.2 (macOS system bash), which silently left every var empty and
# skipped the entire env upload.
if [[ ! -f .env.local ]]; then echo "Missing .env.local"; exit 1; fi
ENVTMP="$(mktemp)"
trap 'rm -f "$ENVTMP"' EXIT
grep -E '^[A-Z0-9_]+=' .env.local > "$ENVTMP"
set -a; source "$ENVTMP"; set +a

# Uses the already-linked project in .vercel/project.json; override with VERCEL_PROJECT.
if [[ -n "${VERCEL_PROJECT:-}" ]]; then
  echo "==> Linking Vercel project '$VERCEL_PROJECT'…"
  vercel link --yes --project "$VERCEL_PROJECT" >/dev/null
elif [[ ! -f .vercel/project.json ]]; then
  echo "No linked Vercel project. Run once:  vercel link   (or: VERCEL_PROJECT=<name> npm run deploy)"; exit 1
fi

# Runtime env vars the app needs.
# AUTH_SECRET is REQUIRED: without it every session is rejected and the app is unusable.
# Optional ones that are unset in .env.local are simply skipped.
RUNTIME_VARS=(
  NEXT_PUBLIC_SUPABASE_URL SUPABASE_SECRET_KEY
  AUTH_SECRET
  OPENROUTER_API_KEYS OPENROUTER_MODEL
  OPENROUTER_TRANSCRIBE_MODEL
  GEMINI_API_KEYS GEMINI_MODEL
)

echo "==> Setting production environment variables…"
for name in "${RUNTIME_VARS[@]}"; do
  val="${!name:-}"
  if [[ -z "$val" ]]; then echo "  · $name not set — skipping"; continue; fi
  # remove any existing value first (ignore error if absent), then add
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$val" | vercel env add "$name" production >/dev/null
  echo "  ✓ $name"
done

echo "==> Deploying to production…"
vercel deploy --prod --yes
echo "==> Done. The URL above is your live LifeOS."
