# syntax=docker/dockerfile:1

# Multi-stage build with cargo-chef so dependency layers are cached
# independently of application source changes.
FROM rust:1.99-slim-trixie AS chef
RUN cargo install cargo-chef --locked --version 0.1.71
WORKDIR /app
# Toolchain file first so `cook` and `build` use the same toolchain and share the dep cache.
COPY rust-toolchain.toml .
RUN rustup toolchain install

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
# sqlx macros check queries against the committed .sqlx data, no database at build time.
ENV SQLX_OFFLINE=true
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin breakingjam

FROM gcr.io/distroless/cc-debian13:nonroot AS runtime
COPY --from=builder /app/target/release/breakingjam /usr/local/bin/breakingjam
ENV APP_PORT=8080 \
    LOG_FORMAT=json
# The commit a deploy builds from (deploy.yml sets it): `/api/health` reports it, and it makes
# each release a new image, so every deploy rolls the containers. Last, to rebuild nothing else.
ARG RELEASE=""
ENV RELEASE=${RELEASE}
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/breakingjam"]
