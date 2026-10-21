# `just` lists these recipes.
default:
    @just --list

# Start Postgres.
db:
    docker compose up -d --wait

# Backend on :8080 (migrates on start in debug builds).
backend: db
    cd backend && cargo run

# Frontend on :5173, proxying /api to :8080.
frontend:
    cd frontend && npm run dev

# Backend and frontend (Ctrl-C stops both); `uat` or `prod` runs that target's Worker, site and API container on :8787.
dev target="": db
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
      "")
        trap 'kill 0' EXIT
        (cd backend && cargo run) &
        (cd frontend && npm run dev) &
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

# Drop and recreate the local database, migrate and seed it.
reset-db: db
    cd backend && cargo sqlx database reset -y
    just seed

# Everything CI runs.
check:
    cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
    cd backend && cargo sqlx prepare --check -- --all-targets
    cd backend && cargo run --bin data -- check
    cd frontend && npx prettier --check . && npm run lint && npm run typecheck && npm test && npm run build
    cd deploy && npm run typecheck && npm test

# Regenerate the OpenAPI snapshot and the TypeScript client after an API change.
openapi:
    cd backend && UPDATE_OPENAPI=1 cargo test --test openapi
    cd frontend && npx openapi-typescript ../backend/openapi.json -o src/api/schema.d.ts
