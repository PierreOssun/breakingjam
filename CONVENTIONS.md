# Conventions

Derived from `ARCHITECTURE.md` §10. That file wins on any conflict.

- **Rust**: `cargo fmt`, `cargo clippy -- -D warnings`, `thiserror` for typed errors, `anyhow` only at boundaries, no `unwrap` outside tests, `tracing` not `println`.
- **SQL**: compile-time checked `sqlx::query!` / `query_as!` only; no string-built SQL.
- **API**: JSON snake_case, RFC 3339 timestamps, ISO 3166-1 alpha-2 countries, error envelope `{ "error": { code, message, fields? } }`.
- **Git**: trunk-based, PRs into `main`, conventional commits (`feat:`, `fix:`, `chore:`…).
- **Versioning**: release tags follow the `Cargo.toml` version and are cut when CI is green.
- **Language**: code, comments, commits and docs in English.
- **Vocabulary**: "jam" in UI copy and i18n keys; `event` / `events` in code, DB and API paths.
