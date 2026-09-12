# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY shared/ /src/shared/
RUN npm run build

FROM rust:1.98-bookworm AS rust-build
WORKDIR /src
COPY backend/ backend/
COPY shared/ shared/
RUN cargo build --release --locked --manifest-path backend/Cargo.toml

FROM debian:bookworm-slim AS runtime
WORKDIR /app
COPY --from=rust-build /src/backend/target/release/komorebi /usr/local/bin/komorebi
COPY --from=web-build /src/web/dist/ /app/web/dist/
ENV HOST=0.0.0.0 PORT=5173 STATIC_DIR=/app/web/dist
RUN mkdir -p /app/data && chown 10001:10001 /app/data
USER 10001:10001
EXPOSE 5173
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["komorebi", "--healthcheck"]
CMD ["komorebi"]
