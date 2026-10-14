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
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin breakingjam

FROM gcr.io/distroless/cc-debian13:nonroot AS runtime
COPY --from=builder /app/target/release/breakingjam /usr/local/bin/breakingjam
ENV APP_PORT=8080 \
    LOG_FORMAT=json
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/breakingjam"]
