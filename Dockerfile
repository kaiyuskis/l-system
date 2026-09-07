# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY shared/ /app/shared/
RUN npm run build

FROM rust:1-bookworm AS native
WORKDIR /app
COPY backend/ backend/
COPY shared/ shared/
RUN --mount=type=cache,target=/usr/local/cargo/registry --mount=type=cache,target=/app/backend/target \
    cargo build --manifest-path backend/Cargo.toml --locked --release && cp backend/target/release/komorebi /usr/local/bin/komorebi

FROM native AS test
COPY --from=web /usr/local/ /usr/local/
COPY --from=web /app/web/ /app/web/
RUN cd web && npm test
RUN --mount=type=cache,target=/usr/local/cargo/registry --mount=type=cache,target=/app/backend/target \
    cargo test --manifest-path backend/Cargo.toml --locked

FROM native AS benchmark
RUN --mount=type=cache,target=/usr/local/cargo/registry --mount=type=cache,target=/app/backend/target \
    cargo run --manifest-path backend/Cargo.toml --locked --release --example benchmark

FROM debian:bookworm-slim AS runtime
WORKDIR /app
ENV HOST=0.0.0.0 PORT=3000 STATIC_DIR=/app/web/dist
COPY --from=native /usr/local/bin/komorebi /usr/local/bin/komorebi
COPY --from=web /app/web/dist/ web/dist/
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s CMD ["komorebi", "--healthcheck"]
CMD ["komorebi"]
