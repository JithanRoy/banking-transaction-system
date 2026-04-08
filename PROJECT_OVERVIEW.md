# Banking System Project Overview

## Summary

This project is a Node.js + Express backend for concurrent banking operations with:

- account creation and retrieval
- deposit, withdraw, and transfer transactions
- optimistic concurrency control (OCC) using account `version`
- real-time transaction/balance events via Socket.IO
- OpenAPI documentation and Docker setup

The active application code is under `src/`. Root-level `app.js` and `server.js` are lightweight re-exports/entry wrappers.

## Stack

- Node.js (ES modules)
- Express
- PostgreSQL via `pg` (works with Supabase PostgreSQL)
- Socket.IO
- `dotenv`, `cors`
- Node built-in test runner (`node --test`)

## Current Project Structure

```text
src/
  app.js
  server.js
  config/
    db.js
  controllers/
    account.controller.js
    transaction.controller.js
  routes/
    account.routes.js
    transaction.routes.js
  services/
    transaction.service.js
  realtime/
    socket.js
  utils/
    errors.js

db/
  schema.sql
docs/
  openapi.yaml
load-tests/
  concurrency.js
test/
  account.controller.test.js
  transaction.service.test.js
```

## Runtime Flow

1. `src/server.js` creates HTTP server + Socket.IO server, then starts listening on `PORT` (default `5000`).
2. `src/app.js` configures middleware and routes:
   - `GET /`
   - `GET /api-docs`
   - static docs under `/docs`
   - `/api/accounts`
   - `/api/transactions`
3. `src/config/db.js` creates a `pg` pool from `DATABASE_URL`, with optional SSL (`DATABASE_SSL=true`) and Supabase host detection.

## Implemented API

- `GET /api/accounts`
- `POST /api/accounts/create`
- `GET /api/accounts/:id`
- `POST /api/transactions/deposit`
- `POST /api/transactions/withdraw`
- `POST /api/transactions/transfer`

## OCC and Transaction Safety

`src/services/transaction.service.js` performs database transactions with:

- `BEGIN` / `COMMIT` / `ROLLBACK`
- account existence and balance validation
- OCC update pattern:
  - `UPDATE accounts SET ... WHERE account_id = $2 AND version = $3`
  - if update affects zero rows, returns `VERSION_CONFLICT` (`409`)
- transaction journaling into `transactions` table

## Real-Time Events

`src/controllers/transaction.controller.js` emits:

- `transaction:created`
- `balance:updated`
- `transaction:failed`

using `src/realtime/socket.js`.

## Database Schema

`db/schema.sql` contains:

- `accounts` table with `version` and non-negative `balance` constraint
- `transactions` table with transaction type/status/details
- supporting indexes for transaction lookup

## Testing and Validation

- Unit tests in `test/` run with `npm test`
- OpenAPI spec at `docs/openapi.yaml`
- Swagger UI available at `/api-docs`
- Load test script at `load-tests/concurrency.js` (k6)

## Current Status

This codebase is functionally complete for the assignment scope (accounts, transactions, OCC, realtime, docs, tests, load script). Remaining work is mainly submission packaging: final report + load test result evidence from an environment with `k6` installed.
