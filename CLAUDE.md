# BreakingJam — rules for Claude Code

Read `ARCHITECTURE_v0.1.md` first; it is the source of truth for scope, schema and routes. `DESIGN.md` is the source of truth for UI. This file is about how code is written.

## Principles
- Stupid simple. The simplest code that passes the tests and reads top to bottom. If a reviewer needs a diagram, it is too complex.
- Less is more. Fewer lines, fewer types, fewer files, fewer crates. Deleting code is a valid change.
- Idiomatic Rust only. `Option`/`Result` with `?`, iterators over loops where clearer, enums over bool flags, newtypes over primitives with meaning, `impl Trait` over boxing, borrowing over cloning. No OOP emulation, no getters/setters, no `Rc<RefCell>` in server code.
- Fix smells on sight. Duplicated code, long parameter lists, deep nesting, boolean parameters, stringly-typed values, dead code, `unwrap` outside tests, `clone` to silence the borrow checker, `#[allow]` without a reason. When you touch a file and see one, fix it in the same change and say so.

## Design patterns
- Default is no pattern: a module of plain types and functions.
- Use a named pattern only when it removes real complexity. Allowed and expected here: newtype, an enum state machine for event status (`EventStatus::apply`; the status comes from the database at runtime, so typestate cannot check it), extractor (axum), repository-free data access (sqlx queries in `db/`, no trait layer), builder only via `derive` crates.
- If a file deliberately uses a pattern, say so in the first line: `//! Pattern: extractor — the session cookie becomes a handler argument.` Otherwise no header.
- Any new `trait` or generic parameter needs a one-line justification in the PR description. One implementation = no trait.

## Documentation
- One-liners only. `///` on every public item, one sentence, what not how. No paragraphs, no examples in docs, no `# Arguments` sections.
- `//!` at the top of a module: one line saying what the module owns.
- Inline `//` comments explain *why*, never *what*. If the code needs a *what* comment, rewrite the code.

## Dependencies
- Before adding a crate, ask: can this be done in under ~30 lines of plain Rust or with a crate already in `Cargo.toml`? If yes, do that.
- Each new crate goes in a commit of its own with one line in the message saying what it replaces and why it is worth it.
- Prefer crates that are: maintained in the last 12 months, > 1M downloads, few transitive deps. Check `cargo tree -d` for duplicates after adding.
- Features off by default; enable only what is used.
- Same rule for npm: no package for something `fetch`, a 10-line hook, or Tailwind already does.

## Code shape
- Handlers: validate → call `db`/`domain` → map to response. Under ~30 lines or split.
- Functions: one job, under ~40 lines, ≤ 4 parameters (else a struct).
- Modules: one aggregate each. No `utils.rs`, no `helpers.rs`, no `common.rs`.
- Errors: `AppError` everywhere in the API layer; `thiserror` for domain errors; `anyhow` only in `main` and the seed binary.
- SQL: `sqlx::query!`/`query_as!` only. No string-built SQL, no ORM.
- Tests: integration tests per handler with `#[sqlx::test]`; unit tests next to the domain code. No mocks of the database.
- Formatting and lints: `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `eslint` + `prettier` with defaults. Never disable a lint to make it pass.

## Workflow
- One §11 step per session. Stop after each and show the diff summary; do not start the next step unasked.
- Show migrations as SQL before applying them.
- Run `cargo test` and `npm test` before saying a step is done. Say what you ran and whether it passed.
- Never commit; the author reviews and commits. Never touch `.env`.
- When the architecture doc and this file disagree with what you think is better, say so in one line and follow the docs.