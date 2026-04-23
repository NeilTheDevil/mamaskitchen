#!/usr/bin/env bash
# Deploys Mama's Kitchen food app:
#   1. Pushes server configs + frontend to the GCP VM
#   2. Restarts the Docker Compose stack (adds Postgres for the food app)
#   3. Creates a Postgres credential in n8n via the public API
#   4. Imports + activates all 4 workflows
#
# Run from the project root: `bash deploy.sh`
# Requires: gcloud (authenticated), curl, jq, tar. All present in GCP Cloud Shell.

set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "❌ .env not found — run from project root." >&2; exit 1; }
set -a; source .env; set +a

: "${N8N_API_URL:?missing in .env}"
: "${N8N_API_KEY:?missing in .env}"
: "${N8N_DOMAIN:?missing in .env}"
: "${FOOD_DOMAIN:?missing in .env}"
: "${POSTGRES_DB:?missing in .env}"
: "${POSTGRES_USER:?missing in .env}"
: "${POSTGRES_PASSWORD:?missing in .env}"
: "${ADMIN_SECRET:?missing in .env}"

VM="${VM_NAME:-n8n-server}"
ZONE="${VM_ZONE:-europe-west1-b}"

# ─────────────────────────────────────────────────────────
echo "==> [1/6] Building server .env and frontend bundle..."
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

cat > "$TMPDIR/server.env" <<EOF
N8N_DOMAIN=${N8N_DOMAIN}
FOOD_DOMAIN=${FOOD_DOMAIN}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
ADMIN_SECRET=${ADMIN_SECRET}
EOF

tar -czf "$TMPDIR/food-frontend.tgz" -C frontend .

cat > "$TMPDIR/remote-install.sh" <<'REMOTE'
set -euo pipefail
sudo mv /tmp/docker-compose.yml /opt/n8n/docker-compose.yml
sudo mv /tmp/Caddyfile         /opt/n8n/Caddyfile
sudo mv /tmp/init-db.sql       /opt/n8n/init-db.sql
sudo mv /tmp/server.env        /opt/n8n/.env
sudo chmod 600 /opt/n8n/.env
sudo mkdir -p /srv/food
sudo tar -xzf /tmp/food-frontend.tgz -C /srv/food
sudo rm -f /tmp/food-frontend.tgz /tmp/remote-install.sh
cd /opt/n8n
sudo docker compose --env-file .env down
sudo docker compose --env-file .env up -d
REMOTE

# ─────────────────────────────────────────────────────────
echo "==> [2/6] Uploading to VM ($VM in $ZONE)..."
gcloud compute scp --zone="$ZONE" --quiet \
    server/docker-compose.yml \
    server/Caddyfile \
    server/init-db.sql \
    "$TMPDIR/server.env" \
    "$TMPDIR/food-frontend.tgz" \
    "$TMPDIR/remote-install.sh" \
    "$VM":/tmp/

# ─────────────────────────────────────────────────────────
echo "==> [3/6] Installing configs and restarting Docker stack..."
# Runs the uploaded script via --command (not stdin) because gcloud's bundled
# plink on Windows injects a leading "y\n" into remote stdin, breaking heredocs.
gcloud compute ssh "$VM" --zone="$ZONE" --quiet \
    --command='bash /tmp/remote-install.sh' < /dev/null

# ─────────────────────────────────────────────────────────
echo "==> [4/6] Waiting for n8n public API to be ready..."
# /healthz flips early — the public API router boots a few seconds later, so
# we probe /api/v1/workflows instead to avoid a race against step 5.
for i in $(seq 1 90); do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        "${N8N_API_URL}/api/v1/workflows" || true)
    if [ "$code" = "200" ]; then
        echo "   public API is up."
        break
    fi
    [ "$i" = 90 ] && { echo "❌ n8n public API didn't come up in 3 min (last code: $code)" >&2; exit 1; }
    sleep 2
done

