# banking-transaction-system

Backend service for concurrent banking transactions with optimistic concurrency control and real-time event notifications.

## Quick Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` with PostgreSQL connection:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME
PORT=5000
```

3. Create required tables:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

4. Start the API server:

```bash
npm run dev
```

## API Endpoints

- `GET /api/accounts`
- `POST /api/accounts/create`
- `GET /api/accounts/:id`
- `POST /api/transactions/deposit`
- `POST /api/transactions/withdraw`
- `POST /api/transactions/transfer`

## Real-Time Events (Socket.IO)

Clients can subscribe to the server and receive:

- `transaction:created`
- `balance:updated`
- `transaction:failed`

Socket server runs on the same host/port as the API.

## Load Testing (k6)

Step 1. Install k6 (one-time):

```bash
sudo gpg -k
sudo apt-get update
sudo apt-get install -y gnupg ca-certificates
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install -y k6
```

Step 2. Run a default load scenario:

```bash
npm run load:test
```

Step 3. Run assignment-level concurrency (1000 VUs):

```bash
npm run load:test:1000
```

Optional environment overrides:

- `BASE_URL` (default: `http://localhost:5000`)
- `VUS` (default: `1000`)
- `DURATION` (default: `30s`)
- `TEST_ACCOUNT_ID` (default: `ACC_LOAD_001`)
- `INITIAL_BALANCE` (default: `250000`)

Script location: `load-tests/concurrency.js`

### Latest Concurrent Test Summary

A `k6` concurrency test was executed with `1000` virtual users for `30s` using `load-tests/concurrency.js`.

- Setup passed successfully and the test account was created or reused.
- Total HTTP requests: `501`
- Failed requests: `89.82%` (`450` out of `501`)
- Average response time: `30.75s`
- 95th percentile response time: `56.99s`
- Internal server error rate: `0.00%`
- Teardown timed out after `60s`, indicating the system remained overloaded after the main run.

Result:

The application stayed free of internal server errors, but it did not meet the performance threshold under `1000` concurrent users. The `http_req_duration` threshold failed because `p(95)` was far above the expected `2000ms`, and the high request failure rate indicates substantial performance and scalability limits at this load level.

## API Documentation

Step 1. Open API spec:

- `docs/openapi.yaml`

Step 2. (Optional) Preview with Swagger Editor:

1. Open https://editor.swagger.io/
2. Import `docs/openapi.yaml`

The spec documents accounts APIs, transaction APIs, response codes, and realtime event payload descriptions.

## Docker Run

Step 1. Build and start API + PostgreSQL:

```bash
docker compose up --build
```

Step 2. Verify API health:

```bash
curl http://localhost:5000/
```

`docker-compose.yml` automatically initializes database schema from `db/schema.sql`.
