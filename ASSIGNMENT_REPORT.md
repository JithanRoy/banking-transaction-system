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
- `POST /api/accounts` -> `201`
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

Current environment note:

- `k6` is not installed in this environment (`k6: command not found`), so full load-run metrics were not captured here.
- The script and npm tasks are ready; run from a machine with `k6` installed to capture final throughput/latency/conflict-rate evidence.

## 5. Conclusion

The assignment implementation is complete for core scope:

- account APIs
- transaction APIs (deposit/withdraw/transfer)
- OCC/version conflict handling
- transaction recording
- realtime event emission
- OpenAPI docs
- unit tests

Remaining submission step is generating and attaching `k6` load-test run output from a `k6`-enabled environment.
