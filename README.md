# Concurrent Banking Transaction System (Backend)

A production-style Node.js + Express backend for safe, concurrent banking operations.

This project was built for a MERN assignment focused on transaction correctness under high concurrency, not only basic CRUD.

## What This Project Demonstrates

- Concurrency-safe `deposit`, `withdraw`, and `transfer` operations.
- Optimistic concurrency control (OCC) using `version` fields.
- SQL transaction boundaries (`BEGIN/COMMIT/ROLLBACK`) for atomic updates.
- Deadlock/retry handling for high-contention scenarios.
- Real-time events via Socket.IO for transaction and balance updates.
- API documentation via OpenAPI + Swagger UI.
- Unit tests plus load-testing script for concurrent traffic.

## Tech Stack

- Node.js (ESM)
- Express.js
- PostgreSQL (`pg`)
- Socket.IO
- OpenAPI (YAML)
- k6 for load testing

## Project Structure

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
    money.js

db/
  schema.sql
docs/
  openapi.yaml
load-tests/
  concurrency.js
test/
  account.controller.test.js
  transaction.service.test.js
  money.util.test.js
```

## How The System Works

### 1) Account Model

Each account stores:

- `id` (numeric, auto-generated)
- `account_id`
- `holder_name`
- `balance`
- `version`

`version` is incremented every successful balance update and is used to detect conflicting concurrent writes.

### 2) Concurrency Control Strategy

For monetary operations, the service:

1. Starts a DB transaction.
2. Reads account state (including `version`).
3. Computes the new balance with exact cents-based arithmetic.
4. Updates row with a `WHERE version = expectedVersion` guard.
5. Rolls back on mismatch (`409 VERSION_CONFLICT`) or business-rule failure.
6. Commits only when all related updates succeed.

For transfers, accounts are locked in deterministic order (`FOR UPDATE ORDER BY account_id`) to reduce deadlock risk. Retryable DB errors are retried with bounded attempts.

### 3) Real-Time Events

Socket.IO emits:

- `transaction:created`
- `balance:updated`
- `transaction:failed`

This lets clients reflect transaction outcomes immediately.

## Local Setup (Recommended)

### Prerequisites

- Node.js 20+
- PostgreSQL (local or hosted)

### Steps

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

```env
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME
DATABASE_SSL=false
```

Set `DATABASE_SSL=true` for managed DB providers that require SSL.

3. Apply schema:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

If your database was created before the `id` column was introduced, run this migration once:

```bash
psql "$DATABASE_URL" -f db/migrations/001_add_accounts_id_column.sql
```

4. Start server:

```bash
npm run dev
```

5. Verify health:

```bash
curl http://localhost:5000/
```

Expected response: `Banking API Running`

## Docker Setup (Alternative)

If you prefer containerized execution:

```bash
docker compose up --build
```

This starts:

- API on `http://localhost:5000`
- PostgreSQL on `localhost:5432`

Schema is auto-initialized from `db/schema.sql`.

## API Documentation

- Swagger UI: `http://localhost:5000/api-docs`
- OpenAPI file: `docs/openapi.yaml`
- Raw spec served by API: `http://localhost:5000/docs/openapi.yaml`

## Main Endpoints

### Accounts

- `POST /api/accounts/create`
- `GET /api/accounts`
- `GET /api/accounts/:id`
- `PUT /api/accounts/update/:id`
- `DELETE /api/accounts/:id`

### Transactions

- `POST /api/transactions/deposit`
- `POST /api/transactions/withdraw`
- `POST /api/transactions/transfer`

## Quick Demo Flow

1. Create accounts:

```bash
curl -X POST http://localhost:5000/api/accounts/create \
  -H "Content-Type: application/json" \
  -d '{"accountId":"ACC1001","holderName":"Alice","balance":1000}'

curl -X POST http://localhost:5000/api/accounts/create \
  -H "Content-Type: application/json" \
  -d '{"accountId":"ACC1002","holderName":"Bob","balance":500}'
```

2. Deposit:

```bash
curl -X POST http://localhost:5000/api/transactions/deposit \
  -H "Content-Type: application/json" \
  -d '{"accountId":"ACC1001","amount":100}'
```

3. Withdraw:

```bash
curl -X POST http://localhost:5000/api/transactions/withdraw \
  -H "Content-Type: application/json" \
  -d '{"accountId":"ACC1001","amount":50}'
```

4. Transfer:

```bash
curl -X POST http://localhost:5000/api/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{"fromAccountId":"ACC1001","toAccountId":"ACC1002","amount":75}'
```

## Running Tests

```bash
npm test
```

Current test suite covers:

- Account input handling and API behavior.
- Transaction service success/failure paths.
- OCC conflict path and rollback behavior.
- Money parsing/precision utility behavior.

## Load Testing (1000 Concurrent Users)

### Install k6

On Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y gnupg ca-certificates
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install -y k6
```

### Execute load tests

Default script:

```bash
npm run load:test
```

Assignment-scale run:

```bash
npm run load:test:1000
```

Environment overrides:

- `BASE_URL` (default `http://localhost:5000`)
- `VUS` (default `1000`)
- `DURATION` (default `30s`)
- `TEST_ACCOUNT_ID` (default `ACC_LOAD_001`)
- `INITIAL_BALANCE` (default `250000`)

## Notes for Evaluators / Employers

- This backend prioritizes correctness and data integrity under concurrency.
- The design intentionally uses explicit SQL transaction management and OCC over simplistic in-memory locking.
- The project includes real-time event emission and load-test script to validate behavior under contention.
- For full assignment submission context, see:
  - `ASSIGNMENT_REPORT.md`
  - `PROJECT_OVERVIEW.md`

## Author Notes

This repository currently focuses on backend concerns from the assignment. Frontend integration can subscribe to Socket.IO events and consume the documented REST APIs.
