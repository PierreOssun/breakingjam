# Every recipe uses the compose Postgres, whatever the shell exports: a Neon URL left in the
# environment must never reach `reset-db` or `seed`.
export DATABASE_URL := "postgres://breakingjam:breakingjam@localhost:5432/breakingjam"
# Uploaded flyers go to, and are served from, the `just media` bucket.
export MEDIA_STORE_URL := "http://localhost:8788"
export MEDIA_PUBLIC_URL := "http://localhost:8788"

# `just` lists these recipes.
default:
    @just --list

# Start Postgres.
db:
    docker compose up -d --wait

# Backend on :8080 (migrates on start in debug builds).
backend: db
    cd backend && cargo run --features swagger

# Frontend on :5173, proxying /api to :8080.
frontend:
    cd frontend && npm run dev

# The local media bucket on :8788, where uploaded flyers go in development.
media:
    cd deploy && npx wrangler dev -c wrangler.media.jsonc

# Backend, frontend and media bucket (Ctrl-C stops all); `uat` or `prod` runs that target's Worker, site and API container on :8787.
dev target="": db
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
      "")
        trap 'kill 0' EXIT
        (cd backend && cargo run --features swagger) &
        (cd frontend && npm run dev) &
        (cd deploy && npx wrangler dev -c wrangler.media.jsonc) &
        wait ;;
      uat|prod)
        test -f deploy/.dev.vars || { echo "Copy deploy/.dev.vars.example to deploy/.dev.vars first." >&2; exit 1; }
        (cd frontend && VITE_API_URL= npm run build)
        cd deploy
        if [ "{{target}}" = uat ]; then npx wrangler dev --env uat; else npx wrangler dev; fi ;;
      *)
        echo "Unknown target '{{target}}': use uat or prod." >&2
        exit 1 ;;
    esac

# Create the admin accounts and demo data (no-op when already seeded).
seed: db
    cd backend && cargo run --bin seed

# Drop and recreate the local database, migrate and seed it, closing connections that hold it (the IDE's).
reset-db: db
    cd backend && cargo sqlx database reset -y --force
    just seed

# Everything CI runs.
check:
    cd backend && cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test
    cd backend && cargo sqlx prepare --check -- --all-targets
    cd backend && cargo run --bin data -- check
    cd frontend && npx prettier --check . && npm run lint && npm run typecheck && npm test && npm run build
    cd deploy && npm run typecheck && npm test

# Regenerate the OpenAPI snapshot and the TypeScript client after an API change.
openapi:
    cd backend && UPDATE_OPENAPI=1 cargo test --test openapi
    cd frontend && npx openapi-typescript ../backend/openapi.json -o src/api/schema.d.ts
