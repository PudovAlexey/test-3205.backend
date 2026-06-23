# URL Checker — бэкенд

Сервис асинхронной проверки URL на **NestJS + TypeScript**. Принимает список
URL, в фоне отправляет HTTP `HEAD`-запросы (не более 5 одновременно на одно
задание, несколько заданий обрабатываются параллельно), а статус и результаты
забираются опросом.

Хранение — только в памяти, база данных не нужна.

## Архитектура

Луковичная (onion) архитектура с инверсией зависимостей через порты —
абстрактные классы выступают DI-токенами. Зависимости направлены строго внутрь:
`presentation → application → domain ← infrastructure`. О конкретных реализациях
знает только composition root (`jobs.module.ts`).

```
src/
  domain/jobs/         # ядро: сущности (Job, UrlResult) и порты (JobRepository, UrlChecker)
  application/jobs/    # сценарии: JobsService + фоновый JobsProcessor
  infrastructure/jobs/ # адаптеры портов: InMemoryJobRepository, UndiciUrlChecker
  presentation/jobs/   # HTTP: контроллер + DTO
  jobs.module.ts       # composition root — связывает порты с реализациями
```

## Требования

- Node.js 20+
- npm

## Установка и запуск

```bash
npm install
npm run build
npm run start:prod        # node dist/main.js

# или в режиме разработки (watch):
npm run start:dev
```

Сервер слушает порт `PORT` (по умолчанию `3000`).

- Swagger UI: `http://localhost:3000/api/docs`
- Health:     `http://localhost:3000/api/health`

## Конфигурация (переменные окружения)

Скопируйте `.env.example` → `.env` и при необходимости поправьте значения.

| Переменная        | По умолчанию | Назначение                                          |
| ----------------- | ------------ | --------------------------------------------------- |
| `PORT`            | `3000`       | HTTP-порт                                           |
| `MAX_CONCURRENCY` | `5`          | Макс. число одновременных HEAD-запросов **на задание** |
| `DELAY_MAX_MS`    | `10000`      | Верхняя граница искусственной задержки перед сохранением результата |
| `HEAD_TIMEOUT_MS` | `10000`      | Таймаут заголовков/тела HEAD-запроса                |
| `CORS_ORIGIN`     | `*`          | Разрешённый источник CORS                           |
| `LOG_LEVEL`       | `info`       | Уровень логирования                                 |

## API

| Метод    | Путь             | Описание                                            |
| -------- | ---------------- | --------------------------------------------------- |
| `POST`   | `/api/jobs`      | Создать задание. Тело `{ "urls": [...] }` → `{ jobId }` (201). |
| `GET`    | `/api/jobs`      | Список заданий (свежие сверху).                     |
| `GET`    | `/api/jobs/:id`  | Полная информация о задании (404, если не найдено). |
| `DELETE` | `/api/jobs/:id`  | Отменить задание (идемпотентно). Возвращает полную информацию (200). |
| `GET`    | `/api/health`    | `{ "status": "ok" }`                                |

### Статусы

- Задание (Job): `pending | in_progress | completed | cancelled | failed`
  (`failed` — только для внутренних ошибок движка; задание, у которого все URL
  завершились ошибкой, всё равно получает статус `completed`.)
- URL: `pending | in_progress | success | error | cancelled`

## Тесты

```bash
npm test           # модульные тесты
npm run test:e2e   # e2e на supertest (детерминированные, с фейковым URL-checker)
npm run lint
```

## Docker

```bash
# Compose (рекомендуется) — собирает образ и запускает с health-check:
docker compose up --build

# или вручную:
docker build -t url-checker-backend .
docker run -p 3000:3000 url-checker-backend
```

## Быстрая проверка

```bash
curl -s localhost:3000/api/health
# {"status":"ok"}

JOB=$(curl -s -X POST localhost:3000/api/jobs \
  -H 'content-type: application/json' \
  -d '{"urls":["https://example.com","https://nestjs.com"]}' | jq -r .jobId)

curl -s localhost:3000/api/jobs/$JOB | jq
curl -s -X DELETE localhost:3000/api/jobs/$JOB | jq
```
