# URL Checker — Backend

Async URL-checking service built with **NestJS + TypeScript**. Submit a list of
URLs, the service runs HTTP `HEAD` requests in the background (max 5 concurrent
per job, multiple jobs run in parallel), and you poll for results.

In-memory storage only — no database required.

## Requirements

- Node.js 20+
- npm

## Install & run

```bash
npm install
npm run build
npm run start:prod        # node dist/main.js

# or in dev (watch mode):
npm run start:dev
```

The server listens on `PORT` (default `3000`).

- Swagger UI: `http://localhost:3000/api/docs`
- Health:     `http://localhost:3000/api/health`

## Configuration (env vars)

Copy `.env.example` → `.env` and adjust as needed.

| Variable          | Default | Meaning                                        |
| ----------------- | ------- | ---------------------------------------------- |
| `PORT`            | `3000`  | HTTP port                                      |
| `MAX_CONCURRENCY` | `5`     | Max concurrent HEAD requests **per job**       |
| `DELAY_MAX_MS`    | `10000` | Upper bound of the artificial pre-save delay   |
| `HEAD_TIMEOUT_MS` | `10000` | HEAD request header/body timeout               |
| `CORS_ORIGIN`     | `*`     | Allowed CORS origin                            |
| `LOG_LEVEL`       | `info`  | Log level                                      |

## API

| Method   | Path             | Description                                   |
| -------- | ---------------- | --------------------------------------------- |
| `POST`   | `/api/jobs`      | Create a job. Body `{ "urls": [...] }` → `{ jobId }` (201). |
| `GET`    | `/api/jobs`      | List job summaries (newest first).            |
| `GET`    | `/api/jobs/:id`  | Full job detail (404 if missing).             |
| `DELETE` | `/api/jobs/:id`  | Cancel a job (idempotent). Returns full detail (200). |
| `GET`    | `/api/health`    | `{ "status": "ok" }`                          |

### Status enums

- Job: `pending | in_progress | completed | cancelled | failed`
  (`failed` is reserved for internal engine errors — a job whose URLs all
  error out still ends `completed`.)
- URL: `pending | in_progress | success | error | cancelled`

## Tests

```bash
npm test           # unit specs
npm run test:e2e   # supertest e2e (deterministic, fake URL checker)
npm run lint
```

## Docker

```bash
# Compose (recommended) — builds the image and runs with a health check:
docker compose up --build

# or build & run by hand:
docker build -t url-checker-backend .
docker run -p 3000:3000 url-checker-backend
```

## Quick smoke test

```bash
curl -s localhost:3000/api/health
# {"status":"ok"}

JOB=$(curl -s -X POST localhost:3000/api/jobs \
  -H 'content-type: application/json' \
  -d '{"urls":["https://example.com","https://nestjs.com"]}' | jq -r .jobId)

curl -s localhost:3000/api/jobs/$JOB | jq
curl -s -X DELETE localhost:3000/api/jobs/$JOB | jq
```