# ─────────────────────────────────────────────────────────
echo "==> [5/6] Ensuring Postgres credential in n8n..."
CRED_NAME="Food App Postgres"

# Delete any pre-existing credential with the same name so re-runs are idempotent.
# The public API's credentials list endpoint doesn't expose names, so we fetch
# each and filter client-side.
EXISTING_CRED_IDS=$(curl -fsS "${N8N_API_URL}/api/v1/credentials" \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}" | \
    jq -r --arg n "$CRED_NAME" '(.data // .) | map(select(.name == $n) | .id) | .[]')
for id in $EXISTING_CRED_IDS; do
    curl -fsS -X DELETE "${N8N_API_URL}/api/v1/credentials/${id}" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" > /dev/null
    echo "   Removed stale credential $id."
done

CRED_PAYLOAD=$(jq -n \
    --arg name "$CRED_NAME" \
    --arg host "postgres" \
    --argjson port 5432 \
    --arg database "$POSTGRES_DB" \
    --arg user "$POSTGRES_USER" \
    --arg password "$POSTGRES_PASSWORD" \
    '{ name: $name, type: "postgres",
       data: { host: $host, port: $port, database: $database, user: $user, password: $password,
               ssl: "disable", allowUnauthorizedCerts: false, sshTunnel: false } }')

CRED_RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST "${N8N_API_URL}/api/v1/credentials" \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$CRED_PAYLOAD")
CRED_CODE=$(printf '%s' "$CRED_RESPONSE" | tail -n1)
CRED_BODY=$(printf '%s' "$CRED_RESPONSE" | sed '$d')

if [ "$CRED_CODE" = "200" ] || [ "$CRED_CODE" = "201" ]; then
    CRED_ID=$(echo "$CRED_BODY" | jq -r '.id')
    echo "   Created credential (id=$CRED_ID)."
else
    echo "   ❌ n8n rejected credential creation (HTTP $CRED_CODE)."
    echo "   Response: $CRED_BODY"
    exit 1
fi

# ─────────────────────────────────────────────────────────
echo "==> [6/6] Importing + activating workflows..."
for wf in workflows/*.json; do
    WF_NAME=$(jq -r '.name' "$wf")
    printf "   %-60s " "$WF_NAME"

    # Inject credential into every Postgres node, strip fields the API rejects
    PATCHED=$(jq --arg cid "$CRED_ID" --arg cname "$CRED_NAME" '
        .nodes |= map(
          if .type == "n8n-nodes-base.postgres"
          then . + { credentials: { postgres: { id: $cid, name: $cname } } }
          else . end
        )
        | { name, nodes, connections, settings: (.settings // {}) }
    ' "$wf")

    # Delete existing workflow with same name (makes re-runs idempotent)
    EXISTING=$(curl -fsS "${N8N_API_URL}/api/v1/workflows" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" | \
        jq -r --arg n "$WF_NAME" '.data[] | select(.name == $n) | .id' | head -1)
    if [ -n "$EXISTING" ]; then
        curl -fsS -X DELETE "${N8N_API_URL}/api/v1/workflows/${EXISTING}" \
            -H "X-N8N-API-KEY: ${N8N_API_KEY}" > /dev/null
    fi

    WF_ID=$(curl -fsS -X POST "${N8N_API_URL}/api/v1/workflows" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$PATCHED" | jq -r '.id')

    curl -fsS -X POST "${N8N_API_URL}/api/v1/workflows/${WF_ID}/activate" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" > /dev/null

    echo "✓ activated (id=$WF_ID)"
done

# ─────────────────────────────────────────────────────────
cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Deploy complete.

   🍽️   Menu    →  https://${FOOD_DOMAIN}
   🔍  Track   →  https://${FOOD_DOMAIN}/track.html
   🛠️   Admin   →  https://${FOOD_DOMAIN}/admin.html?key=${ADMIN_SECRET}
   ⚙️   n8n     →  https://${N8N_DOMAIN}

   (Admin URL is in your .env as ADMIN_SECRET — keep it private.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
