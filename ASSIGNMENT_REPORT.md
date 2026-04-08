# Assignment Report: Banking Transaction System

Date: April 6, 2026

## 1. Architecture Summary

This project is a layered backend API built with Node.js, Express, and PostgreSQL (Supabase-compatible):

- Routing layer:
  - `src/routes/account.routes.js`
  - `src/routes/transaction.routes.js`
- Controller layer:
  - `src/controllers/account.controller.js`
  - `src/controllers/transaction.controller.js`
- Service layer:
  - `src/services/transaction.service.js`
- Data access:
  - `src/config/db.js` (`pg` Pool with SSL support for Supabase)
- Real-time transport:
  - `src/server.js` + `src/realtime/socket.js` (Socket.IO)
- API documentation:
  - `docs/openapi.yaml` + `/api-docs`

Data model is defined in `db/schema.sql` with:

- `accounts(account_id, holder_name, balance, version, ...)`
- `transactions(transaction_type, source_account_id, destination_account_id, amount, status, details, ...)`

## 2. OCC (Optimistic Concurrency Control) Approach

Concurrency safety is handled in transaction services using database-level transactions and version checks:

1. Start DB transaction (`BEGIN`).
2. Read account row including current `version`.
3. Compute new balance.
4. Update with version guard:
   - `UPDATE accounts SET balance = $1, version = version + 1 WHERE account_id = $2 AND version = $3`
5. If `rowCount === 0`, return `409 VERSION_CONFLICT`.
6. Insert transaction audit record in `transactions`.
7. `COMMIT` on success; `ROLLBACK` on error.

This prevents lost updates under concurrent requests and keeps account balances consistent.

## 3. Test Evidence

### 3.1 Unit Tests

Command:

```bash
npm test
```

Result:

- test files: `2`
- passed: `2`
- failed: `0`

Covered areas:

- account controller validation and conflict handling
- transaction service flows (withdraw/deposit/transfer, rollback, version conflict path)

### 3.2 Live API Smoke Checks (Supabase-backed)

An isolated server instance was tested on port `5001` with Supabase `.env` configuration.

Verified responses:

- `GET /` -> `200`
- `GET /docs/openapi.yaml` -> `200`
- `GET /api-docs` -> `200`
- `GET /api/accounts` -> `200`
- `POST /api/accounts/create` -> `201`
- `GET /api/accounts/:id` -> `200`
- `POST /api/transactions/deposit` -> `200`
- `POST /api/transactions/withdraw` -> `200`
- `POST /api/transactions/transfer` -> `200`

## 4. Load Test Evidence

Load-test script is implemented at:

- `load-tests/concurrency.js`

Supported commands:

```bash
npm run load:test
npm run load:test:1000
```

Concurrent test executed:

- tool: `k6`
- scenario: `concurrent_transactions`
- virtual users: `1000`
- duration: `30s`

Observed results:

- setup check passed: `setup account created or already exists`
- total HTTP requests: `501`
- failed requests: `89.82%` (`450` of `501`)
- average response time: `30.75s`
- median response time: `30.9s`
- p(90): `54.15s`
- p(95): `56.99s`
- max response time: `59.83s`
- internal server errors: `0.00%`
- teardown timed out after `60s`

Threshold evaluation:

- `http_req_duration`: failed because `p(95)=56.99s` exceeded the target `p(95)<2000ms`
- `internal_errors`: passed with `rate=0.00%`

Interpretation:

The system remained free from internal `5xx` server errors during the observed requests, but it did not sustain the assignment-level load successfully. Under `1000` concurrent users, response times became extremely high, most requests failed, and the teardown phase could not complete within the timeout window. This indicates that the application is functionally operational but currently has significant performance and scalability limitations under heavy concurrent traffic.

## 5. Conclusion

The assignment implementation is complete for core scope:

- account APIs
- transaction APIs (deposit/withdraw/transfer)
- OCC/version conflict handling
- transaction recording
- realtime event emission
- OpenAPI docs
- unit tests

Load testing evidence has now been captured, and the current improvement area is system performance under heavy concurrent load.
