# KaffePOS Container Guide

Date: 2026-05-24

## Frontend Image

`frontend.Dockerfile` builds the Vite app with `npm ci`, copies only `dist`, runs as the non-root `node` user, and exposes a healthcheck for the static server.

## Backend Image

`backend/Dockerfile` uses a build stage plus runtime stage, installs production dependencies only in runtime, runs as non-root `node`, and exposes `/health` as Docker healthcheck.

## Docker Ignore Rules

Root `.dockerignore` and `backend/.dockerignore` prevent secrets, local dependencies, build outputs, coverage, Android build outputs, and editor files from entering images.

## Runtime Rules

- Inject `.env` values through hosting runtime, not image layers.
- Do not copy `.env` into containers.
- Keep uploads/private generated files outside ephemeral container filesystem or mount persistent storage.
- Use HTTPS termination at load balancer/CDN/platform layer.
- Limit `/metrics` access to trusted networks where hosting supports it.

## Local Monitoring Compose

`docker-compose.monitoring.yml` is for Prometheus/Grafana/exporters. Set `GRAFANA_ADMIN_PASSWORD` and `POSTGRES_EXPORTER_DSN` securely before use.
