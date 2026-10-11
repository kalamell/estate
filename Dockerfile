# REGISTRY เปลี่ยนได้ถ้าโดน Docker Hub จำกัดจำนวนครั้ง เช่น --build-arg REGISTRY=mirror.gcr.io/library/
ARG REGISTRY=docker.io/library/

# ---------- หน้าเว็บ ----------
FROM ${REGISTRY}node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- เซิร์ฟเวอร์ Rust ----------
FROM ${REGISTRY}rust:1-bookworm AS server
WORKDIR /src
COPY Cargo.toml Cargo.lock build.rs ./
COPY migrations ./migrations
COPY src ./src
RUN cargo build --release --locked

# ---------- ตัวรันจริง ----------
FROM ${REGISTRY}debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata sqlite3 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /app estate
WORKDIR /app
COPY --from=server /src/target/release/estate /app/estate
COPY --from=web /web/dist /app/frontend/dist
ENV TZ=Asia/Bangkok \
    BIND=0.0.0.0:3000 \
    DATABASE_URL=sqlite:///data/estate.db?mode=rwc \
    UPLOAD_DIR=/data/uploads \
    DATA_DIR=/data \
    STATIC_DIR=/app/frontend/dist \
    SEED_DEMO=0 \
    COOKIE_SECURE=1 \
    TRUST_PROXY=1
RUN mkdir -p /data && chown estate /data
USER estate
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["/app/estate"]
